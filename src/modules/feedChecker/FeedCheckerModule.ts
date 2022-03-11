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

    private async fetchNearLatestTimestamp(address: string, provider: string, pair: string) {
        const entry = await this.network.view({
            method: 'get_entry',
            address,
            amount: '0',
            params: {
                provider,
                pair,
            },
        });

        // Convert contract timestamp to milliseconds
        return Math.floor(entry.last_update / 1000000);
    }

    private checkLatestTimestamp(timestamp: number, address: string) {
        logger.debug(`[${this.id}] [${address}] Latest Timestamp: ${new Date(timestamp).toISOString().replace('T', ' ').substring(0, 19)}`);

        const diff = Date.now() - timestamp;
        if (diff > this.internalConfig.threshold) {
            // TODO: change logger level to error
            logger.info(`[${this.id}] [${address}] Contract has not been updated since ${this.prettySeconds(diff / 1000)}`);
        } else {
            logger.debug(`[${this.id}] [${address}] Contract was updated ${this.prettySeconds(diff / 1000)} ago`);
        }
    }

    async start(): Promise<boolean> {
        debouncedInterval(async () => {
            try {
                // Check all contracts addresses
                logger.info(`[${this.id}] Checking feed addresses for ${this.network.type} network...`);
                const currentTimestamp = Date.now();

                if (this.network.type === 'evm') {
                    await Promise.all(this.internalConfig.addresses.map(async (address) => {
                        const latestTimestamp = await this.fetchEvmLatestTimestamp(address);

                        this.checkLatestTimestamp(latestTimestamp, address);
                    }));
                } else if (this.network.type === 'near') {
                    await Promise.all(this.internalConfig.addresses.map(async (address) => {
                        // TODO: include provider and pairs into configuration
                        const latestTimestamp = await this.fetchNearLatestTimestamp(address, "opfilabs.testnet", "NEAR/USDT");

                        this.checkLatestTimestamp(latestTimestamp, this.internalConfig.addresses[0]);
                    }));
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
