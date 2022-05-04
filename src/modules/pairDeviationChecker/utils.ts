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
