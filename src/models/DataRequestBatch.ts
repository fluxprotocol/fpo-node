import { Block } from "./Block";
import { DataRequest } from "./DataRequest";

export interface DataRequestBatch {
    internalId: string;
    requests: DataRequest[];
}

export function createDataRequestBatch(requests: DataRequest[]): DataRequestBatch {
    return {
        requests,
        internalId: requests.map(r => r.internalId).join(','),
    }
}

/**
 * Makes sure all requests in the batch are confirmed enough to start executing
 * NOTICE: this does not check if the block number still equal the block number of the request
 *
 * @export
 * @param {DataRequestBatch} batch
 * @param {Block} currentBlock
 * @return {boolean}
 */
export function hasBatchEnoughConfirmations(batch: DataRequestBatch, currentBlock: Block): boolean {
    let confirmed = true;

    batch.requests.forEach((request) => {
        const currentConfirmations = currentBlock.number.minus(request.createdInfo.block.number);

        if (!currentConfirmations.gte(request.confirmationsRequired)) {
            confirmed = false;
        }
    });

    return confirmed;
}
