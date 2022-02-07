import { readFile } from 'fs/promises';
import { APP_CONFIG_LOCATION, AVAILABLE_LISTENERS, AVAILABLE_NETWORKS } from "../config";
import { Module, ModuleConfig, parseUnparsedModuleConfig } from './Module';
import { Network, NetworkConfig, parseUnparsedNetworkConfig } from "./Network";

export interface AppConfig {
    networks: Network[];
    modules: Module[];
}

export interface UnparsedAppConfig {
    networks?: Partial<NetworkConfig>[];
    modules?: Partial<ModuleConfig>[];
}

export async function parseAppConfig(): Promise<AppConfig> {
    const appConfig: AppConfig = {
        networks: [],
        modules: [],
    };

    const config: UnparsedAppConfig = JSON.parse((await readFile(APP_CONFIG_LOCATION)).toString('utf-8'));

    if (!config.networks || !Array.isArray(config.networks)) throw new Error(`"networks" is required and must be an array`);

    appConfig.networks = config.networks.map((networkConfig) => {
        const parsedNetworkConfig = parseUnparsedNetworkConfig(networkConfig);
        const network = AVAILABLE_NETWORKS.find(network => network.type === parsedNetworkConfig.type);

        if (!network) throw new Error(`Network type "${parsedNetworkConfig.type}" does not exist`);

        return new network(parsedNetworkConfig);
    });

    if (!config.modules || !Array.isArray(config.modules)) throw new Error(`atleast 1 item in "modules" is required and it must be an array`);

    appConfig.modules = config.modules.map((moduleConfig) => {
        const parsedModuleConfig = parseUnparsedModuleConfig(moduleConfig);
        const listener = AVAILABLE_LISTENERS.find(listener => listener.type === parsedModuleConfig.type);

        if (!listener) throw new Error(`Listener type "${parsedModuleConfig.type}" does not exist`);

        return new listener(parsedModuleConfig, appConfig);
    });



    return appConfig;
}
