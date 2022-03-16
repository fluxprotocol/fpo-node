import FluxPriceFeed from '../FluxPriceFeed.json';
import FluxPriceFeedFactory from '../FluxPriceFeedFactory.json';
import { NearNetwork } from "../../../networks/near/NearNetwork";
import { Network } from "../../../models/Network";
import { PushPairInternalConfig } from "../models/PushPairConfig";
import { computeFactoryPairId } from "./utils";

export async function fetchEvmLastUpdate(config: PushPairInternalConfig, network: Network) {
    let timeStamp;
    if (config.pairsType === 'single') {
        timeStamp = await network.view({
            method: 'latestTimestamp',
            address: config.contractAddress,
            amount: '0',
            params: {},
            abi: FluxPriceFeed.abi,
        });
    } else { // If not 'single', pairs type is 'factory'
        // Contract returns [answer, updatedAt, statusCode]
        timeStamp = (await network.view({
            method: 'valueFor',
            address: config.contractAddress,
            amount: '0',
            params: {
                id: computeFactoryPairId(config.pairs[0].pair, config.pairs[0].decimals)
            },
            abi: FluxPriceFeedFactory.abi,
        }))[1];
    }

    // Convert contract timestamp to milliseconds
    return timeStamp.toNumber() * 1000;
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
