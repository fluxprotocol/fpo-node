import Big from "big.js";
import logger from "../services/LoggerService";
import { debouncedInterval } from "../services/TimerUtils";
import { Block } from "./Block";
import { DataRequestBatch, hasBatchEnoughConfirmations } from "./DataRequestBatch";
import { INetwork } from "./INetwork";

type Callback = (batch: DataRequestBatch, confirmations: Big) => any;

export class DataRequestConfirmationsQueue {
    batches: Map<string, DataRequestBatch> = new Map();
    currentBlock?: Block;
    id: string;
    network: INetwork;

    callback: Callback = () => { };

    constructor(network: INetwork) {
        this.id = `cq-${network.id}`;
        this.network = network;

        debouncedInterval(async () => {
            const block = await this.network.getLatestBlock();
            if (!block) return;

            await this.setBlock(block);
        }, this.network.networkConfig.blockFetchingInterval);
    }

    private async isBatchBlockHeadersValid(batch: DataRequestBatch): Promise<boolean> {
        for await (const request of batch.requests) {
            const currentBlock = await request.originNetwork.getBlock(request.createdInfo.block.number.toNumber());

            if (currentBlock?.hash !== request.createdInfo.block.hash) {
                logger.debug(`[${request.internalId}] Block ${request.createdInfo.block.number} hash does not match the current confirmed block`);
                return false;
            }
        }

        return true;
    }

    private async setBlock(block: Block) {
        this.currentBlock = block;

        for await (const [batchId, batch] of this.batches) {
            let confirmationsRequiredInfo = hasBatchEnoughConfirmations(batch, block);

            if (!confirmationsRequiredInfo.confirmed) {
                logger.debug(`[${this.id}-${batchId}] Request confirmed ${confirmationsRequiredInfo.currentConfirmations.toString()}/${confirmationsRequiredInfo.confirmationsNeeded.toString()}`);
                continue;
            }

            const isBatchValid = await this.isBatchBlockHeadersValid(batch);

            if (!isBatchValid) {
                logger.debug(`[${this.id}-${batchId}] Batch blocks hashes has changed, ignoring requests`);
                this.batches.delete(batchId);
                return;
            }

            this.batches.delete(batchId);
            this.callback(batch, confirmationsRequiredInfo.currentConfirmations);
        }
    }

    addBatch(batch: DataRequestBatch) {
        this.batches.set(batch.internalId, batch);
    }

    onRequestReady(callback: Callback) {
        this.callback = callback;
    }
}
