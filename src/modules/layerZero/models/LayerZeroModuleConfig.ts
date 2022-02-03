import { ModuleConfig } from "../../../models/Module";

export interface LayerZeroModuleConfig extends ModuleConfig {
    oracleContractAddress?: string;
}

export interface InternalLayerZeroModuleConfig extends ModuleConfig {
    oracleContractAddress: string;
}

export function parseLayerZeroModuleConfig(config: LayerZeroModuleConfig): InternalLayerZeroModuleConfig {
    if (typeof config.oracleContractAddress === 'undefined' || typeof config.oracleContractAddress !== 'string') throw new Error(`"oracleContractAddress" is required and must be a string`);

    return {
        ...config,
        oracleContractAddress: config.oracleContractAddress,
    };
}
