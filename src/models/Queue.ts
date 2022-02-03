import EventEmitter from "events";
import logger from "../services/LoggerService";
import { Block } from "./Block";
import { DataRequestBatch, hasBatchEnoughConfirmations } from "./DataRequestBatch";

type RequestBlockHandler = (id: string) => Promise<Block>;

export class Queue {
    items: DataRequestBatch[] = [];
    processingId?: string;
    private intervalId?: NodeJS.Timer;
    id: string;


    constructor(id: string) {
        this.id = `${id}-queue`;
    }

    has(batch: DataRequestBatch): boolean {
        if (this.processingId === batch.internalId) {
            return true;
        }

        return this.items.some(item => item.internalId === batch.internalId);
    }

    add(batch: DataRequestBatch) {
        if (this.has(batch)) return;
        this.items.push(batch);
        logger.debug(`[${this.id}] Added "${batch.internalId}" to queue`);
    }

    start(onBatchReady: (batch: DataRequestBatch) => Promise<void>) {
        this.intervalId = setInterval(async () => {
            if (this.processingId) return;

            const batch = this.items.shift();
            if (!batch) return;

            this.processingId = batch.internalId;

            logger.debug(`[${this.id}] Processing ${batch.internalId}`);

            await onBatchReady(batch);

            logger.debug(`[${this.id}] Completed Processing ${batch.internalId}`);

            this.processingId = undefined;
        }, 100);
    }

    stop() {
        if (!this.intervalId) return;
        clearInterval(this.intervalId);
        this.intervalId = undefined;
    }
}
