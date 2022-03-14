import { ModuleConfig } from "../../../models/Module";

export interface Pair {
    address: string;
    pair?: string;
    provider?: string;
    threshold?: number;
}

export interface PairCheckerModuleConfig extends ModuleConfig {
    interval?: number;
    pairs?: Pair[];
    provider?: string;
    threshold?: number;
}

export interface InternalPairCheckerModuleConfig extends ModuleConfig {
    interval: number;
    pairs: Pair[];
    provider: string;
    threshold: number;
}

export function parsePairCheckerModuleConfig(config: PairCheckerModuleConfig): InternalPairCheckerModuleConfig {
    if (typeof config.interval === 'undefined' || typeof config.interval !== "number") throw new Error(`[PairCheckerModule] "interval" is required and must be a number`);
    if (typeof config.provider === 'undefined' || typeof config.provider !== "string") throw new Error(`[PairCheckerModule] "provider" is required and must be a string`);
    if (typeof config.threshold === 'undefined' || typeof config.threshold !== "number") throw new Error(`[PairCheckerModule] "threshold" is required and must be a number`);

    if (!Array.isArray(config.pairs)) throw new Error(`[PairCheckerModule] "pairs" is required and must be an array`);

    config.pairs.forEach((pair: Partial<Pair>) => {
        if (typeof pair.address === 'undefined' || typeof pair.address !== 'string') throw new Error(`[PairCheckerModule] "address" is required for each item in "pairs"`);
    });

    return {
        ...config,
        interval: config.interval,
        pairs: config.pairs,
        provider: config.provider,
        threshold: config.threshold,
    };
}
