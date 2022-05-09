import EvmNetwork from '../../../networks/evm/EvmNetwork';
// TODO: Ask Jameson for proper JSON for methods.
import FluxPriceFeed from '../FluxPriceFeed.json';
import { NearNetwork } from "../../../networks/near/NearNetwork";
import { P2PInternalConfig } from "../models/P2PConfig";

export async function fetchEvmLastUpdate(config: P2PInternalConfig, network: EvmNetwork) {
    let timestamp = await network.view({
        method: 'latestTimestamp',
        address: config.contractAddress,
        amount: '0',
        params: {},
        abi: FluxPriceFeed.abi,
    });

    // Convert contract timestamp to milliseconds
    return timestamp.toNumber() * 1000;
}

// TODO: I don't think we support near yet?
export async function fetchNearLastUpdate(config: P2PInternalConfig, network: NearNetwork) {
    const entry = await network.view({
        method: 'get_entry',
        address: config.contractAddress,
        amount: '0',
        params: {
            provider: network.internalConfig?.account.accountId,
        },
    });

    // Convert contract timestamp to milliseconds
    return Math.floor(entry.last_update / 1000000);
}
