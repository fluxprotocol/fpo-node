import Big from 'big.js';
import EvmNetwork from '../../../networks/evm/EvmNetwork';
import FluxPriceFeed from '../FluxPriceFeed.json';
import FluxPriceFeedFactory from '../FluxPriceFeedFactory.json';
import FluxPriceFeedFactory2 from '../FluxPriceFeedFactory2.json';
import { NearNetwork } from "../../../networks/near/NearNetwork";
import { Network } from '../../../models/Network';
import { PushPairDataRequest } from '../models/PushPairDataRequest';
import { PushPairInternalConfig } from "../models/PushPairConfig";
import { computeFactoryPairId } from "./utils";
import { BigNumber } from 'ethers';

interface TimestampUpdateReport {
    oldestTimestamp: number;
    timestamps: number[];
}

export async function fetchEvmLastUpdate(config: PushPairInternalConfig, network: EvmNetwork): Promise<TimestampUpdateReport> {
    let lastUpdated: BigNumber;
    let allPairTimestamps: number[];

    if (config.pairsType === 'single') {
        lastUpdated = await network.view({
            method: 'latestTimestamp',
            address: config.contractAddress,
            amount: '0',
            params: {},
            abi: FluxPriceFeed.abi,
        });

        allPairTimestamps = [lastUpdated.mul(1000).toNumber()];
    } else if (config.pairsType === 'factory') {
        let pairTimestamps: BigNumber[] = [];

        for await (let pair of config.pairs) {
            // Contract returns [answer, updatedAt, statusCode]
            const pairTimestamp: BigNumber = (await network.view({
                method: 'valueFor',
                address: config.contractAddress,
                amount: '0',
                params: {
                    id: computeFactoryPairId(pair.pair, pair.decimals)
                },
                abi: FluxPriceFeedFactory.abi,
            }))[1];

            pairTimestamps.push(pairTimestamp);
        }

        lastUpdated = pairTimestamps.reduce((prev, next) => prev.gt(next) ? next : prev);
        allPairTimestamps = pairTimestamps.map(t => t.mul(1000).toNumber());
    } else { // factory2
        let pairTimestamps: BigNumber[] = [];

        for await (let pair of config.pairs) {
            // Contract returns [answer, updatedAt, statusCode]
            const pairTimestamp: BigNumber = (await network.view({
                method: 'valueFor',
                address: config.contractAddress,
                amount: '0',
                params: {
                    id: computeFactoryPairId(pair.pair, pair.decimals, network.getWalletPublicAddress()),
                },
                abi: FluxPriceFeedFactory2.abi,
            }))[1];

            pairTimestamps.push(pairTimestamp);
        }

        lastUpdated = pairTimestamps.reduce((prev, next) => prev.gt(next) ? next : prev);
        allPairTimestamps = pairTimestamps.map(t => t.mul(1000).toNumber());
    }

    return {
        oldestTimestamp: lastUpdated.mul(1000).toNumber(),
        timestamps: allPairTimestamps,
    };
}

export async function fetchNearLastUpdate(config: PushPairInternalConfig, network: NearNetwork): Promise<TimestampUpdateReport> {
    let pairTimestamps: number[] = [];
    for await (let pair of config.pairs) {
        const entry = await network.view({
            method: 'get_entry',
            address: config.contractAddress,
            amount: '0',
            params: {
                provider: network.internalConfig?.account.accountId,
                pair: pair.pair,
            },
        });

        // Convert contract timestamp to milliseconds
        pairTimestamps.push(Math.floor(entry.last_update / 1000000));
    }

    const timestamp = pairTimestamps.reduce((prev, next) => prev > next ? next : prev);

    return {
        oldestTimestamp: timestamp,
        timestamps: pairTimestamps,
    };
}

export async function fetchLatestPrice(config: PushPairInternalConfig, pair: PushPairDataRequest, network: Network): Promise<Big> {
    if (network.type === 'evm') {
        if (config.pairsType === 'factory') {
            const result = (await network.view({
                method: 'valueFor',
                address: config.contractAddress,
                amount: '0',
                params: {
                    id: computeFactoryPairId(pair.extraInfo.pair, pair.extraInfo.decimals)
                },
                abi: FluxPriceFeedFactory.abi,
            }))[0];

            return new Big(result.toString());
        } else if (config.pairsType === 'factory2') {
            const result = (await network.view({
                method: 'valueFor',
                address: config.contractAddress,
                amount: '0',
                params: {
                    id: computeFactoryPairId(pair.extraInfo.pair, pair.extraInfo.decimals, (network as EvmNetwork).getWalletPublicAddress()),
                },
                abi: FluxPriceFeedFactory2.abi,
            }))[0];

            return new Big(result.toString());
        } else if (config.pairsType === 'single') {
            const result = await network.view({
                method: 'latestAnswer',
                address: config.contractAddress,
                amount: '0',
                params: {},
                abi: FluxPriceFeed.abi,
            });

            return new Big(result.toString());
        }
    } else if (network.type === 'near') {
        const result = await network.view({
            method: 'get_entry',
            address: config.contractAddress,
            amount: '0',
            params: {
                provider: (network as NearNetwork).internalConfig?.account.accountId,
                pair: pair.extraInfo.pair,
            },
        });

        return new Big(result.price);
    }

    throw new Error('Network not found');
}
