import { Database } from "better-sqlite3";
import Big from "big.js";
import { Block } from "./Block";
import { DataRequest, DataRequestResolved } from "./DataRequest";
import { INetwork } from "./INetwork";

export interface DataRequestBatch {
    internalId: string;
    targetNetwork: INetwork;
    requests: DataRequest[];
}

export interface DataRequestBatchResolved extends DataRequestBatch {
    targetAddress: string;
    requests: DataRequestResolved[];
    db?: Database;
}

let nonce = 0;

export function createDataRequestBatch(requests: DataRequest[]): DataRequestBatch {
    // Making sure no two requests will match each other
    nonce++;

    // We assume that batches are all on the same network.
    // Otherwise that would defeat the purpose of batches..
    const network = requests[0].targetNetwork;

    return {
        requests,
        targetNetwork: network,
        internalId: nonce + '-' + requests.map(r => r.internalId).join(','),
    }
}

export interface EnoughConfirmationsDetails {
    confirmed: boolean;
    confirmationsNeeded: Big;
    currentConfirmations: Big;
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
export function hasBatchEnoughConfirmations(batch: DataRequestBatch, currentBlock: Block): EnoughConfirmationsDetails {
    let confirmed = true;
    let mostConfirmationsNeeded = new Big(0);
    let mostCurrentConfirmations = new Big(0);

    batch.requests.forEach((request) => {
        const currentConfirmations = currentBlock.number.minus(request.createdInfo.block.number);

        if (!currentConfirmations.gte(request.confirmationsRequired)) {
            confirmed = false;
        }

        if (mostConfirmationsNeeded.lt(request.confirmationsRequired)) {
            mostConfirmationsNeeded = request.confirmationsRequired;
            mostCurrentConfirmations = currentConfirmations;
        }
    });

    return {
        confirmed,
        confirmationsNeeded: mostConfirmationsNeeded,
        currentConfirmations: mostCurrentConfirmations,
    };
}
