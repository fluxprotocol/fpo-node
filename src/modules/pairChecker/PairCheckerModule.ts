import FluxPriceFeedAbi from './FluxPriceFeed.json';
import logger from "../../services/LoggerService";
import { AppConfig, createSafeAppConfigString } from "../../models/AppConfig";
import { Module } from "../../models/Module";
import { PairCheckerModuleConfig, InternalPairCheckerModuleConfig, parsePairCheckerModuleConfig, Pair } from "./models/PairCheckerModuleConfig";
import { debouncedInterval } from "../../services/TimerUtils";
import { prettySeconds } from './utils';

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
        const diff = Date.now() - timestamp;
        const logInfo = `[${this.id}] [${pair.provider ?? this.internalConfig.provider}] [${pair.pair}] [${pair.address}]`
        if (diff > (pair.threshold ?? this.internalConfig.threshold)) {
            logger.error(`${logInfo} Contract has not been updated since ${prettySeconds(diff / 1000)}`,
                {
                    config: createSafeAppConfigString(this.appConfig),
                    fingerprint: `${this.type}-${this.internalConfig.provider}-${pair.pair}`,
                });
        } else {
            logger.debug(`${logInfo} Contract was updated ${prettySeconds(diff / 1000)} ago`);
        }
    }

    async checkAllPairs() {
        try {
            // Check all contracts addresses
            logger.info(`[${this.id}] ${this.internalConfig.provider ? "[" + this.internalConfig.provider + "] " : ""}Checking ${this.internalConfig.pairs.length} pair addresses...`);

            if (this.network.type === 'evm') {
                await Promise.all(this.internalConfig.pairs.map(async (pair) => {
                    const latestTimestamp = await this.fetchEvmLatestTimestamp(pair.address);

                    this.checkLatestTimestamp(latestTimestamp, pair);
                }));
            } else if (this.network.type === 'near') {
                await Promise.all(this.internalConfig.pairs.map(async (pair) => {
                    const latestTimestamp = await this.fetchNearLatestTimestamp(pair);//address, "opfilabs.testnet", "NEAR/USDT");

                    this.checkLatestTimestamp(latestTimestamp, pair);
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
    }

    async start(): Promise<boolean> {
        await this.checkAllPairs();

        debouncedInterval(async () => {
            await this.checkAllPairs();
        }, this.internalConfig.interval);

        return true;
    }
}
