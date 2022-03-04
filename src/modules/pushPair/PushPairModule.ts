import { FetchJob } from "../../jobs/fetch/FetchJob";
import { AppConfig, createSafeAppConfigString } from "../../models/AppConfig";
import { DataRequestResolved } from "../../models/DataRequest";
import { DataRequestBatch } from "../../models/DataRequestBatch";
import { Module } from "../../models/Module";
import { OutcomeType } from "../../models/Outcome";
import { Database } from "../../services/DatabaseService";
import logger from "../../services/LoggerService";
import { debouncedInterval } from "../../services/TimerUtils";
import { parsePushPairConfig, PushPairConfig, PushPairInternalConfig } from "./models/PushPairConfig";
import { PushPairDataRequestBatch, PushPairResolvedDataRequest } from "./models/PushPairDataRequest";
import { createPairIfNeeded } from "./services/PushPairCreationService";
import { createBatchFromPairs, createEvmFactoryTransmitTransaction, createResolvePairRequest } from "./services/PushPairRequestService";

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

    private async processPairs() {
        try {
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
        } catch (error) {
            logger.error(`[${this.id}] ${error}`, {
                config: createSafeAppConfigString(this.appConfig),
            });
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

            debouncedInterval(this.processPairs.bind(this), this.internalConfig.interval);
            return true;
        } catch (error) {
            logger.error(`[${this.id}] ${error}`, {
                config: createSafeAppConfigString(this.appConfig),
            });
            return false;
        }
    }
}
