import { Healthcheck } from '../healthCheck/Healthcheck';
import { IModule } from './IModule';
import { ModuleConfig } from './IModule';
import { IJob } from './IJob';
import { INetwork, NetworkConfig } from './INetwork';

export interface AppConfig {
    healthcheck: Healthcheck;
    networks: INetwork[];
    modules: IModule[];
    jobs: IJob[];
}

export interface UnparsedAppConfig {
    networks?: Partial<NetworkConfig>[];
    modules?: Partial<ModuleConfig>[];
}
