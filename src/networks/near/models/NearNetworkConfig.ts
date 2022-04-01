import path from 'path';
import { Account, keyStores, utils, connect, Near } from "near-api-js";
import { NetworkConfig } from "../../../models/Network";

export interface NearNetworkConfig extends NetworkConfig {
    networkType?: string;
    privateKeyEnvKey?: string;
    credentialsStorePathEnvKey?: string;
    accountId?: string;
    maxGas?: string;
}

export interface InternalNearNetworkConfig extends NetworkConfig {
    account: Account;
    maxGas: string;
    near: Near;
}

export async function parseNearNetworkConfig(config: NearNetworkConfig): Promise<InternalNearNetworkConfig> {
    if (typeof config.networkType === 'undefined' || typeof config.networkType !== 'string') throw new Error(`[Near] "networkType" is required and must be a string ("mainnet"/"testnet")`);
    if (typeof config.accountId === 'undefined' || typeof config.accountId !== 'string') throw new Error(`[Near] "accountId" is required and must be a string`);

    let keyStore: keyStores.KeyStore | undefined = undefined;

    if (typeof config.privateKeyEnvKey !== 'undefined') {
        const privateKey = process.env[config.privateKeyEnvKey];
        if (!privateKey) throw new Error(`[Near] No value found at ${config.privateKeyEnvKey}`);

        const keyPair = utils.KeyPair.fromString(privateKey);
        keyStore = new keyStores.InMemoryKeyStore();
        keyStore.setKey(config.networkType, config.accountId, keyPair);
    } else if (typeof config.credentialsStorePathEnvKey !== 'undefined') {
        const credentialsStorePath = process.env[config.credentialsStorePathEnvKey];
        if (!credentialsStorePath) throw new Error(`[Near] No value found at ${config.credentialsStorePathEnvKey}`);

        const credentialsStorePathResolved = path.resolve(credentialsStorePath) + path.sep;
        keyStore = new keyStores.UnencryptedFileSystemKeyStore(credentialsStorePathResolved);
    }

    if (!keyStore) throw new Error(`[Near] No keystore found, set either the "privateKeyEnvKey" or "credentialsStorePathEnvKey"`);

    const near = await connect({
        networkId: config.networkType,
        nodeUrl: config.rpc[0],
        keyStore,
        headers: {},
    });

    const account = await near.account(config.accountId);

    return {
        ...config,
        account,
        maxGas: config.maxGas ?? '300000000000000',
        near,
    };
}
