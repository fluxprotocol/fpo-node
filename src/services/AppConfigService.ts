import PeerId, { JSONPeerId } from "peer-id";

import { HEALTHCHECK_ENABLED, HEALTHCHECK_PORT } from "../config";
import { Healthcheck } from '../healthCheck/Healthcheck';
import { AppConfig, UnparsedAppConfig, P2PConfig } from '../models/AppConfig';
import { parseUnparsedModuleConfig } from '../models/Module';
import { parseUnparsedNetworkConfig } from '../models/Network';
import { AVAILABLE_JOBS, AVAILABLE_MODULES, AVAILABLE_NETWORKS } from '../modules';

export async function parseAppConfig(config: UnparsedAppConfig): Promise<AppConfig> {
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

    if (config.p2p) {
        let p2p: P2PConfig[] = [];
        for (const p2pConfig of config.p2p) {
            if (typeof p2pConfig.peer_id === 'undefined') throw new Error(`"peer_id" should be an object containing: "id", "pubKey?", "privKey?"`);
            if (!Array.isArray(p2pConfig.peers) || p2pConfig.peers.length === 0) throw new Error(`"p2p.peers" is required and should be an array of strings`);
            if (typeof p2pConfig.addresses === 'undefined') throw new Error(`"p2p.addresses" should be an object containing: "listen:string[]"`);
            if (typeof p2pConfig.addresses.listen === 'undefined' || !Array.isArray(p2pConfig.addresses.listen)) throw new Error(`"p2p.addresses.listen" should be an array of strings`);
            if (typeof p2pConfig.networkId === 'undefined') throw new Error(`"p2p.networkId" is required`);

            p2p.push(<P2PConfig>{
                networkId: p2pConfig.networkId,
                peer_id: await PeerId.createFromJSON(p2pConfig.peer_id),
                p2p_node: p2pConfig.p2p_node,
                peers: new Set(p2pConfig.peers),
                addresses: {
                    listen: p2pConfig.addresses.listen,
                }
            });
        }
        appConfig.p2p = p2p;
    }

    if (!config.networks || !Array.isArray(config.networks)) throw new Error(`"networks" is required and must be an array`);

    appConfig.networks = config.networks.map((networkConfig) => {
        const parsedNetworkConfig = parseUnparsedNetworkConfig(networkConfig);
        const network = AVAILABLE_NETWORKS.find(network => network.type === parsedNetworkConfig.type);

        if (!network) throw new Error(`Network type "${parsedNetworkConfig.type}" does not exist`);

        return new network(parsedNetworkConfig);
    });

    appConfig.jobs = AVAILABLE_JOBS.map(job => new job(appConfig));

    if (!config.modules || !Array.isArray(config.modules)) throw new Error(`at least 1 item in "modules" is required and it must be an array`);

    appConfig.modules = config.modules.map((moduleConfig) => {
        const parsedModuleConfig = parseUnparsedModuleConfig(moduleConfig);
        const module = AVAILABLE_MODULES.find(mod => mod.type === parsedModuleConfig.type);

        if (!module) throw new Error(`Module type "${parsedModuleConfig.type}" does not exist`);

        return new module(parsedModuleConfig, appConfig);
    });



    return appConfig;
}
