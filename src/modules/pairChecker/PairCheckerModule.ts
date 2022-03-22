import FluxPriceFeedAbi from './FluxPriceFeed.json';
import logger from "../../services/LoggerService";
import { AppConfig, createSafeAppConfigString } from "../../models/AppConfig";
import { ENABLE_TELEGRAM_NOTIFICATIONS, TELEGRAM_ALERTS_CHAT_ID, TELEGRAM_BOT_API, TELEGRAM_STATS_CHAT_ID } from '../../config';
import { Module } from "../../models/Module";
import { PairCheckerModuleConfig, InternalPairCheckerModuleConfig, parsePairCheckerModuleConfig, Pair } from "./models/PairCheckerModuleConfig";
import { debouncedInterval } from "../../services/TimerUtils";
import { notifyTelegram, sendTelegramMessage } from './services/TelegramNotificationService';
import { prettySeconds } from './utils';

export class PairCheckerModule extends Module {
    static type = "PairCheckerModule";
    internalConfig: InternalPairCheckerModuleConfig;
    lastCheckAnyFailed: boolean;

    constructor(moduleConfig: PairCheckerModuleConfig, appConfig: AppConfig) {
        super(PairCheckerModule.type, moduleConfig, appConfig);
        this.internalConfig = parsePairCheckerModuleConfig(moduleConfig);
        this.lastCheckAnyFailed = false;
    }

    private async fetchEvmLatestTimestamp(address: string) {
        const latestTimestampResponse = await this.network.view({
            method: 'latestTimestamp',
            address,
            amount: '0',
            params: {},
            abi: FluxPriceFeedAbi.abi,
        });

        // Convert contract timestamp to milliseconds
        return latestTimestampResponse.toNumber() * 1000;
    }

    private async fetchNearLatestTimestamp(pair: Pair) {
        const entry = await this.network.view({
            method: 'get_entry',
            address: pair.address,
            amount: '0',
            params: {
                provider: pair.provider ?? this.internalConfig.provider,
                pair: pair.pair,
            },
        });

        // Convert contract timestamp to milliseconds
        return Math.floor(entry.last_update / 1000000);
    }

    private checkLatestTimestamp(timestamp: number, pair: Pair) {
        const diffInMillis = Math.floor((Date.now() - timestamp));
        const logInfo = `[${this.id}] [${pair.provider ?? this.internalConfig.provider}] [${pair.pair}] [${pair.address}]`
        const recentlyUpdated = diffInMillis < (pair.threshold ?? this.internalConfig.threshold);
        if (!recentlyUpdated) {
            this.lastCheckAnyFailed = true;
            logger.error(`${logInfo} Contract has not been updated since ${prettySeconds(diffInMillis / 1000)}`,
                {
                    config: createSafeAppConfigString(this.appConfig),
                    fingerprint: `${this.type}-${this.internalConfig.provider}-${pair.pair}`,
                });
        } else {
            logger.debug(`${logInfo} Contract was updated ${prettySeconds(diffInMillis / 1000)} ago`);
        }

        return {
            pair: {
                provider: this.internalConfig.provider,
                threshold: this.internalConfig.threshold,
                ...pair,
            },
            diff: diffInMillis / 1000,
            updated: recentlyUpdated
        };
    }

    async checkAllPairs() {
        let reports: {
            pair: Pair;
            diff: number;
            updated: boolean;
        }[] = [];
        const forceNotification = this.lastCheckAnyFailed;
        this.lastCheckAnyFailed = false;
        // TODO: Move try/catch block?
        try {
            // Check all contracts addresses
            logger.info(`[${this.id}] ${this.internalConfig.provider ? "[" + this.internalConfig.provider + "] " : ""}Checking ${this.internalConfig.pairs.length} pair addresses...`);

            if (this.network.type === 'evm') {
                reports = await Promise.all(this.internalConfig.pairs.map(async (pair) => {
                    const latestTimestamp = await this.fetchEvmLatestTimestamp(pair.address);

                    return this.checkLatestTimestamp(latestTimestamp, pair);
                }));
            } else if (this.network.type === 'near') {
                reports = await Promise.all(this.internalConfig.pairs.map(async (pair) => {
                    const latestTimestamp = await this.fetchNearLatestTimestamp(pair);//address, "opfilabs.testnet", "NEAR/USDT");

                    return this.checkLatestTimestamp(latestTimestamp, pair);
                }));
            } else {
                throw new Error(`Network type ${this.network.type} is not supported for feed checking`);
            }
        } catch (error) {
            logger.error(`[${this.id}] ${error}`, {
                config: createSafeAppConfigString(this.appConfig),
                fingerprint: `${this.type}-${this.internalConfig.provider}-failure`,
            });
        }

        // Send messages to telegram chat (if environment variables are set)
        if (reports.length > 0 && ENABLE_TELEGRAM_NOTIFICATIONS) {
            await notifyTelegram(reports, this.internalConfig.provider, forceNotification);
        }
    }

    async start(): Promise<boolean> {
        // Check environment variables
        if (ENABLE_TELEGRAM_NOTIFICATIONS) {
            if (!TELEGRAM_BOT_API) {
                // TODO: log error
                logger.error(`[${this.id}] Could not start \`PairCheckerModule\`: \`TELEGRAM_BOT_TOKEN\` is undefined`, {
                    config: createSafeAppConfigString(this.appConfig),
                });

                return false;
            } else if (!TELEGRAM_ALERTS_CHAT_ID && !TELEGRAM_STATS_CHAT_ID) {
                // TODO: log error
                logger.error(`[${this.id}] Could not start \`PairCheckerModule\`: \`TELEGRAM_ALERTS_CHAT_ID\` and \`TELEGRAM_STATS_CHAT_ID\` are undefined`, {
                    config: createSafeAppConfigString(this.appConfig),
                });

                return false;
            }

        }

        await this.checkAllPairs();

        debouncedInterval(async () => {
            await this.checkAllPairs();
        }, this.internalConfig.interval);

        return true;
    }
}
