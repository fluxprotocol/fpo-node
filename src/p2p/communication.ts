import Libp2p, { Connection, create, CreateOptions, Libp2pOptions } from "libp2p";
import TCP from "libp2p-tcp";
const Mplex = require("libp2p-mplex"); // no ts support yet :/
import { NOISE } from "@chainsafe/libp2p-noise";
import { Multiaddr } from "multiaddr";
import PeerId from "peer-id";
import BufferList from "bl/BufferList";

import logger from "../services/LoggerService";
import { debouncedInterval } from "../services/TimerUtils";
import { extractP2PVersionMessage, latestVersion, P2PVersion, P2PVersionMessage, toString as versionToString } from "./models/P2PVersion";
import { fromString } from "uint8arrays/from-string";

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
	_connections: Map<string, Connection> = new Map();
	_options: Libp2pOptions & CreateOptions;
	_node?: Libp2p;
	_node_addr: string;
	_peers: Set<string> = new Set();
	_retry: Set<string> = new Set();
	latest_node_version: P2PVersion;
	latest_report_version: P2PVersion;
	node_version: P2PVersion;
	report_version: P2PVersion;

	constructor(node_version: P2PVersion, report_version: P2PVersion, config?: Libp2pOptions & CreateOptions, preloadedPeersAddresses: Set<string> = new Set()) {
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

		this.node_version = node_version;
		this.latest_node_version = node_version;
		this.report_version = report_version;
		this.latest_report_version = report_version;
		this._peers = preloadedPeersAddresses;
		this._node_addr = '';
	}

	async init(): Promise<void> {
		this._node = await create(this._options);

		// When initializing we set a way to handle versions of other nodes.
		this.handle_incoming('/report/version', async (peer: Multiaddr, conn: Multiaddr, source: AsyncIterable<Uint8Array | BufferList>) => {
			const versions = await extractP2PVersionMessage(source);
			if (!versions) return;
			logger.info(`[P2P-VERSION-AGGREGATOR] Received versions from ${peer}`);
			logger.info(`[P2P-VERSION-AGGREGATOR] Received Node Version from ${versionToString(versions.node_version)}`);
			logger.info(`[P2P-VERSION-AGGREGATOR] Received Report Version from ${versionToString(versions.report_version)}`);

			this.latest_node_version = latestVersion(this.node_version, versions.node_version);
			this.latest_report_version = latestVersion(this.report_version, versions.report_version);
		});
	}

	async retry(): Promise<void> {
		attempt(this, null, async () => {
			for (const peer of this._retry) {
				if (await this.connect(new Multiaddr(peer))) {
					this._retry.delete(peer);
					this._peers.add(peer)
				}
			}
		});
	}

	async start(): Promise<[Multiaddr, PeerId] | void> {
		return attempt(this, undefined, async (node: Libp2p) => {

			await node.start();
			this._node_addr = `${node.multiaddrs[0]}/p2p/${node.peerId.toJSON().id}`;
			logger.info(`node ${this._node_addr} started`);
			const annouce_addrs = node.addressManager.getAnnounceAddrs();
			console.log(`Node addrs [${node.multiaddrs.length}] ->`, node.multiaddrs.map((addr) => addr.toString()).join(', '));

			for (const peer of this._peers) {
				if (!await this.connect(new Multiaddr(peer))) {
					this._retry.add(peer);
					this._peers.delete(peer)
				}
			}

			// It's good to let the node continuously try to reconnect to peers it cannot connect to
			debouncedInterval(async () => {
				await this.retry();
			}, 10_000); // TODO maybe this should be longer or user set?
			// Because if there's a lot of nodes to turn on and etc it spams the logs.

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
				const ma_string = ma.toString();
				this._peers.add(ma_string);
				this._retry.delete(ma_string);
				const conn = await node.dial(ma);
				console.log(`@@@@@@@@@@@@@@@@@@@@@connect dialed ma: ${ma_string} , conn.local ${conn.localAddr}, conn.remote ${conn.remoteAddr}`)
				if (conn !== undefined) {
					setTimeout(async () => {
						// We could use send here, but that would send to all currently connected nodes.
						// I.e. each node would get the version more than once.
						// So instead we just only send to the node we just connected to.
						// Could also consider node.fetchService.fetch, and node.fetchService.registerLookUpFunction
						const { stream } = await conn.newStream('/report/version');
						const version_message: P2PVersionMessage = {
							node_version: this.node_version,
							report_version: this.report_version,
						};
						await stream.sink(createAsyncIterable([fromString(JSON.stringify(version_message))]));
						stream.close();
					}, 3000);

					this._connections.set(ma_string, conn);
					return true;
				}

				return false;
			} catch (error) {
				logger.error(`Node failed to connect to ${ma} with error '${error}'.`);
				return false;
			}
		});

	}

	// async connect_from_details(ip: string, address: string, transport: string, port: string, peerID: string): Promise<boolean> {
	// 	return attempt(this, false, async (node: Libp2p) => {
	// 		const mas = `/${ip}/${address}/${transport}/${port}/p2p/${peerID}`;
	// 		const ma = new Multiaddr(`/${ip}/${address}/${transport}/${port}/p2p/${peerID}`);

	// 		try {
	// 			if (!this._peers.has(mas)) {
	// 				this._peers.add(mas);
	// 			}

	// 			const conn = await node.dial(ma);
	// 			if (conn !== undefined) {
	// 				this._connections.set(mas, conn);
	// 				return true;
	// 			}

	// 			return false;
	// 		} catch (error) {
	// 			this._peers.delete(mas);
	// 			logger.error(`Node failed to connect to ${ma} with error '${error}'.`);
	// 			return false;
	// 		}
	// 	});
	// }

	async unhandle(protocol: string): Promise<void> {
		await attempt(this, null, async (node: Libp2p) => {
			await node.unhandle(protocol);
		});
	}

	async handle_incoming(protocol: string, callback: (peer: Multiaddr, connection: Multiaddr, source: AsyncIterable<Uint8Array | BufferList>) => Promise<void>): Promise<void> {
		await attempt(this, null, async (node: Libp2p) => {
			await node.handle(protocol, async ({ connection, stream }) => {
				await callback(connection.localAddr!, connection.remoteAddr, stream.source);
			});
		});
	}

	// // TODO: This would probably make it easier, but libp2p js has no docs on this.
	// async fetch(protocol: string, received: any[]): Promise<void> {
	// 	await attempt(this, null, async (node: Libp2p) => {
	// 		for (const peer of this._peers) {
	// 			let result = node.fetch(new Multiaddr(peer), protocol);
	// 		}
	// 	});
	// }

	async send(protocol: string, data: Uint8Array[]): Promise<void> {
		attempt(this, null, async (node: Libp2p) => {
			for (const connection of this._connections) {
				const ma_string = connection[0];
				const conn = connection[1];
				console.log(`@@@@send: concection ma ${ma_string} local ${conn.localAddr}, remote ${conn.remoteAddr}`)
				try {
					const { stream } = await conn.newStream(protocol);
					await stream.sink(createAsyncIterable(data));
					stream.close();
				} catch (err) {
					this._connections.delete(ma_string);
					this._retry.add(ma_string);
					this._peers.delete(ma_string)
				}
			}
		});
	}
}
