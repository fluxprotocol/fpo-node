export function sleep(timeout: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, timeout);
    });
}

export function debouncedInterval(callback: () => Promise<any>, interval: number) {
    let processing = false;

    return setInterval(async () => {
        if (processing) return;
        processing = true;

        await callback();

        processing = false;
    }, interval);
}

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
