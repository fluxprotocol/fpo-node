import { TELEGRAM_BOT_API, TELEGRAM_ALERTS_CHAT_ID, TELEGRAM_STATS_CHAT_ID } from "../../../config";
import { Network } from "../../../models/Network";
import logger from "../../../services/LoggerService";
import { BalanceReport } from "../models/BalanceReport";


export async function notifyTelegramOfBalanceReports(network: Network, reports: BalanceReport[]) {
    // Stats message (only sent there are alerts of if `TELEGRAM_STATS_CHAT_ID` is set)
    const balanceErrors = reports.filter(report => report.error);
    const hasBalanceError = balanceErrors.length > 0;
    const messages: string[] = [];

    if (hasBalanceError || TELEGRAM_STATS_CHAT_ID) {
        let message = `${!hasBalanceError ? '✅' : '🆘'} Account Balance update [${network.id}] 💰\n\n`;

        reports.forEach((report) => {
            message += `\t${!report.error ? '✓' : '⨯'} ${report.address} - ${report.balance.toString()} / ${report.threshold.toString()} \n`;
        });

        messages.push(message);
    }

    // Alert message (including addressges of not updated pairs)
    if (hasBalanceError) {
        let message = `🆘 [${network.id}] Balances checks have errors 💰 \n\n`;

        balanceErrors.forEach((report) => {
            message += `\t[${report.address}] - ${report.error}\n`;
        });

        messages.push(message);
    }

    // Send to Statistics telegram group
    if (TELEGRAM_STATS_CHAT_ID) {
        for await (const message of messages) {
            await sendTelegramMessage(TELEGRAM_BOT_API, TELEGRAM_STATS_CHAT_ID, message, !hasBalanceError);
        }
    }

    // Send to Alerts telegram group
    if (hasBalanceError && TELEGRAM_ALERTS_CHAT_ID) {
        for await (const message of messages) {
            await sendTelegramMessage(TELEGRAM_BOT_API, TELEGRAM_ALERTS_CHAT_ID, message, false);
        }
    }
}

export async function sendTelegramMessage(url: string, chatId: string, text: string, disable_notification?: boolean) {
    try {
         await fetch(`${url}/sendMessage`, {
            method: "POST",
            body: JSON.stringify({
                chat_id: chatId,
                text,
                disable_notification
            }),
            headers: {
                'Content-Type': 'application/json'
            },
        });
    } catch (error) {
        logger.error(`[TelegramNotification] Unknown error`, {
            error,
        });
    }
}
