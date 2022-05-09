import Big from "big.js";
import EvmNetwork from "../../networks/evm/EvmNetwork";
import logger from "../../services/LoggerService";
import { AppConfig } from "../../models/AppConfig";
import { FetchJob } from "../../jobs/fetch/FetchJob";
import { Module } from "../../models/Module";
import { OutcomeType } from "../../models/Outcome";
import { PushPairDataRequestBatch, PushPairResolvedDataRequest } from "./models/PushPairDataRequest";
import { createBatchFromPairs, createEvmFactory2TransmitTransaction, createEvmFactoryTransmitTransaction, createResolvePairRequest, shouldPricePairUpdate } from "./services/PushPairRequestService";
import { createPairIfNeeded } from "./services/PushPairCreationService";
import { createSafeAppConfigString } from "../../services/AppConfigUtils";
import { fetchEvmLastUpdate, fetchLatestPrice, fetchNearLastUpdate } from './services/FetchLastUpdateService';
import { parsePushPairConfig, PushPairConfig, PushPairInternalConfig } from "./models/PushPairConfig";
import { prettySeconds } from "../pairChecker/utils";

export class PushPairModule extends Module {
    static type = "PushPairModule";
    private internalConfig: PushPairInternalConfig;
    private batch: PushPairDataRequestBatch;

    // internalId => price
    // We should only update the mapping when we push the pair on chain
    // Otherwise we might never update the price
    private prices: Map<string, Big> = new Map();

    constructor(moduleConfig: PushPairConfig, appConfig: AppConfig) {
        super(PushPairModule.type, moduleConfig, appConfig);

        this.internalConfig = parsePushPairConfig(moduleConfig);
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
            const timestampUpdateReport = await this.fetchLastUpdate();
            // Fetch elapsed time (in milliseconds) since last pair(s) update
            const timeSinceUpdate = Date.now() - timestampUpdateReport.oldestTimestamp;
            logger.debug(`[${this.id}] Oldest pair update: ${prettySeconds(Math.floor(timeSinceUpdate / 1000))} ago`);

            let remainingInterval: number;
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

            const resolvedRequests = await Promise.all(this.batch.requests.map(async (unresolvedRequest, index) => {
                const outcome = await job.executeRequest(unresolvedRequest);

                if (outcome.type === OutcomeType.Invalid) {
                    logger.error(`[${this.id}] Could not resolve ${unresolvedRequest.internalId}`, {
                        config: createSafeAppConfigString(this.appConfig),
                        logs: outcome.logs,
                    });
                    return null;
                }

                // When the prices don't deviate too much we don't need to update the price pair
                if (!shouldPricePairUpdate(unresolvedRequest, timestampUpdateReport.timestamps[index], new Big(outcome.answer), this.prices.get(unresolvedRequest.internalId))) {
                    logger.debug(`[${this.id}] ${unresolvedRequest.internalId} Price ${outcome.answer} doesn't deviate ${unresolvedRequest.extraInfo.deviationPercentage}% from ${this.prices.get(unresolvedRequest.internalId)}`);
                    remainingInterval = this.internalConfig.interval;
                    return null;
                }

                // NOTICE: Limitation here is that we assume that the price update transaction may fail
                // we do not know whether or not the transaction failed
                this.prices.set(unresolvedRequest.internalId, new Big(outcome.answer));
                return createResolvePairRequest(outcome, unresolvedRequest, this.internalConfig);
            }));

            let requests: PushPairResolvedDataRequest[] = resolvedRequests.filter(r => r !== null) as PushPairResolvedDataRequest[];

            if (requests.length === 0) {
                logger.info(`[${this.id}] No requests where left to submit on-chain`, {
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

            logger.info(`[${this.id}] Fetching latest prices`);
            await Promise.all(this.batch.requests.map(async (request) => {
                const latestPrice = await fetchLatestPrice(this.internalConfig, request, this.network);
                this.prices.set(request.internalId, latestPrice);
            }));
            logger.info(`[${this.id}] Done fetching latest prices`);

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
