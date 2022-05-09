import Big from "big.js";
import FluxPriceFeedAbi from '../FluxPriceFeed.json';
import { FetchJob } from "../../../jobs/fetch/FetchJob";
import { Network } from "../../../models/Network";
import { OutcomeAnswer } from "../../../models/Outcome";
import { P2PDataRequest, P2PDataRequestBatch, P2PResolvedDataRequest } from "../models/P2PDataRequest";
import { P2PInternalConfig } from '../models/P2PConfig';
import { createDataRequestBatch } from "../../../models/DataRequestBatch";
import { aggregate } from "../../../p2p/aggregator";
import Communicator from "../../../p2p/communication";

export function createBatchFromPairs(config: P2PInternalConfig, targetNetwork: Network): P2PDataRequestBatch {
    const requests: P2PDataRequest[] = config.pairs.map((pairInfo, index) => {

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
                decimals: pairInfo.decimals,
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

    return createDataRequestBatch(requests) as P2PDataRequestBatch;
}

export async function createResolveP2PRequest(p2p: Communicator, outcome: OutcomeAnswer, request: P2PDataRequest, config: P2PInternalConfig): Promise<P2PResolvedDataRequest> {
    let txCallParams: P2PResolvedDataRequest['txCallParams'] = {
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
            abi: FluxPriceFeedAbi.abi, // TODO: Same as for other ABI
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
                price: outcome.answer,
            },
        };
    } else {
        throw new Error(`Network type is not supported for P2PModule`);
    }

    let median: string | undefined = undefined;
    await aggregate(p2p, new Big(outcome.answer), async (median_to_send?: Big) => {
        if (median_to_send !== undefined) {
            median = median_to_send.toString();
        }
    });

    return {
        ...request,
        txCallParams,
        outcome,
        extraInfo: {
            ...request.extraInfo,
            answer: median,
        }
    };
}
