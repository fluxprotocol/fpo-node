import { TELEGRAM_BOT_API, TELEGRAM_ALERTS_CHAT_ID, TELEGRAM_STATS_CHAT_ID } from "../../../config";
import { prettySeconds } from "../utils";
import { PairDeviationReport } from "../models/PairDeviationReport";
import logger from "../../../services/LoggerService";

export async function notifyTelegram(reports: PairDeviationReport[], groupName: string, forceNotification: boolean) {
    // Sort reports by last update
    reports = reports.sort(function (a, b) { return a.diff - b.diff; });

    // Not updated reports
    const notUpdatedReports = reports.filter(report => !report.updated);
    const sendAlert = notUpdatedReports.length > 0;

    // Stats message (only sent there are alerts of if `TELEGRAM_STATS_CHAT_ID` is set)
    let messages: string[] = [];
    if (sendAlert || forceNotification || TELEGRAM_STATS_CHAT_ID) {
        const updates = `[${groupName}] ${reports.length - notUpdatedReports.length}/${reports.length} pairs recently updated`;
        let stats;
        if (!sendAlert) {
            stats = `✅ *${updates}* \n\n`;
        } else if (notUpdatedReports.length != reports.length) {
            stats = `⚠️ *${updates}* \n\n`;
        } else {
            stats = `🆘 *${updates}* \n\n`;
        }
        // Last update per pair
        for (var i = 0; i < reports.length; i++) {
            const statMessage = `${reports[i].diff != -1 ? `updated ${prettySeconds(reports[i].diff, true)} ago` : `check failed`}`;
            stats += `\t ${reports[i].updated ? '✓' : '⨯'} [[${reports[i].pair.extraInfo.pair}]] ${statMessage} ${reports[i].message ?? ''}\n`;
        }

        messages.push(stats);
    }

    // Alert message (including addresses of not updated pairs)
    if (sendAlert) {
        let alerts = `🔍 *[${groupName}] Not updated addresses:* \n\n`;
        for (var i = 0; i < notUpdatedReports.length; i++) {
            alerts += `\t*[${notUpdatedReports[i].pair.extraInfo.pair}]* ${notUpdatedReports[i].pair.extraInfo.address}\n`;
        }

        messages.push(alerts);
    }

    // Send to Statistics telegram group
    if (TELEGRAM_STATS_CHAT_ID) {
        for await (let message of messages) {
            await sendTelegramMessage(TELEGRAM_BOT_API, TELEGRAM_STATS_CHAT_ID, message, !sendAlert);
        }
    }

    // Send to Alerts telegram group
    if ((sendAlert || forceNotification) && TELEGRAM_ALERTS_CHAT_ID) {
        for await (let message of messages) {
            await sendTelegramMessage(TELEGRAM_BOT_API, TELEGRAM_ALERTS_CHAT_ID, message);
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
                parse_mode: "Markdown",
                disable_notification
            }),
            headers: {
                'Content-Type': 'application/json'
            },
        });
    } catch (error) {
        logger.error(`[TelegramNotification] Unknown error`, {
            error,
            fingerprint: `PairDeviationChecker-telegram-unknown`,
        });
    }
}
