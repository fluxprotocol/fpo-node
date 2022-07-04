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
import { getRoundIdForPair } from "../modules/p2p/services/P2PRequestService";
import { P2PInternalConfig } from "../modules/p2p/models/P2PConfig";



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
    private roundIds: Map<string, Big> = new Map();
    private thisNode: Multiaddr;
    private callbacks: Map<string, (value: AggregateResult) => void> = new Map();
    private checkStatusCallback: Map<string, () => Promise<boolean>> = new Map();
    private sentToPeers: Map<string, boolean> = new Map();
    private transmittedRound: Map<string, number> = new Map();
    private internalConfig : P2PInternalConfig;

    constructor(p2p: Communicator, config: P2PInternalConfig) {
        super();
        this.p2p = p2p;
        this.thisNode = new Multiaddr(this.p2p._node_addr);
        this.internalConfig = config;

    }

    async init(): Promise<void> {
        this.p2p.handle_incoming('/send/data', this.handleIncomingData.bind(this));
        this.thisNode = new Multiaddr(this.p2p._node_addr);
    }

    private async handleIncomingData(peer: Multiaddr, source: AsyncIterable<Uint8Array | BufferList>) {
        const message = await extractP2PMessage(source);
        if (!message) return;
        logger.debug(`[${LOG_NAME}-${message.id}] Received message from ${peer} ${this.requestReports.size}/${this.p2p._peers.size}`);
        console.log("**Received msg: ", message)

        const request = this.requests.get(message.id);

        let reports = this.requestReports.get(message.id) ?? new Set();
        if (this.transmittedRound.get(message.id) == undefined || ((this.transmittedRound.get(message.id) != undefined) && (this.transmittedRound.get(message.id) == message.round))) {
            console.log("**Adding received msg")
            reports.add(message);
        } else {
            console.log("**Discarding transmitted round")
            return;
        }
        
        if (!request) {
            if (reports.size == 0) {
                return;
            } else {
                this.requestReports.set(message.id, reports);
                logger.debug(`[${LOG_NAME}-${message.id}] Request could not be found yet, reports are being saved for future use.`);
                return;
            }
        }

        console.log("**previous reports: ", reports)

        if(!this.sentToPeers.get(message.id)){
            for (let r of reports){
                if (r.signer == request.targetNetwork.getWalletPublicAddress()){                    
                    await this.p2p.send(`/send/data`, [
                        fromString(JSON.stringify(r)),
                    ]);
                    logger.debug(`[${LOG_NAME}-${request.internalId}] ***Sent data to peers`);
                    console.log("*****sent", r )
                }
            }
        }
        
        if (this.p2p._retry.size == 0) {
            this.sentToPeers.set(request.internalId, true)
        }

        this.requestReports.set(message.id, reports);
        console.log("**reconstructed reports: ", reports)


        await this.handleReports(request);

    }

    private clearRequest(id: string) {
        this.requestReports.delete(id);
        this.requests.delete(id);
        this.roundIds.delete(id);
        this.callbacks.delete(id);
        this.checkStatusCallback.delete(id);
        this.sentToPeers.delete(id);
    }


    private async handleReports(request: P2PDataRequest) {
        const reports = this.requestReports.get(request.internalId);
        if (!reports) return;

        if (!request) return;

        const roundId = this.roundIds.get(request.internalId);
        if (!roundId) return;
        
        // accept less signatures
        const requiredAmountOfSignatures = (Math.floor(this.p2p._peers.size / 2) + 1) > 1 ? (Math.floor(this.p2p._peers.size / 2) + 1) : 2 ;
        console.log("requiredAmountOfSignatures: ", requiredAmountOfSignatures);
        let r: P2PMessage = reports.values().next().value
        let round = await getRoundIdForPair(this.internalConfig, request.targetNetwork, r.hashFeedId)
        for (let report of reports){
            if(report.round != Number(round)){
                reports.delete(report)
            }
        }

        if (reports.size < requiredAmountOfSignatures) {
            logger.info(`[${LOG_NAME}-${request.internalId}] Not enough signatures --- `);
            return;
        }
       
        console.log("**HANDLED REPORTS: ", reports)
        logger.debug(`[${LOG_NAME}-${request.internalId}] Received enough signatures`);
        // Round id can randomly be modified so we should only use it for reelecting a leader
        const leader = electLeader(this.p2p, roundId);
        console.log(`**Chosen leader for round ${r.round} : ${leader}`)
        console.log("**thisNode", this.thisNode)
    
        const resolve = this.callbacks.get(request.internalId);
        this.clearRequest(request.internalId);
        this.transmittedRound.set(request.internalId, Number(round) + 1)
        console.log("**resolve: ", resolve)
        // resolve is sometimes undefined (if the node received enough sigs before aggregate() is called)
        if( resolve != undefined){
            if (this.thisNode.equals(leader)) {
                logger.debug(`[${LOG_NAME}-${request.internalId}] This node is the leader. Sending transaction across network and blockchain`);      
                return resolve!({
                    leader: true,
                    reports,
                });
            } else {
                return resolve!({
                    leader: false,
                    reports,
                });
            }

        }else{
            return;
        }
       
    }
    async aggregate(request: P2PDataRequest, hashFeedId: string, data: string, roundId: Big, isRequestResolved: () => Promise<boolean>): Promise<AggregateResult> {
        return new Promise(async (resolve) => {
            // TODO: Maybe do a check where if the request already exist we should ignore it?
            const timestamp = Math.round(new Date().getTime() / 1000);
            const message = hashPairSignatureInfo(hashFeedId, roundId.toString(), data, timestamp);
            const signature = await request.targetNetwork.sign(arrayify(message));
            console.log(`+++++++++SIG = ${toString(signature)} , answer = ${data} , signer = ${request.targetNetwork.getWalletPublicAddress()},
            timestamp ${timestamp}, round ${roundId.toString()}`)

            const p2pMessage: P2PMessage = {
                data,
                signature: toString(signature),
                hashFeedId,
                id: request.internalId,
                timestamp,
                round: Number(roundId),
                signer: request.targetNetwork.getWalletPublicAddress()
            };
    
            this.callbacks.set(request.internalId, resolve);
            this.checkStatusCallback.set(request.internalId, isRequestResolved);
            this.requests.set(request.internalId, request);
            this.roundIds.set(request.internalId, roundId);
            let reports = this.requestReports.get(request.internalId) ?? new Set();
            console.log("previously received reports", reports)
            reports.add(p2pMessage);

            // TODO: if we received a msg that added to this.requestReports it will be discarded
            this.requestReports.set(request.internalId, reports);
            console.log("**aggregated reports: ", reports)
            if (this.p2p._retry.size > 0) {
                console.log("++UNCONNECTED PEERS: ", this.p2p._retry.size)                
            } else {
                console.log("Sending to peers");
                await this.p2p.send(`/send/data`, [
                    fromString(JSON.stringify(p2pMessage)),
                ]);
                logger.info(`[${LOG_NAME}-${request.internalId}] Sent data to peers: ${data}`);
                this.sentToPeers.set(request.internalId, true)
                await this.handleReports(request);
            }
            
        });
    }
}