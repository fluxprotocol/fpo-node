import Big from "big.js";
import FluxPriceFeedAbi from '../FluxPriceFeed.json';
import FluxPriceFeedFactory2Abi from '../FluxPriceFeedFactory2.json';
import FluxPriceFeedFactoryAbi from '../FluxPriceFeedFactory.json';
import logger from "../../../services/LoggerService";
import { FetchJob } from "../../../jobs/fetch/FetchJob";
import { Network } from "../../../models/Network";
import { OutcomeAnswer, OutcomeType } from "../../../models/Outcome";
import { P2PDataRequest, P2PDataRequestBatch, P2PResolvedDataRequest } from "../models/P2PDataRequest";
import { P2PInternalConfig } from '../models/P2PConfig';
import { createDataRequestBatch } from "../../../models/DataRequestBatch";
import { ethers } from "ethers";

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

export function createResolvePairRequest(outcome: OutcomeAnswer, request: P2PDataRequest, config: P2PInternalConfig): P2PResolvedDataRequest {
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
        throw new Error(`Network type is not supported for P2PModule`);
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
 * Only possible on the EVM using the factory contract (< 2.0.0)
 *
 * @param {P2PInternalConfig} config
 * @param {P2PResolvedDataRequest[]} requests
 * @return {DataRequestResolved}
 */
export function createEvmFactoryTransmitTransaction(config: P2PInternalConfig, requests: P2PResolvedDataRequest[]): P2PResolvedDataRequest {
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

interface EvmFactoryTxParams2 {
    pricePairs: string[],
    decimals: number[],
    answers: string[],
    provider: string,
}

/**
 * Creates a single data request that combines multiple data request
 * Only possible on the EVM using the factory contract v2.0.0
 *
 * @param {P2PInternalConfig} config
 * @param {P2PResolvedDataRequest[]} requests
 * @return {DataRequestResolved}
 */
export function createEvmFactory2TransmitTransaction(config: P2PInternalConfig, requests: P2PResolvedDataRequest[]): P2PResolvedDataRequest {
    // As defined by the FluxPriceFeedFactory.sol:
    // https://github.com/fluxprotocol/fpo-evm/blob/feat/pricefeedfactory/contracts/FluxPriceFeedFactory.sol
    const params: EvmFactoryTxParams2 = {
        pricePairs: [],
        decimals: [],
        answers: [],
        provider: ethers.constants.AddressZero
    };

    requests.forEach((request) => {
        if (request.outcome.type === OutcomeType.Invalid) {
            logger.warn(`[createEvmFactory2TransmitTransaction] Request ${request.internalId} was resolved to invalid`);
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
            abi: FluxPriceFeedFactory2Abi.abi,
            address: config.contractAddress,
            amount: '0',
            method: 'transmit',
            params,
        },
    };
}
