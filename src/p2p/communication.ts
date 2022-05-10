import Libp2p, { Connection, create, CreateOptions, Libp2pOptions } from "libp2p";
import TCP from "libp2p-tcp";
const Mplex = require("libp2p-mplex"); // no ts support yet :/
import { NOISE } from "@chainsafe/libp2p-noise";
import { Multiaddr } from "multiaddr";
import PeerId from "peer-id";
import BufferList from "bl/BufferList";
import { promises } from "fs";

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

export default class Communicator {
	_connections: Set<Connection> = new Set();
	_options: Libp2pOptions & CreateOptions;
	_node?: Libp2p;
	_node_addr: string;
	_peers: Set<string> = new Set();
	_peers_file: string;
	_retry: Set<string> = new Set();

	constructor(config?: Libp2pOptions & CreateOptions, peers_file?: string) {
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

		if (peers_file === undefined) {
			this._peers_file = 'peers.json';
			this._peers = new Set();
		} else {
			this._peers_file = peers_file;
		}

		this._node_addr = '';
	}

	async init(): Promise<void> {
        this._node = await create(this._options);
        this._peers = await this.load_peers();
	}

	async retry(): Promise<void> {
		attempt(this, null, async () => {
			for (const peer of this._retry) {
				if (await this.connect(new Multiaddr(peer))) {
					this._retry.delete(peer);
				}
			}
		});
	}

	async start(): Promise<[Multiaddr, PeerId] | void> {
		return attempt(this, undefined, async (node: Libp2p) => {
			await node.start();

			// TODO: Not sure if trying to connect to peers on startup would have adverse affects?
			// we could always just call retry... but we don't know when the other nodes started...
			// idk if we would want to wait for to be connected to all given peers in the list or
			// maybe if they get put in the retry list remove them from the peers list for now
			// that would allow us to operate over the currently connected peers...
			// but if a peer suddenly connected mid aggregate operation then one of those peers
			// has the incorrect number of peers
			for (const peer of this._peers) {
				if (!await this.connect(new Multiaddr(peer))) {
					this._retry.add(peer);
				}
			}

			this._node_addr = `${node.multiaddrs[0]}/p2p/${node.peerId.toJSON().id}`;

			return [
				node.multiaddrs[0],
				node.peerId,
			];
		})
	}

	async stop(): Promise<void> {
		attempt(this, false, async (node: Libp2p) => {
			try {
				for (const peer of this._peers) {
					node.hangUp(peer);
				}

				this.save_peers();

				await node.stop();

				return true;
			} catch (error) {
				logger.error(`Node failed to stop with error '${error}'.`);
				return false;
			}
		});
	}

	async connect(ma: Multiaddr): Promise<boolean> {
		return attempt(this, false, async (node: Libp2p) => {
			try {
				this._peers.add(ma.toString());
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
			const mas = `/${ip}/${address}/${transport}/${port}/p2p/${peerID}`;
			const ma = new Multiaddr(`/${ip}/${address}/${transport}/${port}/p2p/${peerID}`);

			try {
				if (!this._peers.has(mas)) {
					this._peers.add(mas);
				}

				const conn = await node.dial(ma);
				if (conn !== undefined) {
					this._connections.add(conn);
					return true;
				}

				return false;
			} catch (error) {
				this._peers.delete(mas);
				logger.error(`Node failed to connect to ${ma} with error '${error}'.`);
				return false;
			}
		});
	}

	async unhandle(protocol: string): Promise<void> {
		await attempt(this, null, async (node: Libp2p) => {
			await node.unhandle(protocol);
		});
	}

	async handle_incoming(protocol: string, callback: (peer: Multiaddr, source: AsyncIterable<Uint8Array | BufferList>) => Promise<void>): Promise<void> {
		await attempt(this, null, async (node: Libp2p) => {
			node.handle(protocol, async ({ connection, stream }) => {
				await callback(connection.remoteAddr, stream.source);
			});
		});
	}

	// TODO: This would probably make it easier, but libp2p js has no docs on this.
	async fetch(protocol: string, received: any[]): Promise<void> {
		await attempt(this, null, async (node: Libp2p) => {
			for (const peer of this._peers) {
				let result = node.fetch(new Multiaddr(peer), protocol);
			}
		});
	}

	async send(protocol: string, data: Uint8Array[]): Promise<void> {
		attempt(this, null, async () => {
			for (const connection of this._connections) {
				const { stream } = await connection.newStream(protocol);
				await stream.sink(createAsyncIterable(data));
			}
		});
	}


	async save_peers(): Promise<void> {
		let peers = Array.from(this._peers).sort();

		const json = JSON.stringify(peers, null, 4);
		try {
			await promises.writeFile(this._peers_file, json);
		} catch (error) {
			logger.error(`Node failed to save peers with error '${error}'.`);
		}

	}

	async load_peers(): Promise<Set<string>> {
		try {
			let peers: Set<string> = new Set();
			await promises.access(this._peers_file);

			const json = await promises.readFile(this._peers_file, 'utf-8');
			const peers_list: string[] = JSON.parse(json);

			for (const peer of peers_list) {
				peers.add(peer);
			}

			return peers;
		} catch (error) {
			logger.error(`Node failed to load peers with error '${error}'.`);
			return new Set();
		}

	}
}
