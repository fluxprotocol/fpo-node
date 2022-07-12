import fs from 'fs';
import { JSONPeerId } from 'peer-id';
import YAML from 'yaml';

import { Pair } from '../../src/modules/p2p/models/P2PConfig';

export interface NodeConfig {
	networks: string[];
	generate_keys: boolean;
	keys?: string[];
}

export interface P2PConfig {
	min_nodes?: number;
	max_nodes?: number;
	generate_ports: boolean;
	ports?: number[];
	generate_pairs: boolean;
	min_pairs?: number;
	max_pairs?: number;
	pairs?: Pair[];
	generate_peer_ids: boolean;
	max_decimals?: number;
	string_bytes?: number;
	peer_ids?: JSONPeerId[];
	allow_disconnects: boolean;
	attempt_disconnect_interval?: number;
	random_disconnect_chance?: number;
	reconnect_interval?: number;
	randomly_update_nodes: boolean;
	randomly_update_reports: boolean;
	outdated_rounds_allowed?: number;
	random_update_chance?: number;
	major_update_chance?: number;
	minor_update_chance?: number;
}

export interface P2PFuzzConfig {
	node_config: NodeConfig;
	p2p_config: P2PConfig;
	window?: number;
	creatorAddress: string;
	creatorPrivKeyEnv: string;
}

function default_fuzz_config(path: string) {
	const p2p_fuzz_config: P2PFuzzConfig = {
		node_config: {
			networks: ["evm"],
			generate_keys: true,
		},
		p2p_config: {
			min_nodes: 3,
			max_nodes: 10,
			generate_ports: true,
			generate_pairs: true,
			min_pairs: 1,
			max_pairs: 7,
			generate_peer_ids: true,
			allow_disconnects: false,
			randomly_update_nodes: false,
			randomly_update_reports: false,
		},
		creatorAddress: "fill me in",
		creatorPrivKeyEnv: "fill me in",
	};
	const yaml = YAML.stringify(p2p_fuzz_config);
	fs.writeFileSync(path, yaml);
}

export function load_fuzz_config(path: string): P2PFuzzConfig {
	if (fs.existsSync(path)) {
		const file = fs.readFileSync(path, 'utf-8');
		const config: P2PFuzzConfig = YAML.parse(file);

		if (!config.node_config.generate_keys && config.node_config.keys === undefined) throw new Error("You must specify keys if the generate keys feature is turned off.");
		if (!config.p2p_config.generate_pairs && config.p2p_config.pairs === undefined) throw new Error("You must specify pairs if the generate pairs feature is turned off.");
		if (!config.p2p_config.generate_peer_ids && config.p2p_config.peer_ids === undefined) throw new Error("You must specify peer ids if the generate peer ids feature is turned off.");
		if (!config.p2p_config.generate_ports && config.p2p_config.ports === undefined) throw new Error("You must specify ports if the generate ports feature is turned off.");

		if (config.window !== undefined && config.window <= 0) throw new Error("Window must be >= 1");

		return config;
	} else {
		default_fuzz_config(path);
		throw new Error('Config does not exist generating...');
	}
}
