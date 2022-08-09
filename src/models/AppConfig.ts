import { CreateOptions } from "libp2p";

import { Healthcheck } from '../healthCheck/Healthcheck';
import { IModule } from './IModule';
import { ModuleConfig } from './IModule';
import { IJob } from './IJob';
import { INetwork, NetworkConfig } from './INetwork';

import PeerId, { JSONPeerId } from "peer-id";

export interface P2PConfig {
    peer_id: PeerId;
    networkId: number;
    p2p_node?: CreateOptions;
    peers: Set<string>;
    addresses: {
        listen: string[];
    }
}

interface UnparsedP2PConfig {
    peer_id: JSONPeerId;
    networkId: number;
    p2p_node?: CreateOptions;
    peers: string[];
    addresses: {
        listen: string[];
    }
}

export interface AppConfig {
    healthcheck: Healthcheck;
    networks: INetwork[];
    modules: IModule[];
    jobs: IJob[];
    p2p?: P2PConfig[];
}

export interface UnparsedAppConfig {
    networks?: Partial<NetworkConfig>[];
    modules?: Partial<ModuleConfig>[];
    p2p?: Partial<UnparsedP2PConfig>[];
}
