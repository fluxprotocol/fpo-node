export function prettySeconds(seconds: number): string {
    // Seconds
    if (seconds < 60) {
        return Math.floor(seconds) + " seconds";
    }
    // Minutes
    else if (seconds < 3600) {
        return Math.floor(seconds / 60) + " min";
    }
    // Hours
    else if (seconds < 86400) {
        return Math.floor(seconds / 3600) + " hours";
    }
    // Days
    else {
        return Math.floor(seconds / 86400) + " days";
    }
}
