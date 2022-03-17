import Libp2p, { Connection, create, CreateOptions, Libp2pOptions, MuxedStream } from "libp2p";
import TCP from "libp2p-tcp";
const Mplex = require("libp2p-mplex"); // no ts support yet :/
import { NOISE } from "@chainsafe/libp2p-noise";
import { Multiaddr } from "multiaddr";
import PeerId from "peer-id";
import BufferList from "bl/BufferList";

async function* createAsyncIterable(syncIterable: Uint8Array[]) {
	for (const elem of syncIterable) {
		yield elem;
	}
}

export class Communicator {
	_connections: Connection[] = [];
	_options: Libp2pOptions & CreateOptions;
	_node?: Libp2p;
	_peers: Multiaddr[];
	_protocol: string;
	_streams: string[] = [];

	constructor(protcol: string, peers: [], config?: Libp2pOptions & CreateOptions) {
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
		this._peers = peers;
		this._protocol = protcol;
	}

	async init(): Promise<void> {
		this._node = await create(this._options);
	}

	async start(): Promise<[Multiaddr, PeerId]> {
		if (this._node === undefined) {
			throw new Error('Node not initialized');
		}

		await this._node.start();

		for (const peer of this._peers) {
			await this.connect(peer);
		}

		return [
			this._node.multiaddrs[0],
			this._node.peerId,
		];
	}

	async stop(): Promise<void> {
		if (this._node === undefined) {
			throw new Error('Node not initialized');
		}

		await this._node?.stop();
		this._node = undefined;
		this._connections = [];
	}

	async connect(ma: Multiaddr): Promise<void> {
		if (this._node === undefined) {
			throw new Error('Node not initialized');
		}

		this._connections.push(await this._node?.dial(ma));
	}

	async connect_from_details(ip: string, address: string, transport: string, port: string, peerID: string): Promise<void> {
		if (this._node === undefined) {
			throw new Error('Node not initialized');
		}

		const ma = new Multiaddr(`/${ip}/${address}/${transport}/${port}/p2p/${peerID}`);
		this._connections.push(await this._node?.dial(ma));
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
}