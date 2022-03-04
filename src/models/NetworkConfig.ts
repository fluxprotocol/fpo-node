export interface NetworkConfig {
    type: string;
    networkId: number;
    rpc: string;
    wssRpc?: string;
    blockFetchingInterval: number;
    queueDelay: number;
    [key: string]: any;
}

export function parseUnparsedNetworkConfig(config: Partial<NetworkConfig>): NetworkConfig {
    if (!config.type || typeof config.type !== 'string') throw new Error(`"type" is required and must be a string`);
    if (!config.networkId || typeof config.networkId !== 'number') throw new Error(`"networkId" is required and must be a number`);
    if (!config.rpc || typeof config.rpc !== 'string') throw new Error(`"rpc" is required and must be a string`);
    if (config.wssRpc && typeof config.wssRpc !== 'string') throw new Error(`"wssRpc" must be a string`);
    if (config.blockFetchingInterval && typeof config.blockFetchingInterval !== 'number') throw new Error(`"blockFetchingInterval" must be a number`);
    if (config.queueDelay && typeof config.queueDelay !== 'number') throw new Error(`"queueDelay" must be a number`);

    return {
        // Spread the rest. They could contain more information per network
        ...config,
        networkId: config.networkId,
        rpc: config.rpc,
        type: config.type,
        wssRpc: config.wssRpc,
        blockFetchingInterval: config.blockFetchingInterval ?? 5_000,
        queueDelay: config.queueDelay ?? 1_000,
    };
}
