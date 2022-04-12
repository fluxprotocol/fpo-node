import { PROJECT_VERSION } from "../config";
import { AppConfig } from "../models/AppConfig";

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
