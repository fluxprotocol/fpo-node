import EvmNetwork from "../../networks/evm/EvmNetwork";
import logger from "../../services/LoggerService";
import { AppConfig } from "../../models/AppConfig";
import { FetchJob } from "../../jobs/fetch/FetchJob";
import { Module } from "../../models/Module";
import { OutcomeType } from "../../models/Outcome";
import { P2PDataRequestBatch, P2PResolvedDataRequest } from "./models/P2PDataRequest";
import { createBatchFromPairs, createResolveP2PRequest, getRoundIdForPair, shouldMedianUpdate } from "./services/P2PRequestService";
import { createPairIfNeeded } from "./services/P2PCreationService";
import { createSafeAppConfigString } from "../../services/AppConfigUtils";
import { fetchEvmLastUpdate, fetchNearLastUpdate } from './services/FetchLastUpdateService';
import { parseP2PConfig, P2PConfig, P2PInternalConfig } from "./models/P2PConfig";
import Communicator from "../../p2p/communication";
// @ts-ignore
import TCP from "libp2p-tcp";
const Mplex = require("libp2p-mplex"); // no ts support yet :/
// @ts-ignore
import { NOISE } from "@chainsafe/libp2p-noise";
import Big from "big.js";
import P2PAggregator, { AggregateResult } from "../../p2p/aggregator";
import { prettySeconds, sleep } from "../../services/TimerUtils";
import { getHashFeedIdForPair } from "../pushPair/services/utils";
import DBLogger from "../../models/DBLoggerModule";
import { new_version, rejectVersion, toString as versionToString } from "../../p2p/models/P2PVersion";

export class P2PModule extends Module {
    static type = "P2PModule";
    static node_version = new_version(process.env.NODE_ENV?.toLowerCase() === 'test' ? process.env.P2P_NODE_VERSION ?? "1.0.4" : "0.0.1");
    static report_version = new_version(process.env.NODE_ENV?.toLowerCase() === 'test' ? process.env.P2P_REPORT_VERSION ?? "1.2.0" : "0.0.1");

    private internalConfig: P2PInternalConfig;
    private batch?: P2PDataRequestBatch;
    private p2p: Communicator;
    private aggregator: P2PAggregator;
    private processing: Set<string> = new Set();
    private db: DBLogger;

    // internalId => old median
    // We should only update the mapping when we push the new medain
    // Otherwise we might never update the price.
    // However, we still need to update it even if we are not the leader.
    // Otherwise non-leader nodes would not check deviation.
    private medians: Map<string, Big> = new Map();

    constructor(moduleConfig: P2PConfig, appConfig: AppConfig) {
        super(P2PModule.type, moduleConfig, appConfig);

        if (!appConfig.p2p) throw new Error(`"p2p" is required in the appConfig for ${this.type} to work`);

        this.internalConfig = parseP2PConfig(moduleConfig);

        // find the correct network for this p2p submodule
        // TODO: this would be cleaner if p2p settings were combined with the network settings
        const p2p = appConfig.p2p.find(config => config.networkId === this.internalConfig.networkId);
        if (!p2p) throw new Error(`"networkId" is required in the p2p config`);

        this.id = this.internalConfig.id;
        this.p2p = new Communicator(
            P2PModule.node_version,
            P2PModule.report_version,
            {
                peerId: p2p.peer_id,
                addresses: p2p.addresses,
                ...p2p.p2p_node,
                modules: {
                    transport: [TCP],
                    streamMuxer: [Mplex],
                    connEncryption: [NOISE],
                },
            }, p2p.peers);
        this.aggregator = new P2PAggregator(this.p2p, this.internalConfig, this.network);

        this.db = new DBLogger(this.internalConfig.logFile);
    }

    private async fetchLastUpdate() {
        if (this.network.type === 'near') {
            return fetchNearLastUpdate(this.internalConfig, this.network);
        }
        else if (this.network.type === 'evm') {
            return fetchEvmLastUpdate(this.internalConfig, this.network as EvmNetwork);
        }
        else {
            throw new Error(`Failed to fetch last update for network ${this.network.type}`);
        }
    }

    private async processPairs() {
        try {
            const timestampUpdateReport = await this.fetchLastUpdate();
            // Fetch elapsed time (in milliseconds) since last pair(s) update
            const timeSinceUpdate = Date.now() - timestampUpdateReport.oldestTimestamp;
            logger.debug(`[${this.id}] Oldest pair update: ${prettySeconds(Math.floor(timeSinceUpdate / 1000))} ago`);

            let remainingInterval;
            if (timeSinceUpdate < this.internalConfig.interval) {
                remainingInterval = this.internalConfig.interval - timeSinceUpdate;
                logger.debug(`[${this.id}] Target update interval not yet reached. Delaying update ${Math.floor(remainingInterval / 1000)}s ...`);

                setTimeout(this.processPairs.bind(this), remainingInterval);
                return;
            } else {
                remainingInterval = this.internalConfig.interval;
            }

            if (this.p2p._connections.size === 0) {
                (`Currently have 0 connected peers: waiting for other peers to connect...`);
                setTimeout(this.processPairs.bind(this), remainingInterval);
                return;
            }

            if (rejectVersion(P2PModule.node_version, this.p2p.latest_node_version)) {
                logger.error(`Node version '${versionToString(P2PModule.node_version)}' is out of date and needs to be updated to '${versionToString(this.p2p.latest_node_version)}'`);
                return;
                // throw new Error(`Node version '${versionToString(P2PModule.node_version)}' is out of date and needs to be updated to '${versionToString(this.p2p.latest_node_version)}'`);
            }

            if (rejectVersion(P2PModule.report_version, this.p2p.latest_report_version)) {
                logger.error(`Report version '${versionToString(P2PModule.report_version)}' is out of date and needs to be updated to '${versionToString(this.p2p.latest_report_version)}'`);
                return;
                // throw new Error(`Report version '${versionToString(P2PModule.report_version)}' is out of date and needs to be updated to '${versionToString(this.p2p.latest_report_version)}'`);
            }

            logger.info(`[${this.id}] Processing job`);
            const job = this.appConfig.jobs.find(job => job.type === FetchJob.type);
            if (!job) throw new Error(`No job found with id ${FetchJob.type}`);

            if (!this.batch) {
                logger.error('The pairs batch was not successfully initialized.');
                return;
            }

            const resolvedRequests = await Promise.all(this.batch.requests.map(async (unresolvedRequest, index) => {
                if (this.processing.has(unresolvedRequest.internalId)) {
                    return null;
                }

                const outcome = await job.executeRequest(unresolvedRequest);
                if (outcome.type === OutcomeType.Invalid || outcome.answer === '0') {
                    logger.error(`[${this.id}] Could not resolve ${unresolvedRequest.internalId}`, {
                        config: createSafeAppConfigString(this.appConfig),
                        logs: outcome.logs,
                    });
                    return null;
                }

                // When the prices don't deviate too much we don't need to update the price pair
                if (!shouldMedianUpdate(unresolvedRequest, timestampUpdateReport.timestamps[index], new Big(outcome.answer), this.medians.get(unresolvedRequest.internalId))) {
                    logger.debug(`[${this.id}] ${unresolvedRequest.internalId} Price ${outcome.answer} doesn't deviate ${unresolvedRequest.extraInfo.deviationPercentage}% from ${this.medians.get(unresolvedRequest.internalId)}`);
                    remainingInterval = this.internalConfig.interval;
                    return null;
                }
                this.processing.add(unresolvedRequest.internalId);

                // The hash feed id for the pair.
                const hashFeedId: string = await getHashFeedIdForPair(this.internalConfig, unresolvedRequest.extraInfo.pair, unresolvedRequest.extraInfo.decimals);

                // Round id is used to determine the leader in the network.
                // All nodes are expected to run the same peer list
                const roundId: Big = await getRoundIdForPair(this.internalConfig, this.network, hashFeedId);

                logger.info(`[${this.id}] @@processpairs: ${unresolvedRequest.extraInfo.pair} on round id ${roundId.toString()}`);
                let aggregateResult: AggregateResult;
                try {
                    aggregateResult = await this.aggregator.aggregate(P2PModule.node_version, P2PModule.report_version, unresolvedRequest, hashFeedId, outcome.answer, roundId, async () => {
                        // Check whether or not the transaction has been in the blockchain
                        const newRoundId = await getRoundIdForPair(this.internalConfig, this.network, hashFeedId);
                        // When the round id incremented we've updated the prices on chain
                        return !newRoundId.eq(roundId);
                    });
                } catch (err) {
                    logger.error(`@@processPairs: aggregateResult error ${(err as Error).message}`)
                    this.processing.delete(unresolvedRequest.internalId);
                    logger.info(`@@processPairs:  deleted unresolvedRequest.internalId ${unresolvedRequest.internalId}, hashId = ${hashFeedId}`)
                    this.medians.set(unresolvedRequest.internalId, new Big(outcome.answer));
                    return null;
                }
                this.processing.delete(unresolvedRequest.internalId);
                logger.info(`@@processPairs:  deleted unresolvedRequest.internalId ${unresolvedRequest.internalId}, hashId = ${hashFeedId}`)
                this.medians.set(unresolvedRequest.internalId, new Big(outcome.answer));
                // At this stage everything should already be fully handled by the leader
                // and if not at least submitted by this node. We can safely move on
                if (!aggregateResult.leader) {
                    return null;
                }
                // We are the leader and we should send the transaction
                return createResolveP2PRequest(aggregateResult, hashFeedId, roundId, unresolvedRequest, this.internalConfig);
            }));

            let requests: P2PResolvedDataRequest[] = resolvedRequests.filter(r => r !== null) as P2PResolvedDataRequest[];

            if (requests.length === 0) {
                logger.log(`[${this.id}] Node did not have to send anything`, {
                    config: createSafeAppConfigString(this.appConfig),
                });

                setTimeout(this.processPairs.bind(this), remainingInterval);
                return;
            }

            this.network.addRequestsToQueue({
                db: this.db,
                ...this.batch,
                requests,
                targetAddress: this.internalConfig.contractAddress,
            });

            logger.debug(`[${this.id}] Next update in ${Math.floor(remainingInterval / 1000)}s`);
            setTimeout(this.processPairs.bind(this), remainingInterval);
        } catch (error) {
            console.error(error);
            logger.error(`[${this.id}] Process pairs unknown error`, {
                error,
                config: createSafeAppConfigString(this.appConfig),
                fingerprint: `${this.type}-${this.internalConfig.networkId}-processPairs-unknown`,
            });
            setTimeout(this.processPairs.bind(this), this.internalConfig.interval);
        }
    }

    async start(): Promise<boolean> {
        try {

            logger.info("Initializing p2p batch pairs...");
            this.batch = createBatchFromPairs(this.internalConfig, this.network);

            logger.info(`Initializing p2p node...`);
            await this.p2p.init();

            logger.info(`Starting p2p node...`);
            await this.p2p.start();
            await this.aggregator.init();

            logger.info(`[${this.id}] Creating pairs if needed..`);

            // calling deployOracle for more than one pair without delay bet calls throw server error
            let delay = 0; const delayIncrement = 20_000;
            await Promise.all(this.internalConfig.pairs.map(async (pair) => {
                delay += delayIncrement;
                return new Promise(resolve => setTimeout(resolve, delay)).then(
                    async () => {
                        let pair_created = await createPairIfNeeded(pair, this.internalConfig, this.network);
                        while (!pair_created) {
                            await sleep(10_000);
                            pair_created = await createPairIfNeeded(pair, this.internalConfig, this.network);
                        }
                    }
                );
            }));

            logger.info(`[${this.id}] Done creating pairs`);

            await this.processPairs();

            return true;
        } catch (error) {
            this.db.close();
            await this.p2p.stop();
            logger.error(`[${this.id}] Start failure`, {
                error,
                config: createSafeAppConfigString(this.appConfig),
                fingerprint: `${this.type}-${this.internalConfig.networkId}-start-failure`,
            });
            return false;
        }
    }
}
