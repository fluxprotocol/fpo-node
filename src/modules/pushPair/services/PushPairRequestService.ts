import Big from "big.js";
import { FetchJob } from "../../../jobs/fetch/FetchJob";
import { DataRequest, DataRequestResolved } from "../../../models/DataRequest";
import { createDataRequestBatch, DataRequestBatch } from "../../../models/DataRequestBatch";
import { Network } from "../../../models/Network";
import { OutcomeAnswer } from "../../../models/Outcome";
import { PushPairInternalConfig } from '../models/PushPairConfig';
import FluxPriceFeedAbi from '../FluxPriceFeed.json';

export function createBatchFromPairs(config: PushPairInternalConfig, targetNetwork: Network): DataRequestBatch {
    const requests: DataRequest[] = config.pairs.map((pairInfo, index) => {

        return {
            args: [
                FetchJob.type,
                JSON.stringify(pairInfo.sources),
                'number',
                (10 ** pairInfo.decimals).toString(),
            ],
            confirmationsRequired: new Big(0),
            extraInfo: {
                pair: pairInfo.pair,
            },
            internalId: `${targetNetwork.id}/p${pairInfo.pair}-d${pairInfo.decimals}-i${index}`,
            originNetwork: targetNetwork,
            targetNetwork,
            createdInfo: {
                // Block info is not important for this request
                block: {
                    hash: '0x000000',
                    number: new Big(0),
                    receiptRoot: '0x000000',
                },
            },
        }
    });

    return createDataRequestBatch(requests);
}

export function createResolvePairRequest(outcome: OutcomeAnswer, request: DataRequest, config: PushPairInternalConfig): DataRequestResolved {
    let txCallParams: DataRequestResolved['txCallParams'] = {
        address: config.contractAddress,
        amount: '0',
        method: '',
        params: {},
    };

    if (request.targetNetwork.type === 'evm') {
        txCallParams = {
            ...txCallParams,
            amount: '0',
            method: 'transmit',
            abi: FluxPriceFeedAbi.abi,
            params: {
                _answer: outcome.answer,
            },
        };
    } else if (request.targetNetwork.type === 'near') {
        txCallParams = {
            ...txCallParams,
            amount: '0',
            method: 'push_data',
            params: {
                pair: request.extraInfo.pair,
                price: outcome.answer,
            },
        };
    } else {
        throw new Error(`Network type is not supported for PushPairModule`);
    }

    return {
        ...request,
        logs: outcome.logs,
        txCallParams,
    };
}
