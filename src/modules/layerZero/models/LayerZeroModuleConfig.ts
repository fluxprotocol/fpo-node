import { ModuleConfig } from "../../../models/Module";

export interface LayerZeroModuleConfig extends ModuleConfig {
    oracleContractAddress?: string;
    startingBlock?: number | "latest";
}

export interface InternalLayerZeroModuleConfig extends ModuleConfig {
    oracleContractAddress: string;
    startingBlock: number | "latest";
}

export function parseLayerZeroModuleConfig(config: LayerZeroModuleConfig): InternalLayerZeroModuleConfig {
    if (typeof config.oracleContractAddress === 'undefined' || typeof config.oracleContractAddress !== 'string') throw new Error(`[LayerZeroModule] "oracleContractAddress" is required and must be a string`);

    if (config.startingBlock) {
        if (typeof config.startingBlock === 'string' && config.startingBlock !== 'latest') throw new Error(`[LayerZeroModule] "startingBlock" must be either a number or "latest"`);
        if (typeof config.startingBlock !== 'number') throw new Error(`[LayerZeroModule] "startingBlock" must be either a number or "latest"`);
    }

    return {
        ...config,
        oracleContractAddress: config.oracleContractAddress,
        startingBlock: config.startingBlock ?? 'latest'
    };
}
