import crypto from 'crypto';

// Generates a number in the set of (start, stop]
export function randNumberFromRange(start: number, stop: number): number {
	return Math.floor(
		Math.random() * ((stop + 1) - start) + start
	);
}

export function randomString(size: number): string {
	return crypto.randomBytes(size).toString('hex');
}

export function window<T>(array: T[], window_size: number): Array<Array<T>> {
	if (window_size < 2) {
		return [array];
	}

	const len = array.length;
	let windowed = new Array();
	
	if (len % window_size === 0) {
		const size = Math.floor(len / window_size);
		for (let i = 0; i < len;) {
			windowed.push(array.slice(i, i+= size));
		}
	} else {
		for (let i = 0; i < len;) {
			const size = Math.ceil((len - i) / window_size--);
			windowed.push(array.slice(i, i+= size));
		}
	}

	return windowed;
}