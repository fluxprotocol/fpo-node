import logger from "../services/LoggerService";
import { sleep } from "../services/TimerUtils";
import { AppConfig } from "./AppConfig";
import { DataRequestBatchResolved, hydrateDataRequestBatchResolved, storeDataRequestBatchResolved } from "./DataRequestBatch";

const RETRIES = 5;

export class Queue {
    items: DataRequestBatchResolved[] = [];
    processingId?: string;
    private intervalId?: NodeJS.Timer;
    private appConfig: AppConfig;
    id: string;

    constructor(id: string, private queueDelay: number, appConfig: AppConfig) {
        this.id = `${id}-queue`;
        this.appConfig = appConfig;
    }

    has(batch: DataRequestBatchResolved): boolean {
        if (this.processingId === batch.internalId) {
            return true;
        }

        return this.items.some(item => item.internalId === batch.internalId);
    }

    async add(batch: DataRequestBatchResolved) {
        if (this.has(batch)) return;
        this.items.push(batch);
        logger.debug(`[${this.id}] Added "${batch.internalId}" to queue`);
    }

    start(onBatchReady: (batch: DataRequestBatchResolved) => Promise<void>) {
        this.intervalId = setInterval(async () => {
            try {
                if (this.processingId) return;
    
                const batch = this.items.shift();
                if (!batch) return;
    
                this.processingId = batch.internalId;
                
                await this.executeBatch(onBatchReady, batch, 0);

                this.processingId = undefined;
            } catch (err) {

            }
        }, 100);
    }

    async executeBatch(onBatchReady: (batch: DataRequestBatchResolved) => Promise<void>, batch: DataRequestBatchResolved, retries: number): Promise<void> {
        try {
            logger.debug(`[${this.id}] Submitting batch to blockchain ${batch.internalId}`);
        
            await onBatchReady(batch);
            // Adding more padding between transactions in order for the RPC to correctly set the nonce
            await sleep(this.queueDelay);
    
            logger.debug(`[${this.id}] Submitting batch to blockchain completed ${batch.internalId}`);
        } catch (err) {
            logger.error(`[${this.id}] Error submitting batch to blockchain ${err}`);
            if (retries < RETRIES) {
                this.executeBatch(onBatchReady, batch, ++retries)
            } else {
                logger.error(`[${this.id}] Something went really wrong with this batch ${err}`)
                logger.info(`[${this.id}] pathway frozen because of batch: ${this.items}`)
            }
        }

    }

    stop() {
        if (!this.intervalId) return;
        clearInterval(this.intervalId);
        this.intervalId = undefined;
    }
}
