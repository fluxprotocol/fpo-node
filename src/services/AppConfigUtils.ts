import { PROJECT_VERSION } from "../config";
import { AppConfig } from "../models/AppConfig";
import { PushPairInternalConfig } from "../modules/pushPair/models/PushPairConfig";

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
            // Remove `Sources` from `PushPairModule` config (it may include sensitive fields)
            if (module.type === "PushPairModule") {
                return {
                    type: module.type,
                    id: module.id,
                    config: {
                        ...module.moduleConfig,
                        pairs: (module.moduleConfig as PushPairInternalConfig).pairs.map(pair => ({ ...pair, sources: [] }))
                    }
                }
            }

            return {
                type: module.type,
                id: module.id,
                config: module.moduleConfig,
            }
        }),
    });
}
