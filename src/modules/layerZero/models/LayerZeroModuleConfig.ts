import { ModuleConfig } from "../../../models/IModule";

export interface LayerZeroModuleConfig extends ModuleConfig {
    oracleContractAddress?: string;
}

export interface InternalLayerZeroModuleConfig extends ModuleConfig {
    oracleContractAddress: string;
}

export function parseLayerZeroModuleConfig(config: LayerZeroModuleConfig): InternalLayerZeroModuleConfig {
    if (typeof config.oracleContractAddress === 'undefined' || typeof config.oracleContractAddress !== 'string') throw new Error(`[LayerZeroModule] "oracleContractAddress" is required and must be a string`);

    return {
        ...config,
        oracleContractAddress: config.oracleContractAddress,
    };
}
