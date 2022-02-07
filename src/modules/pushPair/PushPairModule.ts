import { FetchJob } from "../../jobs/fetch/FetchJob";
import { AppConfig } from "../../models/AppConfig";
import { Module } from "../../models/Module";
import logger from "../../services/LoggerService";
import { debouncedInterval } from "../../services/TimerUtils";
import { parsePushPairConfig, PushPairConfig, PushPairInternalConfig } from "./models/PushPairConfig";

export class PushPairModule extends Module {
    static type = "PushPairModule";
    private internalConfig: PushPairInternalConfig

    constructor(moduleConfig: PushPairConfig, appConfig: AppConfig) {
        super(PushPairModule.type, moduleConfig, appConfig);

        this.internalConfig = parsePushPairConfig(moduleConfig);
        this.id = this.internalConfig.id;
    }

    private async processPairs() {
        try {
            logger.info(`[${this.id}] Processing job`);
            const job = this.appConfig.jobs.find(job => job.type === FetchJob.type);
            if (!job) throw new Error(`No job found with id ${FetchJob.type}`);


            console.log('[] this.internalConfig -> ', this.internalConfig);
        } catch (error) {
            logger.error(`[${this.id}] ${error}`);
        }
    }

    async start(): Promise<boolean> {
        try {
            logger.info(`[${this.id}] Pre-submitting pairs with latest info`);
            await this.processPairs();
            logger.info(`[${this.id}] Pre-submitting done. Will be on a ${this.internalConfig.interval}ms interval`);

            debouncedInterval(this.processPairs.bind(this), this.internalConfig.interval);
            return true;
        } catch (error) {
            logger.error(`[${this.id}] ${error}`);
            return false;
        }
    }
}
