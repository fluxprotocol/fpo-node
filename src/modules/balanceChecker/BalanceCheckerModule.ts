import { AppConfig, createSafeAppConfigString } from "../../models/AppConfig";
import { Module } from "../../models/Module";
import { BalanceCheckerModuleConfig, InternalBalanceCheckerModuleConfig, parseBalanceCheckerModuleConfig } from "./models/BalanceCheckerModuleConfig";
import { debouncedInterval } from "../../services/TimerUtils";
import logger from "../../services/LoggerService";

export class BalanceCheckerModule extends Module {
    static type = "BalanceCheckerModule";

    internalConfig: InternalBalanceCheckerModuleConfig;

    constructor(moduleConfig: BalanceCheckerModuleConfig, appConfig: AppConfig) {
        super(BalanceCheckerModule.type, moduleConfig, appConfig);
        this.internalConfig = parseBalanceCheckerModuleConfig(moduleConfig);
    }

    async start(): Promise<boolean> {
        debouncedInterval(async () => {
            try {
                // Check all balances with Network at once
                await Promise.all(this.internalConfig.accounts.map(async (account) => {
                    const balance = await this.network.getBalance(account);

                    if (!balance) {
                        logger.error(`[${this.id}] Account ${account} balance cannot be checked`, {
                            config: createSafeAppConfigString(this.appConfig),
                            fingerprint: `${this.type}-balance-check`,
                        });

                        return;
                    }

                    if (balance?.lte(this.internalConfig.threshold)) {
                        logger.error(`[${this.id}] Account ${account} has not enough funds`, {
                            config: createSafeAppConfigString(this.appConfig),
                            fingerprint: `${this.type}-balance-funds`,
                        });

                        return;
                    }

                    logger.debug(`[${this.id}] Account ${account} has sufficient funds`);
                }));
            } catch (error) {
                logger.error(`[${this.id}] ${error}`, {
                    config: createSafeAppConfigString(this.appConfig),
                    fingerprint: `${this.type}-balance-failure`,
                });

                return false;
            }

        }, this.internalConfig.interval);

        return true;
    }
}
