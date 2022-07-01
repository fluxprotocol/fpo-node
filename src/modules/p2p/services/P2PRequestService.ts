import Big from "big.js";
import FluxP2PFactory from '../FluxP2PFactory.json';
import { FetchJob } from "../../../jobs/fetch/FetchJob";
import { Network } from "../../../models/Network";
import { OutcomeType } from "../../../models/Outcome";
import { P2PDataRequest, P2PDataRequestBatch, P2PResolvedDataRequest } from "../models/P2PDataRequest";
import { P2PInternalConfig } from '../models/P2PConfig';
import { createDataRequestBatch } from "../../../models/DataRequestBatch";
import logger from "../../../services/LoggerService";
import { BigNumber, ethers } from "ethers";
import { AggregateResult } from "../../../p2p/aggregator";
import { fromString, toString } from "uint8arrays";

export async function getRoundIdForPair(config: P2PInternalConfig, network: Network, pairId: string, decimals: number, computedId: string): Promise<Big> {
    try {
        if (network.type === 'evm') {
            console.log('[] computedId -> ', computedId);

            const latestRound: BigNumber = await network.view({
                address: config.contractAddress,
                method: 'latestRoundOfPricePair',
                params: {
                    _id: computedId,
                },
                abi: FluxP2PFactory.abi,
            });

            return new Big(latestRound.toString()).add(1);
        }

        // TODO: Near currently does not have a latest round...
        return new Big(5);
    } catch (error) {
        if (error instanceof Error) {
            // Price pair does not exist yet
            if (error.message === 'NULL_ADDRESS') {
                return new Big(0);
            }
        }

        throw error;
    }
}

export async function getMinSignersForPair(config: P2PInternalConfig, network: Network, computedId: string): Promise<Big> {
    try {
        if (network.type === 'evm') {
            console.log('[] computedId -> ', computedId);

            const latestRound: BigNumber = await network.view({
                address: config.contractAddress,
                method: 'getMinSigners',
                params: {
                    _id: computedId,
                },
                abi: FluxP2PFactory.abi,
            });

            return new Big(latestRound.toString());
        }

        // TODO: Near currently does not have a latest round...
        return new Big(5);
    } catch (error) {
        if (error instanceof Error) {
            // Price pair does not exist yet
            if (error.message === 'NULL_ADDRESS') {
                return new Big(0);
            }
        }

        throw error;
    }
}


export function createBatchFromPairs(config: P2PInternalConfig, targetNetwork: Network): P2PDataRequestBatch {
    const requests: P2PDataRequest[] = config.pairs.map((pairInfo) => {

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
                p2pReelectWaitTimeMs: config.p2pReelectWaitTimeMs,
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
    });

    return createDataRequestBatch(requests) as P2PDataRequestBatch;
}

export function createResolveP2PRequest(aggregateResult: AggregateResult, hashFeedId: string, roundId: Big, request: P2PDataRequest, config: P2PInternalConfig): P2PResolvedDataRequest {
    let txCallParams: P2PResolvedDataRequest['txCallParams'] = {
        address: config.contractAddress,
        amount: '0',
        method: '',
        params: {},
    };

    const reports = Array.from(aggregateResult.reports);
    console.log(`[${reports.length}] reports -> `, reports);
    reports.sort((a, b) => Number(a.data) - Number(b.data))
    // console.log("**sorted reports: ", reports)
    
    if (request.targetNetwork.type === 'evm') {
        // const signatures = reports.map((report) => toString(fromString(report.signature, 'base64')));
        const signatures = reports.map((report) => toString(fromString(report.signature)));

        // const answers = reports.map(report => BigNumber.from(report.data));
        const answers = reports.map(report => report.data);

        const timestamps = reports.map(report => report.timestamp);

        txCallParams = {
            ...txCallParams,
            amount: '0',
            method: 'transmit',
            abi: FluxP2PFactory.abi,
            params: {
                _signatures: signatures,
                _id: hashFeedId,
                _answers: answers,
                _timestamps: timestamps,
            },
        };
    }
    // else if (request.targetNetwork.type === 'near') {
    //     txCallParams = {
    //         ...txCallParams,
    //         amount: '0',
    //         method: 'push_data',
    //         params: {
    //             price: outcome.answer,
    //         },
    //     };
    // } 
    else {
        throw new Error(`Network type is not supported for P2PModule`);
    }

    return {
        ...request,
        txCallParams,
        outcome: {
            answer: '',
            logs: [],
            type: OutcomeType.Answer,
        },
        extraInfo: {
            ...request.extraInfo,
        }
    };
}

export function shouldMedianUpdate(req: P2PDataRequest, lastUpdate: number, newMedian: Big, oldMedian?: Big): boolean {
    // This is probably the first time we are pushing
    if (!oldMedian || oldMedian.eq(0)) {
        logger.debug(`[PushPairModule] ${req.extraInfo.pair} there is no old price, pushing a new one`);
        return true;
    }

    const timeSinceUpdate = Date.now() - lastUpdate;

    // There hasn't been an update in a while, we should just update
    if (timeSinceUpdate >= req.extraInfo.minimumUpdateInterval) {
        logger.debug(`[PushPairModule] ${req.extraInfo.pair} needs update because last update was ${timeSinceUpdate}ms ago (minimum ${req.extraInfo.minimumUpdateInterval}ms)`);
        return true;
    }

    const valueChange = newMedian.minus(oldMedian);
    const percentageChange = valueChange.div(oldMedian).times(100);

    if (percentageChange.lt(0)) {
        const shouldUpdate = percentageChange.lte(-req.extraInfo.deviationPercentage);

        if (shouldUpdate) {
            logger.debug(`[PushPairModule] ${req.extraInfo.pair} needs update because deviation of ${percentageChange.toString()} (max -${req.extraInfo.deviationPercentage}%)`);
        }

        return shouldUpdate;
    }

    const shouldUpdate = percentageChange.gte(req.extraInfo.deviationPercentage);

    if (shouldUpdate) {
        logger.debug(`[PushPairModule] ${req.extraInfo.pair} needs update because deviation of ${percentageChange.toString()} (max ${req.extraInfo.deviationPercentage}%)`);
    }

    return shouldUpdate;
}
