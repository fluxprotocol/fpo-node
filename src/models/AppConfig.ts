import { CreateOptions } from "libp2p";

import { Healthcheck } from '../healthCheck/Healthcheck';
import { IModule } from './IModule';
import { ModuleConfig } from './IModule';
import { IJob } from './IJob';
import { INetwork, NetworkConfig } from './INetwork';

import PeerId, { JSONPeerId } from "peer-id";

export interface AppConfig {
    healthcheck: Healthcheck;
    networks: INetwork[];
    modules: IModule[];
    jobs: IJob[];
    peer_id: PeerId;
    p2p_node: CreateOptions;
    peers_file: string;
}

export interface UnparsedAppConfig {
    networks?: Partial<NetworkConfig>[];
    modules?: Partial<ModuleConfig>[];
    peer_id: JSONPeerId;
    p2p_node: CreateOptions,
    peers_file: string,
}
