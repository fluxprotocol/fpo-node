import Big from "big.js";
import { Multiaddr } from "multiaddr";
import BufferList from "bl/BufferList";
import { fromString, toString } from 'uint8arrays';

import Communicator from './communication';
import logger from "../services/LoggerService";
import { P2PDataRequest } from "../modules/p2p/models/P2PDataRequest";
import { arrayify, solidityKeccak256 } from "ethers/lib/utils";
import { extractP2PMessage, P2PMessage } from './models/P2PMessage';
import EventEmitter from "events";
import { P2PVersion } from "./models/P2PVersion";
import { P2PInternalConfig } from "../modules/p2p/models/P2PConfig";
import { Network } from "../models/Network";
import { sleep } from "../services/TimerUtils";
import { getMinSignersForPair } from "../modules/p2p/services/P2PRequestService";

const LOG_NAME = 'p2p-aggregator';

export function electLeader(p2p: Communicator, roundId: Big): Multiaddr {
    let peers = Array.from(p2p._peers);
    peers.push(p2p._node_addr);
    peers = peers.sort();

    const index = roundId.mod(peers.length);
    const elected = peers[index.toNumber()];

    return new Multiaddr(elected);
}

function hashPairSignatureInfo(hashFeedId: string, roundId: string, data: string, timestamp: number): string {
    return solidityKeccak256(
        ["bytes32", "uint256", "int192", "uint64"],
        [hashFeedId, roundId, data, timestamp]
    );
}

export interface AggregateResult {
    leader: boolean;
    reports: Set<P2PMessage>;
}

export default class P2PAggregator extends EventEmitter {
    private p2p: Communicator;
    private requestReports: Map<string, Set<P2PMessage>> = new Map();
    private requests: Map<string, P2PDataRequest> = new Map();
    private thisNode: Multiaddr;
    private checkStatusCallback: Map<string, () => Promise<boolean>> = new Map();
    private toBeTransmittedRound: Map<string, number> = new Map();
    private timesWeGotThisRound: Map<string, number> = new Map();
    private internalConfig: P2PInternalConfig;
    private network: Network;
    constructor(p2p: Communicator, internalConfig: P2PInternalConfig, network: Network) {
        super();
        this.p2p = p2p;
        this.thisNode = new Multiaddr(this.p2p._node_addr);
        this.network = network;
        this.internalConfig = internalConfig;
    }

    async init(): Promise<void> {
        this.p2p.handle_incoming('/send/data', this.handleIncomingData.bind(this));
        this.thisNode = new Multiaddr(this.p2p._node_addr);
    }


    private async handleIncomingData(peer: Multiaddr, connection: Multiaddr, source: AsyncIterable<Uint8Array | BufferList>) {
        const message = await extractP2PMessage(source);
        if (!message) return;
        //TODO: sometimes this is the port of the node itself or the port saved in in connection remoteAddress
        logger.debug(`[${LOG_NAME}-${message.id}] Received message from ${peer} ${this.requestReports.size}/${this.p2p._peers.size}`);
        let roundId = this.toBeTransmittedRound.get(message.id)

        let reports = this.requestReports.get(message.id) ?? new Set();
        // console.log("@@@@@handleIncomingData: prev reports", reports)
        // console.log(`@@@handleIncomingData: roundId = ${roundId}, msg.round = ${message.round}`)

        for (let r of reports) {
            if (((r.signer == message.signer) && (r.round == message.round))) {
                // console.log("@@@@@handleIncomingData: deleting old unsuccessful signatures", r)
                reports.delete(r)
            }
        }
        // console.log("@@@@@handleIncomingData: Adding received msg: ", message)
        reports.add(message);

        this.requestReports.set(message.id, reports);
        // console.log("@@@@@handleIncomingData reconstructed reports", reports)
    }


    private async handleReports(id: string, hashFeedId: string): Promise<AggregateResult> {
        let roundId = this.toBeTransmittedRound.get(id)
        if (!roundId) {
            throw new Error("Round not found")
        };
        const request = this.requests.get(id);
        if (!request) {
            throw new Error("Request not found")
        };
        const isResolved = this.checkStatusCallback.get(id)
        if (!isResolved) {
            throw new Error("isResolved not found")
        }

        const requiredAmountOfSignatures = await getMinSignersForPair(this.internalConfig, this.network, hashFeedId)
        let reports = this.requestReports.get(request.internalId)
        if (!reports) {
            throw new Error("Reports not found")
        };

        // filter old rounds
        for (let r of reports) {
            if (r.round != Number(roundId)) {
                reports.delete(r)
            }
        }
        if (reports.size < Number(requiredAmountOfSignatures)) {
            throw new Error(`@@@handleReports:----- Not enough signatures ${request.internalId}, round: ${roundId} , this.p2p._peers.size = ${this.p2p._peers.size}, this.p2p._retry.size = ${this.p2p._retry.size}, requiredAmountOfSignatures = ${requiredAmountOfSignatures}`);
        }

        for (let peer of this.p2p._peers) {
            if (!await this.p2p.connect(new Multiaddr(peer))) {
                this.p2p._retry.add(peer);
                this.p2p._peers.delete(peer)
            }
        }
        console.log(`@@@handleReports: peers ${request.internalId}: `, this.p2p._peers)
        console.log(`@@@handleReports: retry ${request.internalId}: `, this.p2p._retry)

        // Round id can randomly be modified so we should only use it for reelecting a leader
        const leader = electLeader(this.p2p, Big(roundId));
        logger.info(`**Chosen leader for round ${roundId} : ${leader} : ${id}`)
        console.log("**thisNode", this.thisNode)
        // console.log("@@@handleReports:  HANDLED REPORTS: ", reports)
        if (this.thisNode.equals(leader)) {
            if (await isResolved()) {
                throw new Error(`@@@@@handleReports: already resolved -- round: ${roundId} , id: ${request.internalId}`)
            }
            logger.debug(`[${LOG_NAME}-${request.internalId}] This node is the leader. Sending transaction across network and blockchain`);
            return {
                leader: true,
                reports,
            };
        } else {
            return {
                leader: false,
                reports,
            }
        }

    }
    async aggregate(node_version: P2PVersion, report_version: P2PVersion, request: P2PDataRequest, hashFeedId: string, data: string, roundId: Big, isRequestResolved: () => Promise<boolean>): Promise<AggregateResult> {
        // TODO: Maybe do a check where if the request already exist we should ignore it?
        const timestamp = Math.round(new Date().getTime() / 1000);
        const message = hashPairSignatureInfo(hashFeedId, roundId.toString(), data, timestamp);
        const signature = await request.targetNetwork.sign(arrayify(message));
        console.log(`+++++++++SIG = ${toString(signature)} , answer = ${data} , signer = ${request.targetNetwork.getWalletPublicAddress()},
            timestamp ${timestamp}, round ${roundId.toString()}, id ${request.internalId}`)
        const p2pMessage: P2PMessage = {
            data,
            signature: toString(signature),
            hashFeedId,
            id: request.internalId,
            timestamp,
            round: Number(roundId),
            signer: request.targetNetwork.getWalletPublicAddress(),
        };
        this.checkStatusCallback.set(request.internalId, isRequestResolved);
        this.requests.set(request.internalId, request);
        // console.log(`@@@aggregate:  ${this.toBeTransmittedRound.get(request.internalId)} , ${Number(roundId)}`)
        if ((this.toBeTransmittedRound.get(request.internalId) == undefined) || Number(roundId) > Number(this.toBeTransmittedRound.get(request.internalId))) {
            // console.log("@@@@@@@@aggregate ----setting roundid")
            this.toBeTransmittedRound.set(request.internalId, Number(roundId))
            this.timesWeGotThisRound.set(request.internalId, 1)

        } else {

            // if we get the same round, we skip 1 iteration before processing it again
            let timesWeGotThisRound = this.timesWeGotThisRound.get(request.internalId)
            if (timesWeGotThisRound) {
                this.timesWeGotThisRound.set(request.internalId, (timesWeGotThisRound + 1))
                timesWeGotThisRound += 1
                console.log(`@@@@@@@@aggregate --- got the same round id = ${request.internalId}, hash = ${hashFeedId}`)


            } else {
                throw new Error("Didn't get this round before")
            }
            // timesWeGotThisRound = 2, 3, 4, 5
            const skippedIterations = 1;
            if ((((timesWeGotThisRound - 2) % (skippedIterations + 1))) < skippedIterations) { // skip 1 iteration before processing the same round again
                throw new Error(`@@aggregate: ${request.internalId} Got roundId #${roundId} ${timesWeGotThisRound} times - Wait for ${skippedIterations - ((timesWeGotThisRound - 2) % (skippedIterations + 1))} iterations before processing this round again`)
            }

        }
        await this.p2p.send(`/send/data`, [
            fromString(JSON.stringify(p2pMessage)),
        ]);
        logger.info(`[${LOG_NAME}-${request.internalId}] Sent data to peers: ${data}`);

        let reports = this.requestReports.get(request.internalId) ?? new Set()


        // console.log("@@@aggregate: previously received reports", reports)
        for (let r of reports) {
            if (((r.round == p2pMessage.round) && (r.signer == p2pMessage.signer)) || (r.round < Number(roundId))) {
                // console.log("@@@aggregate:  deleting old unsuccessful signatures or already transmitted round", r)
                reports.delete(r)
            }
        }
        reports.add(p2pMessage);
        this.requestReports.set(request.internalId, reports);

        // wait for nodes to send sigs
        await sleep(40_000)

        // console.log("-----aggregated reports: ", this.requestReports.get(request.internalId))
        try {
            return await this.handleReports(request.internalId, hashFeedId)

        } catch (err) {
            throw err
        }


    }


}
