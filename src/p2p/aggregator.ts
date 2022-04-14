import { CreateOptions } from "libp2p";
import Communicator from './communication';
import TCP from "libp2p-tcp";
const Mplex = require("libp2p-mplex"); // no ts support yet :/
import { NOISE } from "@chainsafe/libp2p-noise";
import BufferList from "bl/BufferList";
import { fromString } from 'uint8arrays/from-string';

export async function start_p2p(addresses: CreateOptions, peers_file: string): Promise<Communicator> {
	// Should we default more of the options and only ask for
	// A peer id file, and the port?
	const p2p = new Communicator(
		{
			...addresses,
			modules: {
				transport: [TCP],
				streamMuxer: [Mplex],
				connEncryption: [NOISE],
			}
		},
		peers_file
	);
	await p2p.init();

	return p2p;
}

export async function elect_leader(): Promise<number> {
	return 0;
}

export async function aggregate(p2p: Communicator, data_to_send: string) {
	await p2p.start();
	let received: number[] = [];

	p2p.handle_incoming('/elected/leader', async (source: AsyncIterable<Uint8Array | BufferList>) => {
		for await (const msg of source) {
			let leader = parseInt(msg.toString());
			// check if this node is the leader.
		}
	});

	p2p.handle_incoming('/send/data', async (source: AsyncIterable<Uint8Array | BufferList>) => {
		for await (const msg of source) {
			received.push(parseInt(msg.toString()));
			if (received.length = p2p._peers.size) {
				let leader = await elect_leader();
				p2p.send('/elected/leader', [new Uint8Array(leader)]);
			}
		}
	});

	p2p.send('/send/data', [fromString(data_to_send)]);
}