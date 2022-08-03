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
    private config: P2PInternalConfig;
    private network: Network;
    constructor(p2p: Communicator, config: P2PInternalConfig, net: Network) {
        super();
        this.p2p = p2p;
        this.thisNode = new Multiaddr(this.p2p._node_addr);
        this.config = config;
        this.network = net;
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


    private async handleReports(id: string): Promise<AggregateResult> {
        const reports = this.requestReports.get(id);
        if (!reports) {
            throw new Error("Reports not found")
        };
        let roundId = this.toBeTransmittedRound.get(id)
        if (!roundId) {
            throw new Error("Round not found")
        };
        const request = this.requests.get(id);
        if (!request) {
            throw new Error("Request not found")
        };

        // console.log("@@@handleReports: received reports", reports)

        for (let r of reports) {
            if (r.round != Number(roundId)) {
                reports.delete(r)
            }
        }

        const requiredAmountOfSignatures = Math.floor((this.p2p._peers.size + 1) / 2) + 1;
        if (reports.size < requiredAmountOfSignatures) {
            // console.log("@@@handleReports:  filtered reports", reports)
            throw new Error(`@@@handleReports: ${request.internalId}, round: ${roundId} --- Not enough signatures`);

        }

        logger.debug(`[${LOG_NAME}-${id}] Received enough signatures`);
        
        for(let peer of this.p2p._peers){
            if(!await this.p2p.connect(new Multiaddr(peer))){
                this.p2p._retry.add(peer);
                this.p2p._peers.delete(peer)
            }
        }
        console.log(`@@@handleReports: peers ${request.internalId}: `, this.p2p._peers)
        console.log(`@@@handleReports: retry ${request.internalId}: `, this.p2p._retry)
        const leader = electLeader(this.p2p, Big(roundId));


        // Round id can randomly be modified so we should only use it for reelecting a leader

        logger.info(`**Chosen leader for round ${roundId} : ${leader} : ${id}`)
        console.log("**thisNode", this.thisNode)
        const isResolved = this.checkStatusCallback.get(id)
        if(!isResolved) {
            throw new Error("isResolved not found")
        }
        if(await isResolved()){
            throw new Error(`@@@@@handleReports: already resolved -- round: ${roundId} , id: ${request.internalId}`)
            
        }
        // console.log("@@@handleReports:  HANDLED REPORTS: ", reports)

        if (this.thisNode.equals(leader)) {
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
            console.log(`@@@@@@@@aggregate --- got the same round id = ${request.internalId}, hash = ${hashFeedId}`)
    
            // if we get the same round, we wait for two more iterations before processing it again
            let timesWeGotThisRound = this.timesWeGotThisRound.get(request.internalId)
            if(timesWeGotThisRound){
                this.timesWeGotThisRound.set(request.internalId, (timesWeGotThisRound + 1))

            }else{
                throw new Error("Didn't get this round before")
            }
            // process at timesWeGotThisRound = 3, 7, 11
            if((timesWeGotThisRound % 4) < 3){ // skip two iterations before processing the same round again
                throw new Error(`@@aggregate: ${request.internalId} Got the same roundId - Wait for another ${3 - timesWeGotThisRound} iterations to process this round again`)
            }
                   
        }
        await this.p2p.send(`/send/data`, [
            fromString(JSON.stringify(p2pMessage)),
        ]);
        logger.info(`[${LOG_NAME}-${request.internalId}] Sent data to peers: ${data}`);

        let reports = this.requestReports.get(request.internalId) ?? new Set()


        console.log("@@@aggregate: previously received reports", reports)
        for (let r of reports) {
            if (((r.round == p2pMessage.round) && (r.signer == p2pMessage.signer)) || (r.round < Number(roundId))) {
                // console.log("@@@aggregate:  deleting old unsuccessful signatures or already transmitted round", r)
                reports.delete(r)
            }
        }
        reports.add(p2pMessage);
        this.requestReports.set(request.internalId, reports);


        const requiredAmountOfSignatures = Math.floor((this.p2p._peers.size + 1) / 2) + 1;
        let trials = 3;
        // wait for up to 60 seconds for enough sigs, if we didn't receive enough sigs we'll retry in the next iteration
        // await this.receivedEnoughSigs(async () => {
        //     console.log(`waitng for enough sigs ${request.internalId}`)
        //     await sleep(20_000)
        //     let temp = this.requestReports.get(request.internalId);
        //     trials -= 1
        //     // console.log("@@@@@temp", temp)
        //     if (((temp != undefined) && (temp.size >= requiredAmountOfSignatures)) || (trials == 0)) {
        //         return true;
        //     } else {
        //         return false
        //     }

        // })
        while(trials > 0){
            console.log("**waiting for enough sigs")
            await sleep(20_000)
            let temp = this.requestReports.get(request.internalId);
            trials -= 1;
            if (((temp != undefined) && (temp.size >= requiredAmountOfSignatures)) || (trials <= 0)) {
                break;
            }
        }
        // console.log("-----aggregated reports: ", this.requestReports.get(request.internalId))
        try {
            return await this.handleReports(request.internalId)

        } catch (err) {
            throw err
        }


    }

    // async receivedEnoughSigs(cond: () => any) {
    //     return new Promise<void>((resolve) => {
    //         let interval = setInterval(() => {
    //             if (!cond()) {
    //                 return
    //             }

    //             clearInterval(interval)
    //             resolve()
    //         }, 2000)
    //     })
    // }


}
