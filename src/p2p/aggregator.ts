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
import EvmNetwork from "../networks/evm/EvmNetwork";
import getWalletPublicAddress from "../networks/evm/EvmNetwork"
import { time } from "console";
import { getMinSignersForPair, getRoundIdForPair } from "../modules/p2p/services/P2PRequestService";
import { P2PConfig, P2PInternalConfig, parseP2PConfig } from "../modules/p2p/models/P2PConfig";
import { FetchJob } from "../jobs/fetch/FetchJob";
import { executeFetch } from "../jobs/fetch/executeFetch";



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
    private internalConfig: P2PInternalConfig;

    constructor(p2p: Communicator, moduleConfig: P2PConfig) {
        super();

        this.p2p = p2p;
        this.thisNode = new Multiaddr(this.p2p._node_addr);
        this.internalConfig = parseP2PConfig(moduleConfig);

    }

    async init(): Promise<void> {
        this.p2p.handle_incoming('/send/data', this.handleIncomingData.bind(this));
        this.thisNode = new Multiaddr(this.p2p._node_addr);
    }

    private async handleIncomingData(peer: Multiaddr, source: AsyncIterable<Uint8Array | BufferList>) {
        const message = await extractP2PMessage(source);
        console.log("**Rcvd msg", message)
        if (!message) return;
        const request = this.requests.get(message.id);
        if (!request) return;

        // It's possible we got these message even before this node
        // realises that the pair needs to be updated. We save them for future use.
        // However if they have the wrong roundID we have to reconstruct the signatures.
        let reports = this.requestReports.get(message.id) ?? new Set();
        console.log("**previous reports: ", reports)
        const requiredAmountOfSignatures = Math.floor(this.p2p._peers.size / 2) + 1;

        let reconstructed_reports: Set<P2PMessage> = new Set();

        // if (reports.size >= 1){
        //     let deleted = false;
        //     for (const report of reports) {
        //         if(report.round < message.round){
        //             reports.delete(report)
        //             console.log("**Deleted outdated report (wrong round)");
        //             deleted = true;
        //             let executeResult = await executeFetch(request.args);
        //             const lastLog = executeResult.logs.pop(); 
        //             let data;
        //             if(lastLog){
        //                 const logResult = JSON.parse(lastLog);
        //                 data = logResult.value;
        //                 console.log("**fetched data", data);
        //             }
        //             // Reconstructs the old report so that we have enough reports.
        //             const timestamp = Math.round(new Date().getTime() / 1000);
        //             const data_to_be_signed = data ?? report.data;
        //             const hash = hashPairSignatureInfo(message.hashFeedId, message.round.toString(), data_to_be_signed, timestamp);
        //             const signature = toString(await request.targetNetwork.sign(arrayify(hash)));
        //             console.log(`++SIG = ${signature} , answer = ${data_to_be_signed}, signature = ${signature},
        //             timestamp ${timestamp}, round ${message.round.toString()}`)
        //             const p2pMessage: P2PMessage = {
        //                 ...report,
        //                 round: message.round,
        //                 signature,
        //                 timestamp,
        //                 signer: request.targetNetwork.getWalletPublicAddress()
        //             };
        //             let exists = false;
        //             for(let rreport of reconstructed_reports){
        //                 if((rreport.signature == p2pMessage.signature) || (rreport.signer == request.targetNetwork.getWalletPublicAddress())){
        //                     exists = true;
        //                 }
        //             }
        //             if(!exists){
        //                 reconstructed_reports.add(p2pMessage);
        //                 setTimeout(() => this.reselectLeader(message.id), request?.extraInfo.p2pReelectWaitTimeMs);
        //                 // logger.debug(`[${LOG_NAME}-${request.internalId}] ++++Sending data to peers: ${p2pMessage.data}`);
        //                 //     await this.p2p.send(`/send/data`, [
        //                 //         fromString(JSON.stringify(p2pMessage)),
        //                 //     ]);
        //             }
        //         } else {
        //             reconstructed_reports.add(report);
        //         }
        //     }
        //     if ((reconstructed_reports.size - 1 < requiredAmountOfSignatures) && !deleted ){
        //         let report1 = reconstructed_reports.values().next().value ?? null;
        //         const timestamp = Math.round(new Date().getTime() / 1000);
        //                 const hash = hashPairSignatureInfo(message.hashFeedId, message.round.toString(), report1.data, timestamp);
        //                 const signature = toString(await request.targetNetwork.sign(arrayify(hash)));
        //                 console.log(`+++++++++SIG = ${signature} , answer = ${report1.data}, signature = ${signature},
        //         timestamp ${timestamp}, round ${message.round.toString()}`)
        //                 const p2pMessage: P2PMessage = {
        //                     ...report1,
        //                     round: message.round,
        //                     signature,
        //                     timestamp,
        //                 };
        //                 let exists = false;
        //                 for(let rreport of reconstructed_reports){
        //                     if((rreport.signature == p2pMessage.signature) || (rreport.signer == request.targetNetwork.getWalletPublicAddress())){
        //                         exists = true;
        //                     }
        //                 }
        //                 if(!exists){
        //                     reconstructed_reports.add(p2pMessage);
        //                     setTimeout(() => this.reselectLeader(message.id), request?.extraInfo.p2pReelectWaitTimeMs);
        //                     // logger.debug(`[${LOG_NAME}-${request.internalId}] ----Sending data to peers: ${p2pMessage.data}`);
        //                     // await this.p2p.send(`/send/data`, [
        //                     //     fromString(JSON.stringify(p2pMessage)),
        //                     // ]);
        //                 }
        //     }
        // }


        if (reports.size >= 1){
            for (const report of reports) {
                if(report.round < message.round){
                    reports.delete(report)
                    console.log("**Deleted outdated report (wrong round)");

                    let executeResult = await executeFetch(request.args);
                    const lastLog = executeResult.logs.pop(); 
                    let data;
                    if(lastLog){
                        const logResult = JSON.parse(lastLog);
                        data = logResult.value;
                        console.log("**fetched data", data);
                    }

                    // Reconstructs the old report so that we have enough reports.
                    const timestamp = Math.round(new Date().getTime() / 1000);
                    const hash = hashPairSignatureInfo(message.hashFeedId, message.round.toString(), data?? report.data, timestamp);
                    const signature = toString(await request.targetNetwork.sign(arrayify(hash)));
                    console.log(`+++++++++SIG = ${signature} , answer = ${report.data}, signature = ${signature},
                    timestamp ${timestamp}, round ${message.round.toString()}`)
                    const p2pMessage: P2PMessage = {
                        ...report,
                        round: message.round,
                        signature,
                        timestamp,
                        signer: request.targetNetwork.getWalletPublicAddress()
                    };
                    let exists = false;
                    for(let rreport of reconstructed_reports){
                        if((rreport.signature == p2pMessage.signature) || (rreport.signer == p2pMessage.signer)){
                            exists = true;
                        }
                    }
                    if(!exists){
                        reconstructed_reports.add(p2pMessage);
                        setTimeout(() => this.reselectLeader(message.id), request?.extraInfo.p2pReelectWaitTimeMs);

                       
                    }                
                } else {
                    reconstructed_reports.add(report);
                }
            }
        }


        reconstructed_reports.add(message);

        this.requestReports.set(message.id, reconstructed_reports);
        console.log("**reconstructed reports: ", reconstructed_reports)

        logger.debug(`[${LOG_NAME}-${message.id}] Received message from ${peer} ${this.requestReports.size}/${this.p2p._peers.size}`);


        if (!request) {
            logger.debug(`[${LOG_NAME}-${message.id}] Request could not be found yet, reports are being saved for future use.`);
            return;
        }
        // For some reason this now aborts the creator node giving TypeError: resolve is not a function
        // at P2PAggregator.reselectLeader (.../aggregator.js:111:20)

        // if(reports.size == 1){
        //     console.log("RESELECTING LEADER+++++++")
        //     setTimeout(() => this.reselectLeader(message.id), request?.extraInfo.p2pReelectWaitTimeMs);

        // }


        await this.handleReports(message.id);
    }

    private clearRequest(id: string) {
        this.requestReports.delete(id);
        this.requests.delete(id);
        this.roundIds.delete(id);
        this.callbacks.delete(id);
        this.checkStatusCallback.delete(id);
    }

    private async reselectLeader(id: string) {
        const isRequestResolved = this.checkStatusCallback.get(id);
        if (!isRequestResolved) return;

        const resolved = await isRequestResolved();

        if (resolved) {
            const resolve = this.callbacks.get(id);
            this.clearRequest(id);

            return resolve!({
                leader: false,
                reports: this.requestReports.get(id) ?? new Set(),
            });
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

        // TODO: This is apperently a property on the smart contract. We can later always try to call this property. (with ofc a cache of 30min or so and use a stale value if that fails)
        const requiredAmountOfSignatures = Math.floor(this.p2p._peers.size / 2) + 1;
        // const requiredAmountOfSignatures: Big = await getMinSignersForPair(this.internalConfig, request.targetNetwork, reports.values().next().value.hashFeedId);

        // if (reports.size < Number(requiredAmountOfSignatures)) {
        // if (reports.size <= requiredAmountOfSignatures) {
        if (reports.size < requiredAmountOfSignatures) {

            logger.debug(`[${LOG_NAME}-${id}] No enough signatures`);
            // setTimeout(() => this.reselectLeader(id), request.extraInfo.p2pReelectWaitTimeMs);
            return;
        }
        

        logger.debug(`[${LOG_NAME}-${id}] Received enough signatures`);
        // Round id can randomly be modified so we should only use it for reelecting a leader
        const leader = electLeader(this.p2p, roundId);
        if (this.thisNode.equals(leader)) {
            logger.debug(`[${LOG_NAME}-${request.internalId}] This node is the leader. Sending transaction across network and blockchain`);

            const resolve = this.callbacks.get(id);
            this.clearRequest(id);

            return resolve!({
                leader: true,
                reports,
            });
        }

        // The leader node could fail. We should select the next leader once x amount of time passes
        setTimeout(() => this.reselectLeader(id), request.extraInfo.p2pReelectWaitTimeMs);
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
                // signature: toString(signature, 'base64'),
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

            // Reports may already been set due to a faster node
            let reports = this.requestReports.get(request.internalId) ?? new Set();
            const latestRound: Big = await getRoundIdForPair(this.internalConfig, request.targetNetwork, request.extraInfo.pair, request.extraInfo.decimals, hashFeedId);
            console.log("++++Latest rnd: ", Number(latestRound))
            for (const report of reports) {
                if ((report.round < p2pMessage.round) || (report.round !== Number(latestRound))){
                    // this one doesn't seem to be hit. I think we can delete it.
                    // Will leave it it in for testing purposes.
                    console.log("~~Deleted outdated report (wrong round)");
                    reports.delete(report);
                }
            }
            reports.add(p2pMessage);
            console.log("**aggregated reports: ", reports)
            this.requestReports.set(request.internalId, reports);

            logger.debug(`[${LOG_NAME}-${request.internalId}] Sending data to peers: ${data}`);
            await this.p2p.send(`/send/data`, [
                fromString(JSON.stringify(p2pMessage)),
            ]);

            // It is possible that we already got enough reports due the async nature of p2p
            await this.handleReports(request.internalId);
        });
    }
}