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
    constructor(p2p: Communicator) {
        super();
        this.p2p = p2p;
        this.thisNode = new Multiaddr(this.p2p._node_addr);

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

        reports.add(message);

        if (!request) {
            this.requestReports.set(message.id, reports);
            logger.debug(`[${LOG_NAME}-${message.id}] Request could not be found yet, reports are being saved for future use.`);
            return;
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
        if(this.p2p._retry.size == 0){
            this.sentToPeers.set(request.internalId, true)
        }

        this.requestReports.set(message.id, reports);
        console.log("**reconstructed reports: ", reports)


        await this.handleReports(message.id);
    }

    private clearRequest(id: string) {
        this.requestReports.delete(id);
        this.requests.delete(id);
        this.roundIds.delete(id);
        this.callbacks.delete(id);
        this.checkStatusCallback.delete(id);
        this.sentToPeers.delete(id);


    }

    private async reselectLeader(id: string) {
        const isRequestResolved = this.checkStatusCallback.get(id);
        if (!isRequestResolved) return;

        const resolved = await isRequestResolved();

        if (resolved) {
            const resolve = this.callbacks.get(id);
            this.clearRequest(id);
            // TODO: Not sure why sometimes resolve is undefined
            if(resolve){
                return resolve!({
                    leader: false,
                    reports: this.requestReports.get(id) ?? new Set(),
                });

            }else{
                console.log("++REJECTED")
            }
            
        }

        const roundId = this.roundIds.get(id);
        this.roundIds.set(id, roundId?.plus(1) ?? new Big(0));
        await this.handleReports(id);
    }

    private async handleReports(id: string) {
        const reports = this.requestReports.get(id);
        if (!reports) return;

        const request = this.requests.get(id);
        if (!request) return;

        const roundId = this.roundIds.get(id);
        if (!roundId) return;

        // assume all node sigs are needed
        const requiredAmountOfSignatures = this.p2p._peers.size + 1;

        if (reports.size < requiredAmountOfSignatures) {
            logger.debug(`[${LOG_NAME}-${id}] No enough signatures --- `);
            return;
        }
        console.log("**HANDLED REPORTS: ", reports)

        logger.debug(`[${LOG_NAME}-${id}] Received enough signatures`);
        // Round id can randomly be modified so we should only use it for reelecting a leader
        const leader = electLeader(this.p2p, roundId);
        console.log(`**Chosen leader for round ${reports.values().next().value.round} : ${leader}`)
        console.log("**thisNode", this.thisNode)

        const resolve = this.callbacks.get(id);
        this.clearRequest(id);

        if (this.thisNode.equals(leader)) {
            logger.debug(`[${LOG_NAME}-${request.internalId}] This node is the leader. Sending transaction across network and blockchain`);      
            return resolve!({
                leader: true,
                reports,
            });
        }else{
            return resolve!({
                leader: false,
                reports,
            });

        }
    }
    async aggregate(request: P2PDataRequest, hashFeedId: string, data: string, roundId: Big, isRequestResolved: () => Promise<boolean>): Promise<AggregateResult> {
        return new Promise(async (resolve) => {
            // this.sentToPeers = false;

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
            console.log("previously recived reports", reports)
            reports.add(p2pMessage);
            // TODO: if we received a msg that added to this.requestReports it will be discarded
            this.requestReports.set(request.internalId, reports);
            console.log("**aggregated reports: ", reports)
            if(this.p2p._retry.size > 0) {
                console.log("++UNCONNECTED PEERS: ", this.p2p._retry.size)                
            }else{
                await this.p2p.send(`/send/data`, [
                    fromString(JSON.stringify(p2pMessage)),
                ]);
                logger.debug(`[${LOG_NAME}-${request.internalId}] Sent data to peers: ${data}`);
                // this.sentToPeers = true;
                this.sentToPeers.set(request.internalId, true)
                await this.handleReports(request.internalId);

            }
            
        });
    }
}