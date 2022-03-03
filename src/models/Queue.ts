import { LevelDB } from "level";
import { DB_TABLE_TX_QUEUE } from "../constants/database";
import { Database } from "../services/DatabaseService";
import logger from "../services/LoggerService";
import { sleep } from "../services/TimerUtils";
import { DataRequestBatchResolved } from "./DataRequestBatch";

export class Queue {
    items: DataRequestBatchResolved[] = [];
    processingId?: string;
    private intervalId?: NodeJS.Timer;
    id: string;
    db: Database;

    constructor(id: string, private queueDelay: number, db: Database) {
        this.id = `${id}-queue`;
        this.db = db;
    }

    has(batch: DataRequestBatchResolved): boolean {
        if (this.processingId === batch.internalId) {
            return true;
        }

        return this.items.some(item => item.internalId === batch.internalId);
    }

    add(batch: DataRequestBatchResolved) {
        if (this.has(batch)) return;
        this.items.push(batch);
        logger.debug(`[${this.id}] Added "${batch.internalId}" to queue`);
        
        // this.db.createDocument(DB_TABLE_TX_QUEUE, batch.internalId, {
        //     targetNetwork: batch.targetNetwork,
        //     // originNetwork: this.

        // })
        // TODO: store request in db 
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

            logger.debug(`[${this.id}] Submitted batch to blockchain ${batch.internalId}`);
            // TODO: If fails retry
            // TODO: Add Sentry logs
            this.processingId = undefined;
            // TODO: remove request from database
        }, 100);
    }

    // TODO: on sigkill stop block subscription, queue, database -> die
    stop() {
        if (!this.intervalId) return;
        clearInterval(this.intervalId);
        this.intervalId = undefined;
    }
}
