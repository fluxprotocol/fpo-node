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
        logger.debug(`[${LOG_NAME}-${message.id}] Received message from ${peer} ${this.requestReports.size}/${this.p2p._peers.size}`);
        // filter outdated reports
        let reports = this.requestReports.get(message.id) ?? new Set();
        for (let r of reports) {
            if (((r.signer == message.signer) && (r.round == message.round))) {
                reports.delete(r)
            }
        }
        reports.add(message);
        this.requestReports.set(message.id, reports);
    }


    private async handleReports(id: string, requiredAmountOfSignatures: Big): Promise<AggregateResult> {
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

        let reports = this.requestReports.get(request.internalId)
        if (!reports) {
            throw new Error("Reports not found")
        };

        for (let r of reports) {
            if (r.round != Number(roundId)) {
                reports.delete(r)
            }
        }
        if (reports.size < Number(requiredAmountOfSignatures)) {
            throw new Error(`@handleReports: Not enough signatures, request.internalId: ${request.internalId}, round: ${roundId} `);
        }

        for (let peer of this.p2p._peers) {
            if (!await this.p2p.connect(new Multiaddr(peer))) {
                this.p2p._retry.add(peer);
                this.p2p._peers.delete(peer)
            }
        }

        // Round id can randomly be modified so we should only use it for reelecting a leader
        const leader = electLeader(this.p2p, Big(roundId));
        if (this.thisNode.equals(leader)) {
            if (await isResolved()) {
                throw new Error(`@handleReports: already resolved -- round: ${roundId} , id: ${request.internalId}`)
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
        const timestamp = Math.round(new Date().getTime() / 1000);
        const message = hashPairSignatureInfo(hashFeedId, roundId.toString(), data, timestamp);
        const signature = await request.targetNetwork.sign(arrayify(message));
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
        if ((this.toBeTransmittedRound.get(request.internalId) == undefined) || Number(roundId) > Number(this.toBeTransmittedRound.get(request.internalId))) {
            this.toBeTransmittedRound.set(request.internalId, Number(roundId))
            this.timesWeGotThisRound.set(request.internalId, 1)

        } else {

            // if we get the same round, we skip 1 iteration before processing it again
            let timesWeGotThisRound = this.timesWeGotThisRound.get(request.internalId)
            if(!timesWeGotThisRound){
                throw new Error("timesWeGotThisRound not found")
            }
            this.timesWeGotThisRound.set(request.internalId, (timesWeGotThisRound + 1))
            timesWeGotThisRound += 1
            const skippedIterations = 1;
            if((((timesWeGotThisRound - 2) % (skippedIterations + 1))) < skippedIterations){ 
                throw new Error(`@aggregate: ${request.internalId} Got roundId#${roundId} ${timesWeGotThisRound} times - skip ${skippedIterations - ((timesWeGotThisRound - 2) % (skippedIterations + 1))} iteration before processing this round again`)
            }

        }
        await this.p2p.send(`/send/data`, [
            fromString(JSON.stringify(p2pMessage)),
        ]);
        logger.info(`[${LOG_NAME}-${request.internalId}] Sent data to peers: ${data}`);

        let reports = this.requestReports.get(request.internalId) ?? new Set()
        // delete outdated or resolved reports
        for (let r of reports) {
            if (((r.round == p2pMessage.round) && (r.signer == p2pMessage.signer)) || (r.round < Number(roundId))) {
                reports.delete(r)
            }
        }
        reports.add(p2pMessage);
        this.requestReports.set(request.internalId, reports);

        const requiredAmountOfSignatures = await getMinSignersForPair(this.internalConfig, this.network, hashFeedId)
        // wait for up to 2 mins for enough sigs
        let trials = 4;
        while(trials > 0){
            await sleep(30_000)
            let temp = this.requestReports.get(request.internalId);
            trials -= 1;
            if (((temp != undefined) && (temp.size >= Number(requiredAmountOfSignatures))) || (trials <= 0)) {
                break;
            }
        }

        try {
            return await this.handleReports(request.internalId, requiredAmountOfSignatures)

        } catch (err) {
            throw err
        }


    }


}
