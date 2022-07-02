import { Pair } from '../../src/modules/p2p/models/P2PConfig';
import { randNumberFromRange, randomString } from './utils';

const source_paths = [
	"market_data.current_price.usd"
];

const end_points = [
	"https://api.coingecko.com/api/v3/coins/near"
];

function selectRandomArrayElement<T>(array: T[]): T {
	return array[Math.floor(Math.random() * array.length)];
}

export default function createPairs(min: number, max: number): Pair[] {
	const num_pairs = randNumberFromRange(min, max);
	const sources = new Array(num_pairs).fill(null).map(() => {
		return {
			"source_path": selectRandomArrayElement(source_paths),
			"end_point": selectRandomArrayElement(end_points),
		}
	});

	return new Array(num_pairs).fill(null).map((_: null, index: number) => {
		return {
			"pair": randomString(10),
			"decimals": randNumberFromRange(0, 255),
			"sources": [
				sources[index]
			] 
		}
	});
}