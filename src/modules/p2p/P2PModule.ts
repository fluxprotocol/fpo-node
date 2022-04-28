import EvmNetwork from "../../networks/evm/EvmNetwork";
import logger from "../../services/LoggerService";
import { AppConfig } from "../../models/AppConfig";
import { FetchJob } from "../../jobs/fetch/FetchJob";
import { Module } from "../../models/Module";
import { OutcomeType } from "../../models/Outcome";
import { P2PDataRequestBatch, P2PResolvedDataRequest } from "./models/P2PDataRequest";
import { createBatchFromPairs, createEvmFactory2TransmitTransaction, createEvmFactoryTransmitTransaction, createResolvePairRequest } from "./services/P2PRequestService";
import { createPairIfNeeded } from "./services/P2PCreationService";
import { createSafeAppConfigString } from "../../services/AppConfigUtils";
import { fetchEvmLastUpdate, fetchNearLastUpdate } from './services/FetchLastUpdateService';
import { parseP2PConfig, P2PConfig, P2PInternalConfig } from "./models/P2PConfig";
import Communicator from "../../p2p/communication";
import { init_p2p } from "../../p2p/aggregator";

export class P2PModule extends Module {
    static type = "P2PModule";
    private internalConfig: P2PInternalConfig;
    private batch: P2PDataRequestBatch;
    private p2p?: Communicator;

    constructor(moduleConfig: P2PConfig, appConfig: AppConfig) {
        super(P2PModule.type, moduleConfig, appConfig);

        this.internalConfig = parseP2PConfig(moduleConfig);
        this.id = this.internalConfig.id;
        this.batch = createBatchFromPairs(this.internalConfig, this.network);
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
            throw new Error(`Failed to fetch last update for network ${this.network.type} and pairs type ${this.internalConfig.pairsType}`);
        }

        return lastUpdate;
    }

    private async processPairs() {
        try {
            // Fetch elapsed time (in milliseconds) since last pair(s) update
            const timeSinceUpdate = Date.now() - await this.fetchLastUpdate();

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

            const resolvedRequests = await Promise.all(this.batch.requests.map(async (unresolvedRequest) => {
                // this sends the data
                const outcome = await job.executeRequest(unresolvedRequest);

                if (outcome.type === OutcomeType.Invalid) {
                    logger.error(`[${this.id}] Could not resolve ${unresolvedRequest.internalId}`, {
                        config: createSafeAppConfigString(this.appConfig),
                        logs: outcome.logs,
                    });
                    return null;
                }

                return createResolvePairRequest(outcome, unresolvedRequest, this.internalConfig);
            }));

            let requests: P2PResolvedDataRequest[] = resolvedRequests.filter(r => r !== null) as P2PResolvedDataRequest[];

            if (requests.length === 0) {
                logger.warn(`[${this.id}] No requests where left to submit on-chain`, {
                    config: createSafeAppConfigString(this.appConfig),
                });

                setTimeout(this.processPairs.bind(this), remainingInterval);
                return;
            }

            // With the new EVM factory we can combine multiple transmits in one transaction
            if (this.batch.targetNetwork.type === 'evm') {
                if (this.internalConfig.pairsType === 'factory') {
                    requests = [createEvmFactoryTransmitTransaction(this.internalConfig, requests)];
                }
                if (this.internalConfig.pairsType === 'factory2') {
                    requests = [createEvmFactory2TransmitTransaction(this.internalConfig, requests)];
                }
            }

            this.network.addRequestsToQueue({
                ...this.batch,
                requests,
                targetAddress: this.internalConfig.contractAddress,
            });

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
            logger.info(`[${this.id}] Creating pairs if needed..`);
            await Promise.all(this.internalConfig.pairs.map(async (pair) => {
                return createPairIfNeeded(pair, this.internalConfig, this.network);
            }));
            logger.info(`[${this.id}] Done creating pairs`);

            logger.info(`[${this.id}] Pre-submitting pairs with latest info`);
            await this.processPairs();
            logger.info(`[${this.id}] Pre-submitting done. Will be on a ${this.internalConfig.interval}ms interval`);

            return true;
        } catch (error) {
            logger.error(`[${this.id}] Start failure`, {
                error,
                config: createSafeAppConfigString(this.appConfig),
                fingerprint: `${this.type}-${this.internalConfig.networkId}-start-failure`,
            });
            return false;
        }
    }
}
