import Libp2p, { Connection, create, CreateOptions, Libp2pOptions } from "libp2p";
import TCP from "libp2p-tcp";
const Mplex = require("libp2p-mplex"); // no ts support yet :/
import { NOISE } from "@chainsafe/libp2p-noise";
import { Multiaddr } from "multiaddr";
import PeerId from "peer-id";
import BufferList from "bl/BufferList";
import { readFileSync, writeFile } from "fs";

import logger from "../services/LoggerService";

async function* createAsyncIterable(syncIterable: Uint8Array[]) {
	for (const elem of syncIterable) {
		yield elem;
	}
}

async function attempt<R>(comm: Communicator, def: R, attempt: (node: Libp2p) => Promise<R>): Promise<R> {
	if (comm._node === undefined) {
		logger.error('The communication node has not been started.');
		return def;
	} else {
		return attempt(comm._node);
	}
}

export class Communicator {
	_connections: Set<Connection> = new Set();
	_options: Libp2pOptions & CreateOptions;
	_node?: Libp2p;
	_peers: Set<Multiaddr>;
	_peers_file: string;
	_retry: Set<Multiaddr> = new Set();
	_protocol: string;

	constructor(protcol: string, peers?: string, config?: Libp2pOptions & CreateOptions) {
		if (config === undefined) {
			this._options = {
				addresses: {
					listen: ['/ip4/0.0.0.0/tcp/0']
				},
				modules: {
					transport: [TCP],
					streamMuxer: [Mplex],
					connEncryption: [NOISE],
				}
			};
		} else {
			this._options = config;
		}

		if (peers === undefined) {
			this._peers_file = 'peers.json';
			this._peers = new Set();
		} else {
			this._peers_file = peers;
			this._peers = this.load_peers();
		}


		this._protocol = protcol;
	}

	async init(): Promise<void> {
		this._node = await create(this._options);
	}

	async retry(): Promise<void> {
		attempt(this, null, async () => {
			for (const peer of this._retry) {
				if (await this.connect(peer)) {
					this._retry.delete(peer);
				}
			}
		});
	}

	async start(): Promise<[Multiaddr, PeerId] | void> {
		return attempt(this, undefined, async (node: Libp2p) => {
			// Node will definitely exist.
			await node.start();

			for (const peer of this._peers) {
				if (!await this.connect(peer)) {
					this._retry.add(peer);
				}
			}

			return [
				node.multiaddrs[0],
				node.peerId,
			];
		})
	}

	async stop(): Promise<void> {
		attempt(this, null, async (node: Libp2p) => {
			// Node will definitely exist.
			await node.stop();
			this.save_peers();
		});
	}

	async connect(ma: Multiaddr): Promise<boolean> {
		return attempt(this, false, async (node: Libp2p) => {
			// Node will definitely exist.
			try {
				this._peers.add(ma);
				const conn = await node.dial(ma);
				if (conn !== undefined) {
					this._connections.add(conn);
					return true;
				}

				return false;
			} catch (error) {
				logger.error(`Node failed to connect to ${ma} with error '${error}'.`);
				return false;
			}
		});

	}

	async connect_from_details(ip: string, address: string, transport: string, port: string, peerID: string): Promise<boolean> {
		return attempt(this, false, async (node: Libp2p) => {
			const ma = new Multiaddr(`/${ip}/${address}/${transport}/${port}/p2p/${peerID}`);

			// Node will definitely exist.
			try {
				this._peers.add(ma);

				const conn = await node.dial(ma);
				if (conn !== undefined) {
					this._connections.add(conn);
					return true;
				}

				return false;
			} catch (error) {
				logger.error(`Node failed to connect to ${ma} with error '${error}'.`);
				return false;
			}
		});
	}

	async handle_incoming(callback: (source: AsyncIterable<Uint8Array | BufferList>) => Promise<void>): Promise<void> {
		await attempt(this, null, async (node: Libp2p) => {
			// Node will definitely exist.
			node.handle(this._protocol, async ({ stream }) => {
				await callback(stream.source);
			});
		});
	}

	async send(data: Uint8Array[]): Promise<void> {
		attempt(this, null, async () => {
			for (const connection of this._connections) {
				const { stream } = await connection.newStream(this._protocol);
				await stream.sink(createAsyncIterable(data));
			}
		});
	}

	save_peers(): void {
		const peers = {
			peers: this._peers
		};

		const json = JSON.stringify(peers, null, 4);

		writeFile(this._peers_file, json, (err) => {
			if (err) {
				logger.error(`Failed to write peers to file '${this._peers_file}' with error '${err}'.`);
				return;
			}
		});
	}

	load_peers(): Set<Multiaddr> {
		const json = readFileSync(this._peers_file, 'utf-8');
		const peers_object = JSON.parse(json);

		let peers: Set<Multiaddr> = new Set();
		for (const peer of peers_object.peers) {
			peers.add(new Multiaddr(peer));
		}

		return peers;
	}
}