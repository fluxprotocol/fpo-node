import { NetworkConfig } from "../models/INetwork";
import { Network } from "../models/Network";

export function createNetworkMock(config: Partial<NetworkConfig> = {}): Network {
    return new Network('network', {
        networkId: 1,
        rpc: '',
        type: 'evm',
        wssRpc: '',
        blockFetchingInterval: 5000,
        queueDelay: 5000,
        ...config
    })
}
