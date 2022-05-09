import EvmNetwork from "../../networks/evm/EvmNetwork";
import logger from "../../services/LoggerService";
import { AppConfig } from "../../models/AppConfig";
import { FetchJob } from "../../jobs/fetch/FetchJob";
import { Module } from "../../models/Module";
import { OutcomeType } from "../../models/Outcome";
import { P2PDataRequestBatch, P2PResolvedDataRequest } from "./models/P2PDataRequest";
import { createBatchFromPairs, createResolveP2PRequest, shouldMedianUpdate } from "./services/P2PRequestService";
import { createSafeAppConfigString } from "../../services/AppConfigUtils";
import { fetchEvmLastUpdate, fetchNearLastUpdate } from './services/FetchLastUpdateService';
import { parseP2PConfig, P2PConfig, P2PInternalConfig } from "./models/P2PConfig";
import Communicator from "../../p2p/communication";
import TCP from "libp2p-tcp";
const Mplex = require("libp2p-mplex"); // no ts support yet :/
import { NOISE } from "@chainsafe/libp2p-noise";
import Big from "big.js";
import { aggregate } from "../../p2p/aggregator";

export class P2PModule extends Module {
    private medians: Map<string, Big> = new Map();

    static type = "P2PModule";
    private internalConfig: P2PInternalConfig;
    private batch?: P2PDataRequestBatch;
    private p2p: Communicator;

    constructor(moduleConfig: P2PConfig, appConfig: AppConfig) {
        super(P2PModule.type, moduleConfig, appConfig);

        this.internalConfig = parseP2PConfig(moduleConfig);
        this.id = this.internalConfig.id;
        this.p2p = new Communicator({
            peerId: appConfig.peer_id,
            ...appConfig.p2p_node,
            modules: {
                transport: [TCP],
                streamMuxer: [Mplex],
                connEncryption: [NOISE],
            }
        }, appConfig.peers_file);
    }

    private async fetchLastUpdate() {
        let lastUpdate;
        if (this.network.type === 'near') {
            lastUpdate = await fetchNearLastUpdate(this.internalConfig, this.network);
        }
        else if (this.network.type === 'evm') {
            lastUpdate = await fetchEvmLastUpdate(this.internalConfig, this.network as EvmNetwork);
        }
        else {
            throw new Error(`Failed to fetch last update for network ${this.network.type}`);
        }

        return lastUpdate;
    }

    private async processPairs() {
        try {
            // TODO: when deviation
            /* const timestampUpdateReport = await this.fetchLastUpdate();
            // Fetch elapsed time (in milliseconds) since last pair(s) update
            const timeSinceUpdate = Date.now() - timestampUpdateReport.oldestTimestamp; */
            const timeSinceUpdate = await this.fetchLastUpdate();

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
                logger.error('The pairs batch was not successfully initialized.')
                throw new Error('Pairs batch was not successfully initialized.');
            }

            const resolvedRequests = await Promise.all(this.batch.requests.map(async (unresolvedRequest) => {
                const outcome = await job.executeRequest(unresolvedRequest);

                if (outcome.type === OutcomeType.Invalid) {
                    logger.error(`[${this.id}] Could not resolve ${unresolvedRequest.internalId}`, {
                        config: createSafeAppConfigString(this.appConfig),
                        logs: outcome.logs,
                    });
                    return null;
                }

                // TODO: need to get latestAggregatorRoundId from the contract so that we can properly elect a leader.
                let median: Big | undefined = undefined;
                await aggregate(this.p2p, unresolvedRequest, new Big(outcome.answer), async (median_to_send?: Big) => {
                    if (median_to_send !== undefined) {
                        median = median_to_send;
                    }
                });

                // TODO: deviation
               /*  // When the prices don't deviate too much we don't need to update the price pair
                if (!shouldMedianUpdate(unresolvedRequest, timestampUpdateReport.timestamps[index], new Big(outcome.answer), this.medians.get(unresolvedRequest.internalId))) {
                    logger.debug(`[${this.id}] ${unresolvedRequest.internalId} Price ${outcome.answer} doesn't deviate ${unresolvedRequest.extraInfo.deviationPercentage}% from ${this.prices.get(unresolvedRequest.internalId)}`);
                    remainingInterval = this.internalConfig.interval;
                    return null;
                } */

                // NOTICE: Limitation here is that we assume that the price update transaction may fail
                // we do not know whether or not the transaction failed
                if (median !== undefined) {
                    this.medians.set(unresolvedRequest.internalId, median);
                }
                return createResolveP2PRequest(outcome, unresolvedRequest, this.internalConfig, median);
                
            }));

            let requests: P2PResolvedDataRequest[] = resolvedRequests.filter(r => r !== null && (r.extraInfo.answer !== undefined)) as P2PResolvedDataRequest[];            

            if (requests.length === 0) {
                logger.warn(`[${this.id}] Node is not the leader for sending the median`, {
                    config: createSafeAppConfigString(this.appConfig),
                });

                setTimeout(this.processPairs.bind(this), remainingInterval);
                return;
            }
            
            // TODO: deviation check after consensus.
            this.network.addRequestsToQueue({
                ...this.batch,
                requests,
                targetAddress: this.internalConfig.contractAddress,
            });

            // check if leader didn't send it if so ask someone else to send it.
			// after publishing the leader shares the transaction hash and the peers verify the transaction hash right parameters to right contract
            // but how would i preserve median since it was batched?

            logger.debug(`[${this.id}] Next update in ${Math.floor(remainingInterval / 1000)}s`);
            setTimeout(this.processPairs.bind(this), remainingInterval);
        } catch (error) {
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
            this.batch = await createBatchFromPairs(this.internalConfig, this.network);
            logger.info(`Initializing p2p node...`);
            await this.p2p.init();
            logger.info(`Starting p2p node...`);
            await this.p2p.start();
            logger.info(`[${this.id}] Pre-submitting pairs with latest info`);
            await this.processPairs();
            logger.info(`[${this.id}] Pre-submitting done. Will be on a ${this.internalConfig.interval}ms interval`);
            return true;
        } catch (error) {
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
