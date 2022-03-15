import FluxPriceFeed from './FluxPriceFeed.json';
import FluxPriceFeedFactory from './FluxPriceFeedFactory.json';
import logger from "../../services/LoggerService";
import { AppConfig, createSafeAppConfigString } from "../../models/AppConfig";
import { FetchJob } from "../../jobs/fetch/FetchJob";
import { Module } from "../../models/Module";
import { NearNetwork } from "../../networks/near/NearNetwork";
import { OutcomeType } from "../../models/Outcome";
import { PushPairDataRequestBatch, PushPairResolvedDataRequest } from "./models/PushPairDataRequest";
import { computeFactoryPairId } from './utils';
import { createBatchFromPairs, createEvmFactoryTransmitTransaction, createResolvePairRequest } from "./services/PushPairRequestService";
import { createPairIfNeeded } from "./services/PushPairCreationService";
import { parsePushPairConfig, PushPairConfig, PushPairInternalConfig } from "./models/PushPairConfig";

export class PushPairModule extends Module {
    static type = "PushPairModule";
    private internalConfig: PushPairInternalConfig;
    private batch: PushPairDataRequestBatch;

    constructor(moduleConfig: PushPairConfig, appConfig: AppConfig) {
        super(PushPairModule.type, moduleConfig, appConfig);

        this.internalConfig = parsePushPairConfig(moduleConfig);
        this.id = this.internalConfig.id;
        this.batch = createBatchFromPairs(this.internalConfig, this.network);
    }

    private async fetchEvmLastUpdate() {
        let timeStamp;
        if (this.internalConfig.pairsType === 'single') {
            timeStamp = await this.network.view({
                method: 'latestTimestamp',
                address: this.internalConfig.contractAddress,
                amount: '0',
                params: {},
                abi: FluxPriceFeed.abi,
            });
        } else { // If not 'single', pairs type is 'factory'
            // Contract returns [answer, updatedAt, statusCode]
            timeStamp = (await this.network.view({
                method: 'valueFor',
                address: this.internalConfig.contractAddress,
                amount: '0',
                params: {
                    id: computeFactoryPairId(this.internalConfig.pairs[0].pair, this.internalConfig.pairs[0].decimals)
                },
                abi: FluxPriceFeedFactory.abi,
            }))[1];
        }

        // Convert contract timestamp to milliseconds
        return timeStamp.toNumber() * 1000;
    }

    private async fetchNearLastUpdate(network: NearNetwork) {
        const entry = await this.network.view({
            method: 'get_entry',
            address: this.internalConfig.contractAddress,
            amount: '0',
            params: {
                provider: network.internalConfig?.account.accountId,
                pair: this.internalConfig.pairs[0].pair,
            },
        });

        // Convert contract timestamp to milliseconds
        return Math.floor(entry.last_update / 1000000);
    }

    private async fetchLastUpdate() {
        let lastUpdate;
        if (this.network.type === 'near') {
            lastUpdate = await this.fetchNearLastUpdate(this.network);
        }
        else if (this.network.type === 'evm') {
            lastUpdate = await this.fetchEvmLastUpdate();
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

            let requests: PushPairResolvedDataRequest[] = resolvedRequests.filter(r => r !== null) as PushPairResolvedDataRequest[];

            if (requests.length === 0) {
                logger.warn(`[${this.id}] No requests where left to submit on-chain`, {
                    config: createSafeAppConfigString(this.appConfig),
                });

                setTimeout(this.processPairs.bind(this), remainingInterval);
                return;
            }

            // With the new EVM factory we can combine multiple transmits in one transaction
            if (this.batch.targetNetwork.type === 'evm' && this.internalConfig.pairsType === 'factory') {
                requests = [createEvmFactoryTransmitTransaction(this.internalConfig, requests)];
            }

            this.network.addRequestsToQueue({
                ...this.batch,
                requests,
                targetAddress: this.internalConfig.contractAddress,
            });

            logger.debug(`[${this.id}] Next update in ${Math.floor(remainingInterval / 1000)}s`);
            setTimeout(this.processPairs.bind(this), remainingInterval);
        } catch (error) {
            logger.error(`[${this.id}] ${error}`, {
                config: createSafeAppConfigString(this.appConfig),
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
            logger.error(`[${this.id}] ${error}`, {
                config: createSafeAppConfigString(this.appConfig),
            });
            return false;
        }
    }
}
