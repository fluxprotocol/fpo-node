import Big from "big.js";
import { ENABLE_TELEGRAM_NOTIFICATIONS, TELEGRAM_ALERTS_CHAT_ID, TELEGRAM_BOT_API, TELEGRAM_STATS_CHAT_ID } from "../../config";
import { FetchJob } from "../../jobs/fetch/FetchJob";
import { AppConfig } from "../../models/AppConfig";
import { IJob } from "../../models/IJob";
import { Module } from "../../models/Module";
import { OutcomeType } from "../../models/Outcome";
import { createSafeAppConfigString } from "../../services/AppConfigUtils";
import logger from "../../services/LoggerService";
import { debouncedInterval } from "../../services/TimerUtils";
import { InternalPairDeviationCheckerModuleConfig, PairDeviationCheckerModuleConfig, parsePairDeviationCheckerModuleConfig } from "./models/PairDeviationCheckerModuleConfig";
import { createRequestsFromPairs, PairDeviationDataRequest } from "./models/PairDeviationDataRequest";
import { PairDeviationReport } from "./models/PairDeviationReport";
import { fetchLatestPrice, fetchLatestTimestamp } from "./services/FetchLastUpdateService";
import { shouldPricePairUpdate } from "./services/PairDeviationService";
import { notifyTelegram } from "./services/TelegramNotificationService";

export class PairDeviationCheckerModule extends Module {
    static type = "PairDeviationCheckerModule";

    private internalConfig: InternalPairDeviationCheckerModuleConfig;
    private prices: Map<string, Big | undefined> = new Map();
    private dataRequests: PairDeviationDataRequest[];
    private fetchJob: IJob;
    private lastCheckAnyFailed: boolean = false;


    constructor(moduleConfig: PairDeviationCheckerModuleConfig, appConfig: AppConfig) {
        super(PairDeviationCheckerModule.type, moduleConfig, appConfig);
        this.internalConfig = parsePairDeviationCheckerModuleConfig(moduleConfig);
        this.dataRequests = createRequestsFromPairs(this.internalConfig, this.network);

        const fetchJob = appConfig.jobs.find(job => job.type === FetchJob.type);
        if (!fetchJob) throw new Error(`No job found with id ${FetchJob.type}`);
        this.fetchJob = fetchJob;
    }

    async checkPairs() {
        try {
            logger.info(`[${this.id}] Checking ${this.dataRequests.length} pairs`);
            const forceNotification = this.lastCheckAnyFailed;
            this.lastCheckAnyFailed = false;

            // Generating all reports for every single pair in this set
            const reports: PairDeviationReport[] = await Promise.all(this.dataRequests.map<Promise<PairDeviationReport>>(async (dataRequest) => {
                const latestTimestamp = await fetchLatestTimestamp(dataRequest, this.network);

                if (!latestTimestamp) {
                    return {
                        pair: dataRequest,
                        updated: false,
                        message: 'FAIL_TIMESTAMP_FETCH',
                        diff: -1,
                    };
                }

                const timestampDiff = Date.now() - latestTimestamp;
                const latestPrice = await fetchLatestPrice(dataRequest, this.network);

                if (!latestPrice) {
                    return {
                        pair: dataRequest,
                        updated: false,
                        message: 'FAIL_PRICE_FETCH',
                        diff: -1,
                    }
                }

                const executeOutcome = await this.fetchJob.executeRequest(dataRequest);

                if (executeOutcome.type === OutcomeType.Invalid) {
                    logger.error(`[${this.id}] Could not resolve ${dataRequest.internalId}`, {
                        config: createSafeAppConfigString(this.appConfig),
                        logs: executeOutcome.logs,
                        fingerprint: `${this.id}-could-not-resolve`,
                    });

                    return {
                        pair: dataRequest,
                        updated: false,
                        message: 'INVALID_FETCH_OUTCOME',
                        diff: -1,
                    };
                }

                const shouldUpdateReport = shouldPricePairUpdate(dataRequest, latestTimestamp, new Big(executeOutcome.answer), this.prices.get(dataRequest.internalId));

                if (shouldUpdateReport.shouldUpdate) {
                    const reasonMsg = `${shouldUpdateReport.reason}${shouldUpdateReport.deviation ? ' (' + shouldUpdateReport.deviation.toFixed(2) + '%)' : ''}`;
                    logger.error(`[${this.id}] ${dataRequest.extraInfo.pair} should update because of ${reasonMsg}`, {
                        fingerprint: `${this.id}-should-update`,
                    });

                    return {
                        pair: dataRequest,
                        updated: false,
                        message: reasonMsg,
                        diff: timestampDiff / 1000,
                    };
                }

                this.prices.set(dataRequest.internalId, new Big(executeOutcome.answer));

                logger.info(`[${this.id}] ${dataRequest.extraInfo.pair} has been recently updated`);

                return {
                    pair: dataRequest,
                    updated: true,
                    diff: timestampDiff / 1000,
                };
            }));

            this.lastCheckAnyFailed = reports.some(r => !r.updated);

            if (ENABLE_TELEGRAM_NOTIFICATIONS) {
                await notifyTelegram(reports, this.internalConfig.provider, forceNotification);
            }
        } catch (error) {
            logger.error(`[${this.id}] Unknown error`, {
                error,
                fingerprint: `${this.id}-checkPairs-unknown`,
            });
        }
    }

    async start(): Promise<boolean> {
        // Check environment variables
        if (ENABLE_TELEGRAM_NOTIFICATIONS) {
            if (!TELEGRAM_BOT_API) {
                logger.error(`[${this.id}] Could not start \`PairCheckerModule\`: \`TELEGRAM_BOT_TOKEN\` is undefined`, {
                    config: createSafeAppConfigString(this.appConfig),
                    fingerprint: `${this.type}-${this.internalConfig.provider}-start-failure`,
                });

                return false;
            } else if (!TELEGRAM_ALERTS_CHAT_ID && !TELEGRAM_STATS_CHAT_ID) {
                logger.error(`[${this.id}] Could not start \`PairCheckerModule\`: \`TELEGRAM_ALERTS_CHAT_ID\` and \`TELEGRAM_STATS_CHAT_ID\` are undefined`, {
                    config: createSafeAppConfigString(this.appConfig),
                    fingerprint: `${this.type}-${this.internalConfig.provider}-start-failure`,
                });

                return false;
            }
        }


        logger.info(`[${this.id}] Fetching latest prices`);
        await Promise.all(this.dataRequests.map(async (request) => {
            const latestPrice = await fetchLatestPrice(request, this.network);
            this.prices.set(request.internalId, latestPrice);
        }));
        logger.info(`[${this.id}] Done fetching latest prices`);

        await this.checkPairs();
        debouncedInterval(async () => {
            await this.checkPairs();
        }, this.internalConfig.interval);

        return true;
    }
}
