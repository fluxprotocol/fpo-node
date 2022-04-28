import { CreateOptions } from "libp2p";
import Communicator from './communication';
import TCP from "libp2p-tcp";
const Mplex = require("libp2p-mplex"); // no ts support yet :/
import { Multiaddr } from "multiaddr";
import { NOISE } from "@chainsafe/libp2p-noise";
import BufferList from "bl/BufferList";
import { fromString } from 'uint8arrays/from-string';

import logger from "../services/LoggerService";

export async function init_p2p(addresses: CreateOptions, peers_file: string): Promise<Communicator> {
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

let current_leader = 0;

export async function elect_leader(p2p: Communicator): Promise<string> {
	let peers = Array.from(p2p._peers);
	peers.push(p2p._node_addr);
	peers = peers.sort();
	const elected = peers[current_leader];
	current_leader++;
	if (current_leader > p2p._peers.size) {
		current_leader = 0;
	}

	return elected;
}

export function median(list: number[]): number {
	list = list.sort();

	let mid_point = list.length / 2 ;

	if (mid_point % 2) {
		return (list[mid_point - 1] + list[mid_point]) / 2;
	} else {
		return list[mid_point];
	}
}

export async function aggregate(p2p: Communicator, data_to_send: string) {
	await p2p.start();
	let received: number[] = [];
	let med: number = 0;
	let medians_received_count: number = 0;
	let leader: string = '';
	let leaders_received_count: number = 0;

	p2p.handle_incoming('/elected/leader', async (peer: Multiaddr, source: AsyncIterable<Uint8Array | BufferList>) => {
		let elected = '';
		for await (const msg of source) {
			elected += msg.toString;
		}
		logger.info(`Received elected leader \`${elected}\' from peer \`${peer}\``);

		// make sure they all agree on who the leader is.
		leaders_received_count++;
		if (elected !== leader) {
			logger.error(`Received elected leader \`${elected}\' from peer \`${peer}\` but it did not match our elected leader \`${leader}\``);
		} else if (leaders_received_count === p2p._peers.size && leader == p2p._node_addr) { // check if we are the leader
			// send data to contract.
			// check if leader didn't send it if so ask someone else to send it.
			// after publishing the leader shares the transaction hash and the peers verify the transaction hash right parameters to right contract
			
		}
	});

	p2p.handle_incoming('/calculated/median', async (peer: Multiaddr, source: AsyncIterable<Uint8Array | BufferList>) => {
		let full_msg = '';
		for await (const msg of source) {
			full_msg += msg.toString;
		}
		medians_received_count++;
		logger.info(`Received median \`${full_msg}\' from peer \`${peer}\``);

		let same_median = true;
		let received_median = parseInt(full_msg.toString());
		if (received_median !== med) {
			logger.error(`Received median \`${full_msg}\' from peer \`${peer}\` but it did not match our median \`${med}\``);
			same_median = false;
			// Should throw some error here or something?
			// 51 % + agrees still send the median?
			// log an error.
			// see if there is a way to grab who sent this iteration of data.
		} else if (medians_received_count === p2p._peers.size && same_median) {
			leader = await elect_leader(p2p);
			logger.info(`Elected leader \`${leader}\'`);
			p2p.send('/elected/leader', [fromString(leader)]);
		}
	});
	
	p2p.handle_incoming('/send/data', async (peer: Multiaddr, source: AsyncIterable<Uint8Array | BufferList>) => {
		let full_msg = '';
		for await (const msg of source) {
			full_msg += msg.toString;
		}
		logger.info(`Received data \`${full_msg}\' from peer \`${peer}\``);

		received.push(parseInt(full_msg.toString()));
		if (received.length === p2p._peers.size) {
			med = median(received);
			logger.info(`Calculated median \`${median}\'`);
			p2p.send('/calculated/median', [fromString(med.toString())]);
		}
	});

	logger.info(`Sending data to peers ${data_to_send}`);
	p2p.send('/send/data', [fromString(data_to_send)]);
}