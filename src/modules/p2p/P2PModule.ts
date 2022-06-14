import EvmNetwork from "../../networks/evm/EvmNetwork";
import logger from "../../services/LoggerService";
import { AppConfig } from "../../models/AppConfig";
import { FetchJob } from "../../jobs/fetch/FetchJob";
import { Module } from "../../models/Module";
import { OutcomeType } from "../../models/Outcome";
import { P2PDataRequestBatch, P2PResolvedDataRequest } from "./models/P2PDataRequest";
import { createBatchFromPairs, createResolveP2PRequest, getRoundIdForPair, shouldMedianUpdate } from "./services/P2PRequestService";
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
import P2PAggregator, { aggregate, AggregateResult } from "../../p2p/aggregator";
import { prettySeconds } from "../../services/TimerUtils";
import DatabaseConstructor, { Database } from "better-sqlite3";
import { DEBUG } from "../../config";

export class P2PModule extends Module {
    static type = "P2PModule";
    private internalConfig: P2PInternalConfig;
    private batch?: P2PDataRequestBatch;
    private p2p: Communicator;
    private aggregator: P2PAggregator;
    private processing: Set<string> = new Set();
    private db: Database;

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
        this.id = this.internalConfig.id;
        this.p2p = new Communicator({
            peerId: appConfig.p2p.peer_id,
            addresses: appConfig.p2p.addresses,
            ...appConfig.p2p.p2p_node,
            modules: {
                transport: [TCP],
                streamMuxer: [Mplex],
                connEncryption: [NOISE],
            },
        }, appConfig.p2p.peers);
        this.aggregator = new P2PAggregator(this.p2p);

        const db_opts = DEBUG ? { verbose: logger.info } : { verbose: logger.debug };
        this.db = new DatabaseConstructor(`logs/${appConfig.p2p.logFile}`, db_opts);
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

                this.processing.add(unresolvedRequest.internalId);
                const outcome = await job.executeRequest(unresolvedRequest);

                if (outcome.type === OutcomeType.Invalid) {
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

                // Round id is used to determine the leader in the network.
                // All nodes are expected to run the same peer list
                const roundId = await getRoundIdForPair(this.internalConfig, this.network, unresolvedRequest.extraInfo.pair, unresolvedRequest.extraInfo.decimals);
                logger.info(`[${this.id}] ${unresolvedRequest.extraInfo.pair} on round id ${roundId.toString()}`);

                // Send the outcome through the p2p network to come to a consensus
                const aggregateResult: AggregateResult = await this.aggregator.aggregate(unresolvedRequest, outcome.answer, roundId, async () => {
                    // Check whether or not the transaction has been in the blockchain
                    const newRoundId = await getRoundIdForPair(this.internalConfig, this.network, unresolvedRequest.extraInfo.pair, unresolvedRequest.extraInfo.decimals);

                    // When the round id incremented we've updated the prices on chain
                    return !newRoundId.eq(roundId);
                });

                this.processing.delete(unresolvedRequest.internalId);

                this.medians.set(unresolvedRequest.internalId, new Big(outcome.answer));
                // At this stage everything should already be fully handled by the leader
                // and if not atleast submitted by this node. We can safely move on
                if (!aggregateResult.leader) {
                    return null;
                }

                // We are the leader and we should send the transaction
                return createResolveP2PRequest(aggregateResult, roundId, unresolvedRequest, this.internalConfig);
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
            logger.info("Setting up log file...");
            this.db.exec(`CREATE TABLE IF NOT EXISTS logs (
                tx_id TEXT NOT NULL,
                ts TIMESTAMP NOT NULL,
                answers TEXT NOT NULL,
                PRIMARY KEY(tx_id, ts)
            );`);
            this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS timestamps on logs(ts);`);
            this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS transactions on logs(tx_id);`);

            logger.info("Initializing p2p batch pairs...");
            this.batch = createBatchFromPairs(this.internalConfig, this.network);

            logger.info(`Initializing p2p node...`);
            await this.p2p.init();

            logger.info(`Starting p2p node...`);
            await this.p2p.start();
            await this.aggregator.init();
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
