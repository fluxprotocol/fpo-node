import { ModuleConfig } from "../../../models/Module";
import { convertOldSourcePath } from "../services/PushPairJobService";

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
    pairs: Pair[];
}

export interface PushPairConfig extends ModuleConfig {
    contractAddress?: PushPairInternalConfig['contractAddress'];
    interval?: PushPairInternalConfig['interval'];
    pairs?: PushPairInternalConfig['pairs'];

}

export function parsePushPairConfig(config: PushPairConfig): PushPairInternalConfig {
    if (typeof config.contractAddress === 'undefined' || typeof config.contractAddress !== 'string') throw new Error(`[PushPairModule] "oracleContractAddress" is required and must be a string`);
    if (typeof config.interval === 'undefined' || typeof config.interval !== 'number') throw new Error(`[PushPairModule] "interval" is required and must be a number`);
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

    const pairIds = config.pairs.map(pair => pair.pair);

    return {
        ...config,
        id: `${config.type}-${config.networkId}-${pairIds.join(',')}`,
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
