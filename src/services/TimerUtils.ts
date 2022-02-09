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
