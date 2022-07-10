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

declare global {
	interface Array<T> {
		randomize(): T[];
		random_element(): T;
		window(window_size: number): Array<Array<T>>;
	}
}

Array.prototype.randomize = function<T>(): T[] {
	let current = this.length;
	let random: number;

	while (current != 0) {
		random = Math.floor(Math.random() * current);
		current--;

		[this[current], this[random]] = [
      		this[random], this[current]];
	}

	return this;
}

Array.prototype.random_element = function<T>(): T {
	return this[Math.floor(Math.random() * this.length)];
}

Array.prototype.window = function<T>(window_size: number): Array<Array<T>> {
	if (window_size < 2) {
		return [this];
	}

	const len = this.length;
	let windowed = new Array();
	
	if (len % window_size === 0) {
		const size = Math.floor(len / window_size);
		for (let i = 0; i < len;) {
			windowed.push(this.slice(i, i+= size));
		}
	} else {
		for (let i = 0; i < len;) {
			const size = Math.ceil((len - i) / window_size--);
			windowed.push(this.slice(i, i+= size));
		}
	}

	return windowed;
}

export function random_item<T>(dict: NodeJS.Dict<T>): T {
	return dict[Object.keys(dict).random_element()]!;
}