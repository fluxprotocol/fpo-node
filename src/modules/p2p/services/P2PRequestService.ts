import Big from "big.js";
import FluxPriceFeedAbi from '../FluxPriceFeed.json';
import { FetchJob } from "../../../jobs/fetch/FetchJob";
import { Network } from "../../../models/Network";
import { OutcomeAnswer } from "../../../models/Outcome";
import { P2PDataRequest, P2PDataRequestBatch, P2PResolvedDataRequest } from "../models/P2PDataRequest";
import { P2PInternalConfig } from '../models/P2PConfig';
import { createDataRequestBatch } from "../../../models/DataRequestBatch";
import logger from "../../../services/LoggerService";
import { Contract } from "ethers";

export async function createBatchFromPairs(config: P2PInternalConfig, targetNetwork: Network): Promise<P2PDataRequestBatch> {
    // TODO: replace this abi with the P2P one
    const p2p_contract = new Contract(config.contractAddress, FluxPriceFeedAbi.abi);
    
    const requests: P2PDataRequest[] = await Promise.all(config.pairs.map(async (pairInfo, index) => {
        const pair_address = await p2p_contract.addressOfPricePair(pairInfo.pair);
        // This one is the correct abi (Franklin thinks :) ).
        const price_feed_contract = new Contract(pair_address, FluxPriceFeedAbi.abi);
        const latestAggregatorRoundId = await price_feed_contract.latestAggregatorRoundId;

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
                deviationPercentage: config.deviationPercentage,
                minimumUpdateInterval: config.minimumUpdateInterval,
                latestAggregatorRoundId,
            },
            internalId: `${targetNetwork.id}/p${pairInfo.pair}-d${pairInfo.decimals}`,
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
    }));

    return createDataRequestBatch(requests) as P2PDataRequestBatch;
}

export async function createResolveP2PRequest(outcome: OutcomeAnswer, request: P2PDataRequest, config: P2PInternalConfig, median?: Big): Promise<P2PResolvedDataRequest> {
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
    
    return {
        ...request,
        txCallParams,
        outcome,
        extraInfo: {
            ...request.extraInfo,
            answer: median?.toString(),
        }
    };
}


export function shouldMedianUpdate(pair: P2PDataRequest, lastUpdate: number, newMedian: Big, oldMedian?: Big): boolean {
    // This is probably the first time we are pushing
    if (!oldMedian || oldMedian.eq(0)) {
        logger.debug(`[PushPairModule] ${pair.extraInfo.pair} there is no old price, pushing a new one`);
        return true;
    }

    const timeSinceUpdate = Date.now() - lastUpdate;

    // There hasn't been an update in a while, we should just update
    if (timeSinceUpdate >= pair.extraInfo.minimumUpdateInterval) {
        logger.debug(`[PushPairModule] ${pair.extraInfo.pair} needs update because last update was ${timeSinceUpdate}ms ago (minimum ${pair.extraInfo.minimumUpdateInterval}ms)`);
        return true;
    }

    const valueChange = newMedian.minus(oldMedian);
    const percentageChange = valueChange.div(oldMedian).times(100);

    if (percentageChange.lt(0)) {
        const shouldUpdate = percentageChange.lte(-pair.extraInfo.deviationPercentage);

        if (shouldUpdate) {
            logger.debug(`[PushPairModule] ${pair.extraInfo.pair} needs update because deviation of ${percentageChange.toString()} (max -${pair.extraInfo.deviationPercentage}%)`);
        }

        return shouldUpdate;
    }

    const shouldUpdate = percentageChange.gte(pair.extraInfo.deviationPercentage);

    if (shouldUpdate) {
        logger.debug(`[PushPairModule] ${pair.extraInfo.pair} needs update because deviation of ${percentageChange.toString()} (max ${pair.extraInfo.deviationPercentage}%)`);
    }

    return shouldUpdate;
}