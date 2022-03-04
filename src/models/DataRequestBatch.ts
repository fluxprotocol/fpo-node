import Big from "big.js";
import database from "../services/DatabaseService";
import { AppConfig } from "./AppConfig";
import { Block } from "./Block";
import { DataRequest, DataRequestResolved } from "./DataRequest";
import { Network } from "./Network";

export interface DataRequestBatch {
    internalId: string;
    targetNetwork: Network;
    requests: DataRequest[];
}

export interface DataRequestBatchResolved extends DataRequestBatch {
    targetAddress: string;
    requests: DataRequestResolved[];
}

export async function storeDataRequestBatchResolved(tableKey: string, item: DataRequestBatchResolved) {
    // Since we use classes for each request we need to convert them in a JSON friendly way
    const obj = {
        ...item,
        targetNetwork: item.targetNetwork.networkId,
        requests: item.requests.map((request) => {
            return {
                ...request,
                originNetwork: request.originNetwork.networkId,
                targetNetwork: request.targetNetwork.networkId,
                confirmationsRequired: request.confirmationsRequired.toString(),
                createdInfo: {
                    ...request.createdInfo,
                    block: {
                        ...request.createdInfo.block,
                        number: request.createdInfo.block.number.toString(),
                    }
                },
            };
        }),
    };

    await database.createDocument(tableKey, item.internalId, obj);
}

export function hydrateDataRequestBatchResolved(obj: any, appconfig: AppConfig): DataRequestBatchResolved {
    const targetNetwork = appconfig.networks.find(n => n.networkId === obj.targetNetwork);

    // restore back from what's created by the above function
    const result: DataRequestBatchResolved = {
        ...obj,
        targetNetwork,
        requests: obj.requests.map((request: any) => {
            const targetNetwork = appconfig.networks.find(n => n.networkId === request.targetNetwork);
            const originNetwork = appconfig.networks.find(n => n.networkId === request.originNetwork);

            return {
                ...request,
                originNetwork,
                targetNetwork,
                confirmationsRequired: new Big(request.confirmationsRequired),
                createdInfo: {
                    ...request.createdInfo,
                    block: {
                        ...request.createdInfo.block,
                        number: new Big(request.createdInfo.block.number),
                    }
                },
            }
        }),
    };

    return result;
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
