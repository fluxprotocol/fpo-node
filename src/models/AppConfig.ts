import { readFile } from 'fs/promises';
import { APP_CONFIG_LOCATION, AVAILABLE_JOBS, AVAILABLE_MODULES, AVAILABLE_NETWORKS, HEALTHCHECK_ENABLED, HEALTHCHECK_PORT, PROJECT_VERSION } from "../config";
import { Healthcheck } from '../healthCheck/Healthcheck';
import { Job } from './Job';
import { Module, ModuleConfig, parseUnparsedModuleConfig } from './Module';
import { Network, NetworkConfig, parseUnparsedNetworkConfig } from "./Network";

export interface AppConfig {
    healthcheck: Healthcheck;
    networks: Network[];
    modules: Module[];
    jobs: Job[];
}

export interface UnparsedAppConfig {
    networks?: Partial<NetworkConfig>[];
    modules?: Partial<ModuleConfig>[];
}

export async function parseAppConfig(): Promise<AppConfig> {
    const config: UnparsedAppConfig = JSON.parse((await readFile(APP_CONFIG_LOCATION)).toString('utf-8'));

    let port = Number(HEALTHCHECK_PORT)
    if (isNaN(port)) throw new Error(`"HEALTHCHECK_PORT" environment variable must be a number`);
    let healthcheck = new Healthcheck({
        enabled: HEALTHCHECK_ENABLED,
        port
    });

    const appConfig: AppConfig = {
        healthcheck,
        networks: [],
        modules: [],
        jobs: [],
    };

    if (!config.networks || !Array.isArray(config.networks)) throw new Error(`"networks" is required and must be an array`);

    appConfig.networks = config.networks.map((networkConfig) => {
        const parsedNetworkConfig = parseUnparsedNetworkConfig(networkConfig);
        const network = AVAILABLE_NETWORKS.find(network => network.type === parsedNetworkConfig.type);

        if (!network) throw new Error(`Network type "${parsedNetworkConfig.type}" does not exist`);

        return new network(parsedNetworkConfig);
    });

    if (!config.modules || !Array.isArray(config.modules)) throw new Error(`at least 1 item in "modules" is required and it must be an array`);

    appConfig.modules = config.modules.map((moduleConfig) => {
        const parsedModuleConfig = parseUnparsedModuleConfig(moduleConfig);
        const module = AVAILABLE_MODULES.find(mod => mod.type === parsedModuleConfig.type);

        if (!module) throw new Error(`Module type "${parsedModuleConfig.type}" does not exist`);

        return new module(parsedModuleConfig, appConfig);
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
