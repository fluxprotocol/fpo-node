import database, { Database } from "../services/DatabaseService";
import logger from "../services/LoggerService";
import { sleep } from "../services/TimerUtils";
import { AppConfig } from "./AppConfig";
import { DataRequestBatchResolved, hydrateDataRequestBatchResolved, storeDataRequestBatchResolved } from "./DataRequestBatch";

export class Queue {
    DB_TABLE_NAME: string;
    items: DataRequestBatchResolved[] = [];
    processingId?: string;
    private intervalId?: NodeJS.Timer;
    private appConfig: AppConfig;
    id: string;

    constructor(id: string, private queueDelay: number, appConfig: AppConfig) {
        this.id = `${id}-queue`;
        this.DB_TABLE_NAME = `${this.id}-requests`;
        this.appConfig = appConfig;
        database.createTable(this.DB_TABLE_NAME);
    }

    async init() {
        const items = await database.getAllFromTable<DataRequestBatchResolved>(this.DB_TABLE_NAME);
        this.items = items.map(item => hydrateDataRequestBatchResolved(item, this.appConfig));
        logger.info(`[${this.id}] Restored ${this.items.length} items`);
    }

    has(batch: DataRequestBatchResolved): boolean {
        if (this.processingId === batch.internalId) {
            return true;
        }

        return this.items.some(item => item.internalId === batch.internalId);
    }

    async add(batch: DataRequestBatchResolved) {
        if (this.has(batch)) return;
        await storeDataRequestBatchResolved(this.DB_TABLE_NAME, batch);
        this.items.push(batch);
        logger.debug(`[${this.id}] Added "${batch.internalId}" to queue`);
    }

    start(onBatchReady: (batch: DataRequestBatchResolved) => Promise<void>) {
        this.intervalId = setInterval(async () => {
            if (this.processingId) return;

            const batch = this.items.shift();
            if (!batch) return;

            database.deleteDocument(this.DB_TABLE_NAME, batch.internalId);
            this.processingId = batch.internalId;

            logger.debug(`[${this.id}] Submitting batch to blockchain ${batch.internalId}`);

            await onBatchReady(batch);
            // Adding more padding between transactions in order for the RPC to correctly set the nonce
            await sleep(this.queueDelay);

            logger.debug(`[${this.id}] Submitting batch to blockchain completed ${batch.internalId}`);

            this.processingId = undefined;
        }, 100);
    }

    stop() {
        if (!this.intervalId) return;
        clearInterval(this.intervalId);
        this.intervalId = undefined;
    }
}
