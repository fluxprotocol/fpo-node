import { TELEGRAM_BOT_CHAT_ID, TELEGRAM_BOT_API } from "../../config";

export function prettySeconds(seconds: number, short?: boolean): string {
    // Seconds
    if (seconds < 60) {
        return Math.floor(seconds) + `${short ? "s" : " seconds"}`;
    }
    // Minutes
    else if (seconds < 3600) {
        return Math.floor(seconds / 60) + `${short ? "m" : " minutes"}`;
    }
    // Hours
    else if (seconds < 86400) {
        return Math.floor(seconds / 3600) + `${short ? "h" : " hours"}`;
    }
    // Days
    else {
        return Math.floor(seconds / 86400) + `${short ? "d" : " days"}`;
    }
}

export async function sendTelegramMessage(url: string, chatId: string, text: string, disableNotification?: boolean) {
    return await fetch(`${url}/sendMessage`, {
        method: "POST",
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "Markdown",
            disable_notification: disableNotification ?? false
        }),
        headers: {
            'Content-Type': 'application/json'
        },
    });
}
