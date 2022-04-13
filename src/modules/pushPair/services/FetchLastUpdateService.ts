import EvmNetwork from '../../../networks/evm/EvmNetwork';
import FluxPriceFeed from '../FluxPriceFeed.json';
import FluxPriceFeedFactory from '../FluxPriceFeedFactory.json';
import FluxPriceFeedFactory2 from '../FluxPriceFeedFactory2.json';
import { NearNetwork } from "../../../networks/near/NearNetwork";
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
        // Contract returns [answer, updatedAt, statusCode]
        timestamp = (await network.view({
            method: 'valueFor',
            address: config.contractAddress,
            amount: '0',
            params: {
                id: computeFactoryPairId(config.pairs[0].pair, config.pairs[0].decimals)
            },
            abi: FluxPriceFeedFactory.abi,
        }))[1];
    } else { // factory2
        timestamp = (await network.view({
            method: 'valueFor',
            address: config.contractAddress,
            amount: '0',
            params: {
                id: computeFactoryPairId(config.pairs[0].pair, config.pairs[0].decimals, network.getWalletPublicAddress()),
            },
            abi: FluxPriceFeedFactory2.abi,
        }))[1];
    }

    // Convert contract timestamp to milliseconds
    return timestamp.toNumber() * 1000;
}

export async function fetchNearLastUpdate(config: PushPairInternalConfig, network: NearNetwork) {
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
    return Math.floor(entry.last_update / 1000000);
}
