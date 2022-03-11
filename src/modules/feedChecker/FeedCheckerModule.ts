import { AppConfig, createSafeAppConfigString } from "../../models/AppConfig";
import { Module } from "../../models/Module";
import { FeedCheckerModuleConfig, InternalFeedCheckerModuleConfig, parseFeedCheckerModuleConfig } from "./models/FeedCheckerModuleConfig";
import { debouncedInterval } from "../../services/TimerUtils";
import logger from "../../services/LoggerService";

export class FeedCheckerModule extends Module {
    static type = "FeedCheckerModule";

    internalConfig: InternalFeedCheckerModuleConfig;

    constructor(moduleConfig: FeedCheckerModuleConfig, appConfig: AppConfig) {
        super(FeedCheckerModule.type, moduleConfig, appConfig);
        this.internalConfig = parseFeedCheckerModuleConfig(moduleConfig);
    }

    async start(): Promise<boolean> {
        debouncedInterval(async () => {
            try {
                // Check all contracts addresses
                logger.info(`[${this.id}] Checking all feed addresses...`);
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
