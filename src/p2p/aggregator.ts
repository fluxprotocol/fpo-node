import { CreateOptions } from "libp2p";
import Communicator from './communication';
import TCP from "libp2p-tcp";
const Mplex = require("libp2p-mplex"); // no ts support yet :/
import { NOISE } from "@chainsafe/libp2p-noise";
import BufferList from "bl/BufferList";
import { fromString } from 'uint8arrays/from-string';

export async function start_p2p(addresses: CreateOptions, peers_file: string): Promise<Communicator> {
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

export async function elect_leader(p2p: Communicator): Promise<string> {
	// method should maybe be moved to Communicator?
	let peers = Array.from(p2p._peers);
	peers.push(p2p._node_addr);
	peers = peers.sort();
	return peers[0];
}

export function median(list: number[]): number {
	list = list.sort();

	let mid_point = list.length / 2 ;

	if (mid_point % 2) {
		return (list[mid_point - 1] + list[mid_point]) / 2;
	} else {
		return list[mid_point];
	}
	return 0;
}

export async function aggregate(p2p: Communicator, data_to_send: string) {
	await p2p.start();
	let received: number[] = [];
	let med: number = 0;
	let leader: string = '';

	p2p.handle_incoming('/elected/leader', async (source: AsyncIterable<Uint8Array | BufferList>) => {
		for await (const msg of source) {
			let elected = msg.toString();
			// check if this node is the leader.
			if (elected === leader) {
				// send data to contract.
			}
		}
	});

	p2p.handle_incoming('/send/data', async (source: AsyncIterable<Uint8Array | BufferList>) => {
		for await (const msg of source) {
			received.push(parseInt(msg.toString()));
			if (received.length = p2p._peers.size) {
				med = median(received);
				leader = await elect_leader(p2p);
				p2p.send('/elected/leader', [fromString(leader)]);
			}
		}
	});

	p2p.send('/send/data', [fromString(data_to_send)]);
}