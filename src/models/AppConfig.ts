import { readFile } from 'fs/promises';
import { APP_CONFIG_LOCATION, AVAILABLE_JOBS, AVAILABLE_MODULES, AVAILABLE_NETWORKS, PROJECT_VERSION } from "../config";
import database from '../services/DatabaseService';
import { Job } from './Job';
import { Module, ModuleConfig, parseUnparsedModuleConfig } from './Module';
import { Network, NetworkConfig, parseUnparsedNetworkConfig } from "./Network";

export interface AppConfig {
    networks: Network[];
    modules: Module[];
    jobs: Job[];
}

export interface UnparsedAppConfig {
    networks?: Partial<NetworkConfig>[];
    modules?: Partial<ModuleConfig>[];
}

export async function parseAppConfig(): Promise<AppConfig> {
    const appConfig: AppConfig = {
        networks: [],
        modules: [],
        jobs: [],
    };

    const config: UnparsedAppConfig = JSON.parse((await readFile(APP_CONFIG_LOCATION)).toString('utf-8'));

    if (!config.networks || !Array.isArray(config.networks)) throw new Error(`"networks" is required and must be an array`);
    
    const db = database;
    await db.startDatabase("./", "provider_db");

    appConfig.networks = config.networks.map((networkConfig) => {
        const parsedNetworkConfig = parseUnparsedNetworkConfig(networkConfig);
        const network = AVAILABLE_NETWORKS.find(network => network.type === parsedNetworkConfig.type);

        if (!network) throw new Error(`Network type "${parsedNetworkConfig.type}" does not exist`);

        return new network(parsedNetworkConfig, db);
    });

    if (!config.modules || !Array.isArray(config.modules)) throw new Error(`at least 1 item in "modules" is required and it must be an array`);


    appConfig.modules = config.modules.map((moduleConfig) => {
        const parsedModuleConfig = parseUnparsedModuleConfig(moduleConfig);
        const module = AVAILABLE_MODULES.find(mod => mod.type === parsedModuleConfig.type);
        
        if (!module) throw new Error(`Module type "${parsedModuleConfig.type}" does not exist`);

        return new module(parsedModuleConfig, appConfig, db);
    });

    appConfig.jobs = AVAILABLE_JOBS.map(job => new job(appConfig));

    return appConfig;
}

export function createSafeAppConfigString(config: AppConfig): string {
    return JSON.stringify({
        fpoNodeVersion: PROJECT_VERSION,
        networkConfigs: config.networks.map((network) => {
            return {
                type: network.type,
                config: network.networkConfig,
                networkId: network.networkId,
            };
        }),
        moduleConfigs: config.modules.map((module) => {
            return {
                type: module.type,
                id: module.id,
                config: module.moduleConfig,
            }
        }),
    });
}
