import FluxPriceFeedAbi from './FluxPriceFeed.json';
import logger from "../../services/LoggerService";
import { AppConfig, createSafeAppConfigString } from "../../models/AppConfig";
import { Module } from "../../models/Module";
import { PairCheckerModuleConfig, InternalPairCheckerModuleConfig, parsePairCheckerModuleConfig, Pair } from "./models/PairCheckerModuleConfig";
import { TELEGRAM_BOT_CHAT_ID, TELEGRAM_BOT_API, TELEGRAM_VERBOSE } from '../../config';
import { debouncedInterval } from "../../services/TimerUtils";
import { prettySeconds, sendTelegramMessage } from './utils';

export class PairCheckerModule extends Module {
    static type = "PairCheckerModule";
    internalConfig: InternalPairCheckerModuleConfig;

    constructor(moduleConfig: PairCheckerModuleConfig, appConfig: AppConfig) {
        super(PairCheckerModule.type, moduleConfig, appConfig);
        this.internalConfig = parsePairCheckerModuleConfig(moduleConfig);
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
            logger.error(`${logInfo} Contract has not been updated since ${prettySeconds(diffInMillis/1000)}`,
                {
                    config: createSafeAppConfigString(this.appConfig),
                    fingerprint: `${this.type}-${this.internalConfig.provider}-${pair.pair}`,
                });
        } else {
            logger.debug(`${logInfo} Contract was updated ${prettySeconds(diffInMillis / 1000)} ago`);
        }

        return {
            pair,
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
        if (reports.length > 0 && TELEGRAM_BOT_API && TELEGRAM_BOT_CHAT_ID) {
            reports = reports.sort(function (a, b) { return a.diff - b.diff });
            const notUpdatedReports = reports.filter(report => !report.updated);

            const allPairsUpdated = notUpdatedReports.length == 0;
            if (TELEGRAM_VERBOSE || !allPairsUpdated) {
                // Message summary
                let message;
                const updates = `[${this.internalConfig.provider}] ${reports.length - notUpdatedReports.length}/${reports.length} pairs updated recently`
                if (allPairsUpdated) {
                    message = `✅ *${updates}* \n\n`;
                } else if (notUpdatedReports.length != reports.length) {
                    message = `⚠️ *${updates}* \n\n`;
                } else {
                    message = `🆘 *${updates}* \n\n`;
                }

                // Last update per pair
                for (var i = 0; i < reports.length; i++) {
                    message += `\t ${reports[i].updated ? '✓' : '⨯'} [[${reports[i].pair.pair}]] updated ${prettySeconds(reports[i].diff, true)} ago\n`;
                }

                await sendTelegramMessage(TELEGRAM_BOT_API, TELEGRAM_BOT_CHAT_ID, message, allPairsUpdated);
            }

            // Contract addresses of not updated pairs
            if (!allPairsUpdated) {
                let details = `🔍 *[${this.internalConfig.provider}] Not updated addresses:* \n\n`;
                for (var i = 0; i < notUpdatedReports.length; i++) {
                    details += `\t*[${notUpdatedReports[i].pair.pair}]* ${notUpdatedReports[i].pair.address}\n`;
                }

                await sendTelegramMessage(TELEGRAM_BOT_API, TELEGRAM_BOT_CHAT_ID, details, allPairsUpdated);
            }
        }
    }

    async start(): Promise<boolean> {
        await this.checkAllPairs();

        debouncedInterval(async () => {
            await this.checkAllPairs();
        }, this.internalConfig.interval);

        return true;
    }
}
