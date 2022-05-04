import { ModuleConfig } from "../../../models/IModule";
import { Pair } from "../../pushPair/models/PushPairConfig";

export interface CheckingPair extends Pair {
    address: string;
    deviationPercentage: number;
    minimumUpdateInterval: number;
    provider?: string;
}

export interface PairDeviationCheckerModuleConfig extends ModuleConfig {
    interval?: number;
    pairs?: CheckingPair[];
    provider?: string;
}

export interface InternalPairDeviationCheckerModuleConfig extends ModuleConfig {
    interval: number;
    provider: string;
    pairs: CheckingPair[];
}

export function parsePairDeviationCheckerModuleConfig(config: PairDeviationCheckerModuleConfig): InternalPairDeviationCheckerModuleConfig {
    if (typeof config.interval === 'undefined' || typeof config.interval !== "number") throw new Error(`[PairDeviationCheckerModule] "interval" is required and must be a number`);
    if (typeof config.provider === 'undefined' || typeof config.provider !== "string") throw new Error(`[PairDeviationCheckerModule] "provider" is required and must be a string`);
    // if (typeof config.threshold === 'undefined' || typeof config.threshold !== "number") throw new Error(`[PairDeviationCheckerModule] "threshold" is required and must be a number`);

    if (!Array.isArray(config.pairs)) throw new Error(`[PairDeviationCheckerModule] "pairs" is required and must be an array`);
    config.pairs.forEach((pair: Partial<CheckingPair>) => {
        if (typeof pair.address === 'undefined' || typeof pair.address !== 'string') throw new Error(`[PairDeviationCheckerModule] "address" is required for each item in "pairs"`);
        if (typeof pair.pair === 'undefined' || typeof pair.pair !== 'string') throw new Error(`[PairDeviationCheckerModule] "pair" is required for each item in "pairs"`);
    });

    return {
        ...config,
        interval: config.interval,
        pairs: config.pairs,
        provider: config.provider,
        // threshold: config.threshold,
    };
}
