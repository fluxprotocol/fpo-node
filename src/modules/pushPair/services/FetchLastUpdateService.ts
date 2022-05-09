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

export async function fetchEvmLastUpdate(config: PushPairInternalConfig, network: EvmNetwork) {
    let timestamp;

    if (config.pairsType === 'single') {
        timestamp = await network.view({
            method: 'latestTimestamp',
            address: config.contractAddress,
            amount: '0',
            params: {},
            abi: FluxPriceFeed.abi,
        });
    } else if (config.pairsType === 'factory') {
        let pairTimestamps: Big[] = [];
        for await (let pair of config.pairs) {
            // Contract returns [answer, updatedAt, statusCode]
            const pairTimestamp = (await network.view({
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

        timestamp = pairTimestamps.reduce((prev, next) => prev.gt(next) ? next : prev);
    } else { // factory2
        let pairTimestamps: Big[] = [];
        for await (let pair of config.pairs) {
            // Contract returns [answer, updatedAt, statusCode]
            const pairTimestamp = (await network.view({
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

        timestamp = pairTimestamps.reduce((prev, next) => prev.gt(next) ? next : prev);
    }

    // Convert contract timestamp to milliseconds
    return timestamp.toNumber() * 1000;
}

export async function fetchNearLastUpdate(config: PushPairInternalConfig, network: NearNetwork) {
    let pairTimestamps: number[] = [];
    for await (let pair of config.pairs) {
        const entry = await network.view({
            method: 'get_entry',
            address: config.contractAddress,
            amount: '0',
            params: {
                provider: network.internalConfig?.account.accountId,
                pair: config.pairs[0].pair,
            },
        });

        // Convert contract timestamp to milliseconds
        pairTimestamps.push(Math.floor(entry.last_update / 1000000));
    }

    const timestamp = pairTimestamps.reduce((prev, next) => prev > next ? next : prev);

    return timestamp;
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
