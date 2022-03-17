import Libp2p, { Connection, create, CreateOptions, Libp2pOptions } from "libp2p";
import TCP from "libp2p-tcp";
const Mplex = require("libp2p-mplex"); // no ts support yet :/
import { NOISE } from "@chainsafe/libp2p-noise";
import { Multiaddr } from "multiaddr";
import PeerId from "peer-id";
import BufferList from "bl/BufferList";
import { readFileSync, writeFile } from "fs";

async function* createAsyncIterable(syncIterable: Uint8Array[]) {
	for (const elem of syncIterable) {
		yield elem;
	}
}

export class Communicator {
	_connections: Set<Connection> = new Set();
	_options: Libp2pOptions & CreateOptions;
	_node?: Libp2p;
	_peers: Set<Multiaddr>;
	_peers_file?: string;
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
			this._peers = new Set();
		} else {
			this._peers = this.load_peers(peers);
		}

		
		this._protocol = protcol;
	}

	async init(): Promise<void> {
		this._node = await create(this._options);
	}

	async retry(): Promise<void> {
		if (this._node === undefined) {
			throw new Error('Node not initialized');
		}

		for (const peer of this._retry) {
			if (await this.connect(peer)) {
				this._retry.delete(peer);
			}
		}
	}

	async start(): Promise<[Multiaddr, PeerId]> {
		if (this._node === undefined) {
			throw new Error('Node not initialized');
		}

		await this._node.start();

		for (const peer of this._peers) {
			if (!await this.connect(peer)) {
				this._retry.add(peer);
			}
		}

		return [
			this._node.multiaddrs[0],
			this._node.peerId,
		];
	}

	async stop(file: string): Promise<void> {
		if (this._node === undefined) {
			throw new Error('Node not initialized');
		}

		await this._node?.stop();
		this.save_peers(file);
	}

	async connect(ma: Multiaddr): Promise<boolean> {
		if (this._node === undefined) {
			// TODO: log this instead?
			throw new Error('Node not initialized');
		}

		try {
			this._peers.add(ma);
			this._connections.add(await this._node?.dial(ma));
			return true;
		} catch (error) {
			// TODO: Should we log this?
			return false;	
		}
	}

	async connect_from_details(ip: string, address: string, transport: string, port: string, peerID: string): Promise<void> {
		if (this._node === undefined) {
			throw new Error('Node not initialized');
		}

		const ma = new Multiaddr(`/${ip}/${address}/${transport}/${port}/p2p/${peerID}`);
		this._peers.add(ma);
		this._connections.add(await this._node?.dial(ma));
	}

	handle_incoming(callback: (source: AsyncIterable<Uint8Array | BufferList>) => Promise<void>): void {
		if (this._node === undefined) {
			throw new Error('Node not initialized');
		}

		this._node.handle(this._protocol, async ({ stream }) => {
			await callback(stream.source);
		});
	}

	async send(data: Uint8Array[]): Promise<void> {
		if (this._node === undefined) {
			throw new Error('Node not initialized');
		}

		for (const connection of this._connections) {
			const { stream } = await connection.newStream(this._protocol);
			await stream.sink(createAsyncIterable(data));
		}
	}

	save_peers(file: string): void {
		const peers = {
			peers: this._peers
		};

		const json = JSON.stringify(peers, null, 4);

		writeFile(file, json, (err) => {
			if (err) {
				// TODO error logging.
				return;
			}
		});
	}

	load_peers(file: string): Set<Multiaddr> {
		const json = readFileSync(file, 'utf-8');
		const peers_object = JSON.parse(json);
		return peers_object.peers;
	}
}