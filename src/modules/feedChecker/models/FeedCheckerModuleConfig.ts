import Big from "big.js";
import { ModuleConfig } from "../../../models/Module";

export interface FeedCheckerModuleConfig extends ModuleConfig {
    addresses?: string[];
    interval?: number;
    threshold?: number;
}

export interface InternalFeedCheckerModuleConfig extends ModuleConfig {
    addresses: string[];
    interval: number;
    threshold: number;
}

export function parseFeedCheckerModuleConfig(config: FeedCheckerModuleConfig): InternalFeedCheckerModuleConfig {
    if (typeof config.addresses === 'undefined' || !Array.isArray(config.addresses)) throw new Error(`[FeedCheckerModule] "addresses" is required and must be an Array of strings`);
    if (typeof config.interval === 'undefined' || typeof config.interval !== "number") throw new Error(`[FeedCheckerModule] "interval" is required and must be a number`);
    if (typeof config.threshold === 'undefined' || typeof config.threshold !== "number") throw new Error(`[FeedCheckerModule] "threshold" is required and must be a number`);

    return {
        ...config,
        addresses: config.addresses,
        interval: config.interval,
        threshold: config.threshold,
    };
}
