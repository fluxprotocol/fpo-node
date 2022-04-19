import Big from "big.js";
import logger from "../../services/LoggerService";
import { AppConfig } from "../../models/AppConfig";
import { BalanceCheckerModuleConfig, InternalBalanceCheckerModuleConfig, parseBalanceCheckerModuleConfig } from "./models/BalanceCheckerModuleConfig";
import { BalanceReport, BalanceReportError } from "./models/BalanceReport";
import { ENABLE_TELEGRAM_NOTIFICATIONS, TELEGRAM_ALERTS_CHAT_ID, TELEGRAM_BOT_API, TELEGRAM_STATS_CHAT_ID } from "../../config";
import { Module } from "../../models/Module";
import { debouncedInterval } from "../../services/TimerUtils";
import { notifyTelegramOfBalanceReports } from "./services/TelegramNotificationService";
import { createSafeAppConfigString } from "../../services/AppConfigUtils";

export class BalanceCheckerModule extends Module {
    static type = "BalanceCheckerModule";

    internalConfig: InternalBalanceCheckerModuleConfig;

    constructor(moduleConfig: BalanceCheckerModuleConfig, appConfig: AppConfig) {
        super(BalanceCheckerModule.type, moduleConfig, appConfig);
        this.internalConfig = parseBalanceCheckerModuleConfig(moduleConfig);
    }

    async checkBalances() {
        try {
            // Check all balances with Network at once
            const reports: BalanceReport[] = await Promise.all(this.internalConfig.accounts.map<Promise<BalanceReport>>(async (account) => {
                const balance = await this.network.getBalance(account);

                if (!balance) {
                    logger.error(`[${this.id}] Account ${account} balance cannot be checked`, {
                        config: createSafeAppConfigString(this.appConfig),
                        fingerprint: `${this.type}-balance-check`,
                    });

                    return {
                        balance: new Big(0),
                        threshold: this.internalConfig.threshold,
                        error: BalanceReportError.CONNECT,
                        address: account,
                    };
                }

                if (balance?.lte(this.internalConfig.threshold)) {
                    logger.error(`[${this.id}] Account ${account} has not enough funds`, {
                        config: createSafeAppConfigString(this.appConfig),
                        fingerprint: `${this.type}-balance-funds`,
                    });

                    return {
                        balance,
                        threshold: this.internalConfig.threshold,
                        address: account,
                        error: BalanceReportError.NOT_ENOUGH_BALANCE,
                    };
                }

                logger.debug(`[${this.id}] Account ${account} has sufficient funds`);

                return {
                    balance,
                    threshold: this.internalConfig.threshold,
                    address: account,
                }
            }));

            await notifyTelegramOfBalanceReports(this.network, reports);

        } catch (error) {
            logger.error(`[${this.id}] Unknown error`, {
                error,
                config: createSafeAppConfigString(this.appConfig),
                fingerprint: `${this.type}-unknown`,
            });
        }
    }

    async start(): Promise<boolean> {
        // Check environment variables
        if (ENABLE_TELEGRAM_NOTIFICATIONS) {
            if (!TELEGRAM_BOT_API) {
                logger.error(`[${this.id}] Could not start \`BalanceCheckerModule\`: \`TELEGRAM_BOT_TOKEN\` is undefined`, {
                    config: createSafeAppConfigString(this.appConfig),
                    fingerprint: `${this.type}-start-failure`,
                });

                return false;
            } else if (!TELEGRAM_ALERTS_CHAT_ID && !TELEGRAM_STATS_CHAT_ID) {
                logger.error(`[${this.id}] Could not start \`BalanceCheckerModule\`: \`TELEGRAM_ALERTS_CHAT_ID\` and \`TELEGRAM_STATS_CHAT_ID\` are undefined`, {
                    config: createSafeAppConfigString(this.appConfig),
                    fingerprint: `${this.type}-start-failure`,
                });

                return false;
            }
        }

        // Start checkPairs immediately
        await this.checkBalances();

        // Schedule next checks every `interval` (milliseconds)
        debouncedInterval(async () => {
            await this.checkBalances();
        }, this.internalConfig.interval);

        return true;
    }
}
