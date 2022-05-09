import { ModuleConfig } from "../../../models/IModule";
import { convertOldSourcePath } from "../services/utils";

export interface Source {
	source_path: string;
	end_point: string;
	multiplier?: string;
	http_method?: string;
	http_body?: string;
	http_headers?: {
		[key: string]: string;
	};
}

export interface Pair {
	pair: string;
	sources: Source[];
	decimals: number;
}

export interface P2PInternalConfig extends ModuleConfig {
    id: string;
    contractAddress: string;
	pairs: Pair[];
    interval: number;
	deviationPercentage: number;
	minimumUpdateInterval: number;
}

export interface P2PConfig extends ModuleConfig {
    contractAddress?: P2PInternalConfig['contractAddress'];
    interval?: P2PInternalConfig['interval'];
	pairs?: P2PInternalConfig['pairs'];
	deviationPercentage?: P2PInternalConfig['deviationPercentage'];
	minimumUpdateInterval?: P2PInternalConfig['minimumUpdateInterval'];
}

export function parseP2PConfig(config: P2PConfig): P2PInternalConfig {
    if (typeof config.contractAddress === 'undefined' || typeof config.contractAddress !== 'string') throw new Error(`[P2PModule] "oracleContractAddress" is required and must be a string`);
    if (typeof config.interval === 'undefined' || typeof config.interval !== 'number') throw new Error(`[P2PModule] "interval" is required and must be a number`);
	if (!Array.isArray(config.pairs)) throw new Error(`[P2PModule] "pairs" is required and must be an array`);

	config.pairs.forEach((pair: Partial<Pair>) => {
		if (typeof pair.pair === 'undefined' || typeof pair.pair !== 'string') throw new Error(`[P2PModule] "pair" is required for each item in "pairs"`);
		if (typeof pair.decimals === 'undefined' || typeof pair.decimals !== 'number') throw new Error(`[P2PModule] "decimals" is required for each item in "pairs"`);
		if (!Array.isArray(pair.sources)) throw new Error(`[P2PModule] "sources" is required for each item in "pairs"`);

		pair.sources.forEach((source: Partial<Source>) => {
			if (typeof source.source_path === 'undefined' || typeof source.source_path !== 'string') throw new Error(`[P2PModule] "source_path" is required for each item in "sources"`);
			if (typeof source.end_point === 'undefined' || typeof source.end_point !== 'string') throw new Error(`[P2PModule] "end_point" is required for each item in "sources"`);
		});
	});

    return {
        ...config,
        id: `${config.type}-${config.networkId}}`,
		// TODO: what should these defaults be.
		deviationPercentage: config.deviationPercentage ?? 0.5,
		minimumUpdateInterval: config.minimumUpdateInterval ?? 1,
        contractAddress: config.contractAddress,
        interval: config.interval,
		pairs: config.pairs.map((pair) => ({
			...pair,
			sources: pair.sources.map((source) => ({
				...source,
				source_path: convertOldSourcePath(source.source_path),
			}))
		})),
    };
}
