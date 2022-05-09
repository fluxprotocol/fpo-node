import { ModuleConfig } from "../../../models/IModule";
import { convertOldSourcePath } from "../services/utils";

export interface Source {
    source_path: string;
    end_point: string;
    multiplier?: string;
    http_method?: string;
    http_body?: string;
    http_headers?: {
        [key: string]: string;
    };
}

export interface Pair {
    pair: string;
    sources: Source[];
    decimals: number;
}

export interface PushPairInternalConfig extends ModuleConfig {
    id: string;
    contractAddress: string;
    interval: number;
    deviationPercentage: number;
    minimumUpdateInterval: number;
    pairs: Pair[];
    pairsType: 'factory' | 'single' | 'factory2'
}

export interface PushPairConfig extends ModuleConfig {
    contractAddress?: PushPairInternalConfig['contractAddress'];
    interval?: PushPairInternalConfig['interval'];
    pairs?: PushPairInternalConfig['pairs'];
    pairsType?: PushPairInternalConfig['pairsType'];
    deviationPercentage?: PushPairInternalConfig['deviationPercentage'];
    minimumUpdateInterval?: PushPairInternalConfig['minimumUpdateInterval'];
}

export function parsePushPairConfig(config: PushPairConfig): PushPairInternalConfig {
    if (typeof config.contractAddress === 'undefined' || typeof config.contractAddress !== 'string') throw new Error(`[PushPairModule] "oracleContractAddress" is required and must be a string`);
    if (typeof config.interval === 'undefined' || typeof config.interval !== 'number') throw new Error(`[PushPairModule] "interval" is required and must be a number`);
    if (typeof config.deviationPercentage !== 'undefined' && typeof config.deviationPercentage !== 'number') throw new Error(`[PushPairModule] "deviationPercentage" should be a number`);
    if (typeof config.minimumUpdateInterval !== 'undefined' && typeof config.minimumUpdateInterval !== 'number') throw new Error(`[PushPairModule] "minimumUpdateInterval" should be a number`);
    if (!Array.isArray(config.pairs)) throw new Error(`[PushPairModule] "pairs" is required and must be an array`);

    config.pairs.forEach((pair: Partial<Pair>) => {
        if (typeof pair.pair === 'undefined' || typeof pair.pair !== 'string') throw new Error(`[PushPairModule] "pair" is required for each item in "pairs"`);
        if (typeof pair.decimals === 'undefined' || typeof pair.decimals !== 'number') throw new Error(`[PushPairModule] "decimals" is required for each item in "pairs"`);

        if (!Array.isArray(pair.sources)) throw new Error(`[PushPairModule] "sources" is required for each item in "pairs"`);

        pair.sources.forEach((source: Partial<Source>) => {
            if (typeof source.source_path === 'undefined' || typeof source.source_path !== 'string') throw new Error(`[PushPairModule] "source_path" is required for each item in "sources"`);
            if (typeof source.end_point === 'undefined' || typeof source.end_point !== 'string') throw new Error(`[PushPairModule] "end_point" is required for each item in "sources"`);
        });
    });

    if (typeof config.pairsType !== 'undefined') {
        if (config.pairsType !== 'factory' && config.pairsType !== 'factory2' && config.pairsType !== 'single') {
            throw new Error(`[PushPairModule] "pairsType" must be either "factory", "single" or "factory2"`);
        }
    }

    const pairIds = config.pairs.map(pair => pair.pair);

    return {
        ...config,
        id: `${config.type}-${config.networkId}-${pairIds.join(',')}`,
        deviationPercentage: config.deviationPercentage ?? 0.5,
        minimumUpdateInterval: config.minimumUpdateInterval ?? 1,
        pairsType: config.pairsType ?? 'single',
        contractAddress: config.contractAddress,
        interval: config.interval,
        pairs: config.pairs.map((pair) => ({
            ...pair,
            sources: pair.sources.map((source) => ({
                ...source,
                source_path: convertOldSourcePath(source.source_path),
            }))
        })),
    };
}
