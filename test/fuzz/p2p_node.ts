import { ethers } from 'ethers';
import PeerId, { JSONPeerId } from 'peer-id';

import { UnparsedAppConfig } from '../../src/models/AppConfig';
import { Pair } from '../../src/modules/p2p/models/P2PConfig';
import { sleep } from '../../src/services/TimerUtils';

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

	createNodeConfig(creator: string, peers: P2PNodeInfo[], pairs: Pair[]): UnparsedAppConfig {
		console.log(`peers:`, peers.map(peer => {
					return `/ip4/127.0.0.1/tcp/${peer.port}/p2p/${peer.peerId.toB58String()}`;
				}));
		return {
			"p2p": {
				"peer_id": this.peerId.toJSON(),
				// @ts-ignore
				"addresses": {
					"listen": [`/ip4/127.0.0.1/tcp/${this.port}/p2p/${this.peerId.toB58String()}`],
				},
				"peers": peers.map(peer => {
					return `/ip4/127.0.0.1/tcp/${peer.port}/p2p/${peer.peerId.toB58String()}`;
				}),
			},
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
					"deviationPercentage": 0.5,
					"minimumUpdateInterval": 1800000,
					"pairs": pairs,
					"interval": 60000,
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

	while (await isPortReachable(port, {host: 'localhost'}) && !taken.has(port)) {
		port = randNumberFromRange(8000, 12000);
	}
	
	return port;
}

export async function generateP2PNodesConfigs(config: P2PFuzzConfig, pairs: Pair[]): Promise<UnparsedAppConfig[]> {
	// create of a random number of nodes
	const max_nodes = randNumberFromRange(config.p2p_config.min_nodes - 1, config.p2p_config.max_nodes);
	let nodes: P2PNodeInfo[] = new Array(max_nodes).fill(null);
	let taken_ports: Set<number> = new Set();
	const ports: number[] = config.p2p_config.generate_ports ?
		await Promise.all(new Array(max_nodes).fill(0).map(async (_: number) => {
			const port = await grabFreePort(taken_ports);
			taken_ports.add(port);
			return port;
		}))
		: config.p2p_config.ports!.slice(0, max_nodes);
	const peerIds: PeerId[] = config.p2p_config.generate_peer_ids ?
		await Promise.all(new Array(max_nodes).fill(null).map(async (_) => {
			return await PeerId.create();
		}))
		: await Promise.all(config.p2p_config.peer_ids!.slice(0, max_nodes).map(async (json: JSONPeerId) => await PeerId.createFromJSON(json)));
	console.log(`ports:`, ports);
	console.log(`peerIds:`, peerIds.map((p) => p.toB58String()));
	console.log(`pairs:`, pairs.map((p) => JSON.stringify(p)));

	// wait 3 seconds for everything to finish.
	await sleep(3000);
	// manually set our creator node.
	nodes[0] = new P2PNodeInfo(0, ports[0], peerIds[0], config.creatorAddress, config.creatorPrivKeyEnv);
	// randomly create the rest of the nodes
	for (let id = 1; id < nodes.length; id++) {
		const wallet = ethers.Wallet.createRandom();
		let privateKeyEnv = `EVM_PRIVATE_KEY${id}`;
		process.env[privateKeyEnv] = wallet.privateKey;
		nodes[id] = new P2PNodeInfo(id, ports[id], peerIds[id], wallet.address, privateKeyEnv);
	}

	let node_configs = new Array(max_nodes);
	let index = 0;
	for (const node of nodes) {
		const peers = [...nodes.slice(0, index), ...nodes.slice(index + 1)];
		console.log(`ppeers:`, peers);
		node_configs[index] = node.createNodeConfig(config.creatorAddress, peers, pairs);
		index++;
	}

	return node_configs;
}