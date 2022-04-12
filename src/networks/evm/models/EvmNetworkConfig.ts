import { NetworkConfig } from "../../../models/INetwork";

export interface EvmNetworkConfig extends NetworkConfig {
    chainId?: number;
    privateKeyEnvKey?: string;
}

export interface InternalEvmNetworkConfig extends NetworkConfig {
    chainId: number;
    privateKey: string;
}

export function parseEvmNetworkConfig(config: EvmNetworkConfig): InternalEvmNetworkConfig {
    if (typeof config.chainId === 'undefined' || typeof config.chainId !== 'number') throw new Error(`"chainId" is required and must be a number for networkId ${config.networkId} got ${config.chainId}`);
    if (typeof config.privateKeyEnvKey === 'undefined' || typeof config.privateKeyEnvKey !== 'string') throw new Error(`"privateKeyEnvKey" must be a string for networkId ${config.networkId}`);

    const privateKey = process.env[config.privateKeyEnvKey];
    if (!privateKey) throw new Error(`No value found at "${config.privateKeyEnvKey}"`);

    return {
        ...config,
        chainId: config.chainId,
        privateKey,
    };
}
