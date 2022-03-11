import FluxPriceFeedAbi from './FluxPriceFeed.json';
import logger from "../../services/LoggerService";
import { AppConfig, createSafeAppConfigString } from "../../models/AppConfig";
import { FeedCheckerModuleConfig, InternalFeedCheckerModuleConfig, parseFeedCheckerModuleConfig } from "./models/FeedCheckerModuleConfig";
import { Module } from "../../models/Module";
import { debouncedInterval } from "../../services/TimerUtils";

export class FeedCheckerModule extends Module {
    static type = "FeedCheckerModule";
    internalConfig: InternalFeedCheckerModuleConfig;

    constructor(moduleConfig: FeedCheckerModuleConfig, appConfig: AppConfig) {
        super(FeedCheckerModule.type, moduleConfig, appConfig);
        this.internalConfig = parseFeedCheckerModuleConfig(moduleConfig);
    }

    private prettySeconds(seconds: number): string {
        // Seconds
        if (seconds < 60) {
            return Math.floor(seconds) + " seconds";
        }
        // Minutes
        else if (seconds < 3600) {
            return Math.floor(seconds / 60) + " min";
        }
        // Hours
        else if (seconds < 86400) {
            return Math.floor(seconds / 3600) + " hours";
        }
        // Days
        else {
            return Math.floor(seconds / 86400) + " days";
        }
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

    async start(): Promise<boolean> {
        debouncedInterval(async () => {
            try {
                // Check all contracts addresses
                logger.info(`[${this.id}] Checking all feed addresses...`);
                const currentTimestamp = Date.now();

                if (this.network.type === 'evm') {
                    await Promise.all(this.internalConfig.addresses.map(async (address) => {

                        const latestTimestamp = await this.fetchEvmLatestTimestamp(address);
                        logger.debug(`[${this.id}] [${address}] Latest Timestamp: ${new Date(latestTimestamp).toISOString().replace('T', ' ').substring(0, 19)}`);

                        const diff = currentTimestamp - latestTimestamp;
                        if (diff > this.internalConfig.threshold) {
                            // TODO: change logger level
                            logger.info(`[${this.id}] [${address}] Contract has not been updated since ${this.prettySeconds(diff / 1000)}`);
                        } else {
                            logger.debug(`[${this.id}] [${address}] Contract was updated ${this.prettySeconds(diff / 1000)} ago`);
                        }
                    }));
                } else if (this.network.type === 'near') {
                    console.log("Not yet implemented!");
                } else {
                    throw new Error(`Network type ${this.network.type} is not supported for feed checking`);
                }
            } catch (error) {
                logger.error(`[${this.id}] ${error}`, {
                    config: createSafeAppConfigString(this.appConfig),
                });

                return false;
            }

        }, this.internalConfig.interval);

        return true;
    }
}
