import { Pair } from '../../src/modules/p2p/models/P2PConfig';
import { randNumberFromRange, randomString } from './utils';

const source_paths = [
	"market_data.current_price.aud",
	"market_data.current_price.btc",
	"market_data.current_price.cad",
	"market_data.current_price.jpy",
	"market_data.current_price.usd",
];

const end_points = [
	"https://api.coingecko.com/api/v3/coins/bitcoin",
	"https://api.coingecko.com/api/v3/coins/ethereum",
	"https://api.coingecko.com/api/v3/coins/tether",
	"https://api.coingecko.com/api/v3/coins/usd-coin",
	"https://api.coingecko.com/api/v3/coins/staked-ether",
	"https://api.coingecko.com/api/v3/coins/hedera-hashgraph",
	"https://api.coingecko.com/api/v3/coins/chain-2",
	"https://api.coingecko.com/api/v3/coins/near",
];

export default function createPairs(min: number, max: number, max_decimals: number, string_bytes: number): Pair[] {
	const num_pairs = randNumberFromRange(min, max);
	const sources = new Array(num_pairs).fill(null).map(() => {
		return {
			"source_path": source_paths.random_element(),
			"end_point": end_points.random_element(),
		}
	});

	return new Array(num_pairs).fill(null).map((_: null, index: number) => {
		return {
			"pair": randomString(string_bytes),
			"decimals": randNumberFromRange(1, max_decimals),
			"sources": [
				sources[index]
			]
		}
	});
}