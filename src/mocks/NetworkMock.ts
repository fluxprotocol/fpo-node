import { Network, NetworkConfig } from "../models/Network";

export function createNetworkMock(config: Partial<NetworkConfig> = {}): Network {
    return new Network({
        networkId: 1,
        rpc: '',
        type: 'evm',
        wssRpc: '',
        ...config
    })
}
