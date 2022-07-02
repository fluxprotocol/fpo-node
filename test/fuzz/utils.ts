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