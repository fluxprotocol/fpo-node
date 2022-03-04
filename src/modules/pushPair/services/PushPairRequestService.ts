import Big from "big.js";
import { FetchJob } from "../../../jobs/fetch/FetchJob";
import { createDataRequestBatch } from "../../../models/DataRequestBatch";
import { OutcomeAnswer, OutcomeType } from "../../../models/Outcome";
import { PushPairInternalConfig } from '../models/PushPairConfig';
import FluxPriceFeedAbi from '../FluxPriceFeed.json';
import FluxPriceFeedFactoryAbi from '../FluxPriceFeedFactory.json';
import { PushPairDataRequest, PushPairDataRequestBatch, PushPairResolvedDataRequest } from "../models/PushPairDataRequest";
import { logger } from "@ethersproject/wordlists";
import { INetwork } from "../../../models/INetwork";

export function createBatchFromPairs(config: PushPairInternalConfig, targetNetwork: INetwork): PushPairDataRequestBatch {
    const requests: PushPairDataRequest[] = config.pairs.map((pairInfo, index) => {

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

    return createDataRequestBatch(requests) as PushPairDataRequestBatch;
}

export function createResolvePairRequest(outcome: OutcomeAnswer, request: PushPairDataRequest, config: PushPairInternalConfig): PushPairResolvedDataRequest {
    let txCallParams: PushPairResolvedDataRequest['txCallParams'] = {
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
        txCallParams,
        outcome,
    };
}

interface EvmFactoryTxParams {
    pricePairs: string[],
    decimals: number[],
    answers: string[],
}

/**
 * Creates a single data request that combines multiple data request
 * Only possible on the EVM using the factory contract
 *
 * @param {PushPairInternalConfig} config
 * @param {PushPairResolvedDataRequest[]} requests
 * @return {DataRequestResolved}
 */
export function createEvmFactoryTransmitTransaction(config: PushPairInternalConfig, requests: PushPairResolvedDataRequest[]): PushPairResolvedDataRequest {
    // As defined by the FluxPriceFeedFactory.sol:
    // https://github.com/fluxprotocol/fpo-evm/blob/feat/pricefeedfactory/contracts/FluxPriceFeedFactory.sol
    const params: EvmFactoryTxParams = {
        pricePairs: [],
        decimals: [],
        answers: [],
    };

    requests.forEach((request) => {
        if (request.outcome.type === OutcomeType.Invalid) {
            logger.warn(`[createEvmFactoryTransmitTransaction] Request ${request.internalId} was resolved to invalid`);
            return;
        }

        params.pricePairs.push(request.extraInfo.pair);
        params.decimals.push(request.extraInfo.decimals);
        params.answers.push(request.outcome.answer);
    });

    return {
        args: [],
        confirmationsRequired: new Big(0),
        createdInfo: {
            // Block info is not important for this request
            block: {
                hash: '0x000000',
                number: new Big(0),
                receiptRoot: '0x000000',
            },
        },
        extraInfo: {
            decimals: 0,
            pair: params.pricePairs.join(','),
        },
        internalId: `factory-${requests[0].internalId}`,
        originNetwork: requests[0].originNetwork,
        targetNetwork: requests[0].targetNetwork,
        outcome: {
            type: OutcomeType.Answer,
            logs: [],
            answer: params.answers.join(',')
        },
        txCallParams: {
            abi: FluxPriceFeedFactoryAbi.abi,
            address: config.contractAddress,
            amount: '0',
            method: 'transmit',
            params,
        },
    };
}
