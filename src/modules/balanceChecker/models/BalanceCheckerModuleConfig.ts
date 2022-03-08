import Big from "big.js";
import { ModuleConfig } from "../../../models/Module";

export interface BalanceCheckerModuleConfig extends ModuleConfig {
    accounts?: string[];
    interval?: number;
    threshold?: string;
}

export interface InternalBalanceCheckerModuleConfig extends ModuleConfig {
    accounts: string[];
    interval: number;
    threshold: Big;
}

export function parseBalanceCheckerModuleConfig(config: BalanceCheckerModuleConfig): InternalBalanceCheckerModuleConfig {
    if (typeof config.accounts === 'undefined' || !Array.isArray(config.accounts)) throw new Error(`[BalanceCheckerModule] "accounts" is required and must be an Array of strings`);
    if (typeof config.interval === 'undefined' || typeof config.interval !== "number") throw new Error(`[BalanceCheckerModule] "interval" is required and must be a number`);
    if (typeof config.threshold === 'undefined' || typeof config.threshold !== "string") throw new Error(`[BalanceCheckerModule] "threshold" is required and must be a string`);

    let threshold;
    try {
        threshold = new Big(config.threshold);
    } catch (error) {
        throw new Error(`[BalanceCheckerModule] "threshold" is required and must be a valid bignum string`);
    }

    return {
        ...config,
        accounts: config.accounts,
        interval: config.interval,
        threshold,
    };
}
