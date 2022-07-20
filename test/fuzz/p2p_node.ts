import { ethers } from 'ethers';
import PeerId, { JSONPeerId } from 'peer-id';

import { UnparsedAppConfig } from '../../src/models/AppConfig';
import { Pair } from '../../src/modules/p2p/models/P2PConfig';

import { P2PFuzzConfig } from './config';
import createPairs from './pair';
import isPortReachable from './port';
import { randNumberFromRange } from './utils';

export class P2PNodeInfo {
	id: number;
	port: number;
	peerId: PeerId;
	address: string;
	privateKeyEnv: string;

	constructor(id: number, port: number, peerId: PeerId, address: string, privateKeyEnv: string) {
		this.id = id;
		this.port = port;
		this.peerId = peerId;
		this.address = address;
		this.privateKeyEnv = privateKeyEnv;
	}

	createNodeConfig(creator: string, interval: number, deviation: number, peers: P2PNodeInfo[], pairs: Pair[]): UnparsedAppConfig {
		return {
			"p2p": [
				{
					"networkId": 1313161555,
					"peer_id": this.peerId.toJSON(),
					// @ts-ignore
					"addresses": {
						"listen": [`/ip4/127.0.0.1/tcp/${this.port}/p2p/${this.peerId.toB58String()}`],
					},
					"peers": peers.map(peer => {
						return `/ip4/127.0.0.1/tcp/${peer.port}/p2p/${peer.peerId.toB58String()}`;
					}),
				}
			],
			"networks": [
				{
					"type": "evm",
					"networkId": 1313161555,
					"chainId": 1313161555,
					"privateKeyEnvKey": this.privateKeyEnv,
					"rpc": "https://aurora-testnet.infura.io/v3/c74faac46a3f4b7f855851aab2292f8b",
				}
			],
			"modules": [
				{
					"networkId": 1313161555,
					// @ts-ignore
					"contractAddress": "0xcE8edAc0318D8e70B3fdA57Cd63596Bc147618D3",
					"deviationPercentage": deviation,
					"minimumUpdateInterval": 1800000,
					"pairs": pairs,
					"interval": interval,
					"logFile": `node${this.id}_logs`,
					"creator": creator,
					"signers": [creator, ...peers.map(peer => peer.address)],
					"type": "P2PModule"
				}
			]
		};
	}
}

async function grabFreePort(taken: Set<number>): Promise<number> {
	let port: number = randNumberFromRange(8000, 12000);

	while (await isPortReachable(port, { host: 'localhost' }) && !taken.has(port)) {
		port = randNumberFromRange(8000, 12000);
	}
	taken.add(port);

	return port;
}

export async function generateP2PNodesConfigs(config: P2PFuzzConfig): Promise<UnparsedAppConfig[]> {
	// create of a random number of nodes
	const max_nodes = randNumberFromRange(config.p2p_config.min_nodes ?? 2, config.p2p_config.max_nodes ?? 5);
	let nodes: P2PNodeInfo[] = new Array(max_nodes).fill(null);
	let taken_ports: Set<number> = new Set();
	const ports: number[] = config.p2p_config.generate_ports ?
		await Promise.all(new Array(max_nodes).fill(0).map(async (_: number) => await grabFreePort(taken_ports)))
		: config.p2p_config.ports!.slice(0, max_nodes);
	const peerIds: PeerId[] = config.p2p_config.generate_peer_ids ?
		await Promise.all(new Array(max_nodes).fill(null).map(async (_) => {
			return await PeerId.create();
		}))
		: await Promise.all(config.p2p_config.peer_ids!.slice(0, max_nodes).map(async (json: JSONPeerId) => await PeerId.createFromJSON(json)));
	const pairs: Pair[] = config.p2p_config.generate_pairs ?
		createPairs(config.p2p_config.min_pairs ?? 1, config.p2p_config.max_pairs ?? 6, config.p2p_config.max_decimals ?? 8, config.p2p_config.string_bytes ?? 8)
		: config.p2p_config.pairs!;
	console.log(`ports:`, ports);
	console.log(`peerIds:`, peerIds.map((p) => p.toB58String()));
	console.log(`pairs:`, pairs.map((p) => JSON.stringify(p)));

	nodes = nodes.map((_, id) => {
		if (id === 0) {
			// manually set our creator node.
			return new P2PNodeInfo(0, ports[0], peerIds[0], config.creatorAddress, config.creatorPrivKeyEnv);
		}
		const wallet = ethers.Wallet.createRandom();
		let privateKeyEnv = `EVM_PRIVATE_KEY${id}`;
		process.env[privateKeyEnv] = wallet.privateKey;
		return new P2PNodeInfo(id, ports[id], peerIds[id], wallet.address, privateKeyEnv);
	});

	const node_configs = nodes.map((value, index) => {
		const peers = [...nodes.slice(0, index), ...nodes.slice(index + 1)];
		return value.createNodeConfig(config.creatorAddress, config.node_config.interval, config.node_config.interval, peers, pairs);
	});

	return node_configs;
}