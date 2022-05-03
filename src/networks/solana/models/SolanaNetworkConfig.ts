import { NetworkConfig } from "../../../models/INetwork";

export interface SolanaNetworkConfig extends NetworkConfig {
    privateKeyEnvKey?: string;
}

export interface InternalSolanaNetworkConfig extends NetworkConfig {
    privateKey: string;
}

export function parseSolanaNetworkConfig(config: SolanaNetworkConfig): InternalSolanaNetworkConfig {
    if (typeof config.privateKeyEnvKey === 'undefined' || typeof config.privateKeyEnvKey !== 'string') throw new Error(`"privateKeyEnvKey" must be a string for networkId ${config.networkId}`);

    const privateKey = process.env[config.privateKeyEnvKey];
    if (!privateKey) throw new Error(`No value found at "${config.privateKeyEnvKey}"`);

    return {
        ...config,
        privateKey,
    };
}
