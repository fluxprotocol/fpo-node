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

        // It's possible we got these message even before this node
        // realises that the pair needs to be updated. We save them for future use.
        let reports = this.requestReports.get(message.id);
        if (!reports) {
            reports = new Set();
        }

        reports.add(message);
        this.requestReports.set(message.id, reports);

        logger.debug(`[${LOG_NAME}-${message.id}] Received message from ${peer} ${this.requestReports.size}/${this.p2p._peers.size}`);

        const request = this.requests.get(message.id);
        if (!request) {
            logger.debug(`[${LOG_NAME}-${message.id}] Request could not be found yet, reports are being saved for future use.`);
            return;
        }

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

        if (reports.size <= requiredAmountOfSignatures) {
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

            const p2pMessage: P2PMessage = {
                data,
                signature: toString(signature, 'base64'),
                id: request.internalId,
                timestamp,
            };

            this.callbacks.set(request.internalId, resolve);
            this.checkStatusCallback.set(request.internalId, isRequestResolved);
            this.requests.set(request.internalId, request);
            this.roundIds.set(request.internalId, roundId);

            // Reports may already been set due to a faster node
            let reports = this.requestReports.get(request.internalId);
            if (!reports) {
                reports = new Set();
            }

            reports.add(p2pMessage);
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
