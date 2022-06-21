import logger from "../services/LoggerService";
import { sleep } from "../services/TimerUtils";
import { DataRequestBatchResolved } from "./DataRequestBatch";

export class Queue {
    items: DataRequestBatchResolved[] = [];
    processingId?: string;
    private intervalId?: NodeJS.Timer;
    id: string;

    constructor(id: string, private queueDelay: number) {
        this.id = `${id}-queue`;
    }

    has(batch: DataRequestBatchResolved): boolean {
        if (this.processingId === batch.internalId) {
            return true;
        }

        return this.items.some(item => item.internalId === batch.internalId);
    }

    add(batch: DataRequestBatchResolved) {
        if (this.has(batch)) {
            logger.debug(`[${this.id}] Cannot add the already existing ${batch.internalId} to queue (size: ${this.items.length})`);

            return;
        }
        this.items.push(batch);
        logger.debug(`[${this.id}] Added "${batch.internalId}" to queue (size: ${this.items.length})`);
    }

    start(onBatchReady: (batch: DataRequestBatchResolved) => Promise<void>) {
        this.intervalId = setInterval(async () => {
            if (this.processingId) return;

            const batch = this.items.shift();
            if (!batch) return;

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
