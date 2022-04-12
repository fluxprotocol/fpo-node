import { AppConfig } from "./AppConfig";
import { IModule, ModuleConfig } from "./IModule";
import { Network } from "./Network";



export function parseUnparsedModuleConfig(config: Partial<ModuleConfig> = {}): ModuleConfig {
    if (!config.type || typeof config.type !== 'string') throw new Error(`"type" is required and must be a string`);
    if (!config.networkId || typeof config.networkId !== 'number') throw new Error(`"networkId" is required and must be a number`);

    return {
        ...config,
        type: config.type,
        networkId: config.networkId,
    }
}

export class Module implements IModule {
    static type: string = 'listener';
    type: string = 'listener';
    network: Network;
    appConfig: AppConfig;
    moduleConfig: ModuleConfig;
    id: string;

    constructor(type: string, moduleConfig: ModuleConfig, appConfig: AppConfig) {
        const network = appConfig.networks.find(network => network.networkId === moduleConfig.networkId);

        if (!network) {
            throw new Error(`Could not find network with id ${moduleConfig.networkId}`);
        }

        this.network = network;
        this.appConfig = appConfig;
        this.moduleConfig = moduleConfig;
        this.id = `${moduleConfig.type}-${moduleConfig.networkId}`;
        this.type = type;
    }

    start(): Promise<boolean> {
        throw new Error('Not implemented');
    }

    stop(): any {}
}
