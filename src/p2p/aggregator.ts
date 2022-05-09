import Big from "big.js";
import { Multiaddr } from "multiaddr";
import BufferList from "bl/BufferList";
import { fromString } from 'uint8arrays/from-string';

import Communicator from './communication';
import logger from "../services/LoggerService";
import { P2PDataRequest } from "../modules/p2p/models/P2PDataRequest";

// TODO: this should take a nonce, otherwise if a new node spawns later it doesn't
// know what this value currently is in execution.
let current_leader = 0;
export async function elect_leader(p2p: Communicator, unresolvedRequest: P2PDataRequest): Promise<string> {
	let peers = Array.from(p2p._peers);
	peers.push(p2p._node_addr);
	peers = peers.sort();
	// this.rpcIndex = (this.rpcIndex + 1) % this.internalConfig.rpc.length; same problem tho
	// const elected = peers[unresolvedRequest.extraInfo.latestAggregatorRoundId.mod()];
	// TODO: ask help
	const index = unresolvedRequest.extraInfo.latestAggregatorRoundId.mod(0);
	const elected = peers[current_leader];

	return elected;
}

export function median(list: Big[]): Big {
	list = list.sort();

	let mid_point = Math.floor(list.length / 2);

	if (mid_point % 2) {
		return (list[mid_point - 1].plus(list[mid_point])).div(2);
	} else {
		return list[mid_point];
	}
}

// TODO: fix for when we need to elect backup leader
/* export async function backup_leader_send(p2p: Communicator, median: string) {
	const new_leader = elect_leader(p2p);

	const data = {
		median,
		new_leader,
	};

	p2p.send('/backup/leader', [fromString(JSON.stringify(data))]);
}

export async function handle_backup_leader(p2p: Communicator, sender: (data?: Big) => void) {
	p2p.handle_incoming('/backup/leader', async (peer: Multiaddr, source: AsyncIterable<Uint8Array | BufferList>) => {
		let data_str = '';
		for await (const msg of source) {
			data_str += msg.toString();
		}

		const data = JSON.parse(data_str);
		logger.info(`Received elected backup leader \`${data.new_leader}\' from peer \`${peer}\``);

		if (data.new_leader == p2p._node_addr) {
			sender(new Big(data.median));
		} else {
			sender(undefined);
		}
		p2p.unhandle('/backup/leader');
	});
} */

export async function aggregate(p2p: Communicator, unresolvedRequest: P2PDataRequest, data_to_send: Big, sender: (data?: Big) => void) {
	const peer_unique_id: string = unresolvedRequest.internalId;
	let received: Big[] = [data_to_send];
	let med: Big = new Big(0);
	let medians_received_count: number = 0;
	let leader: string = '';
	let leaders_received_count: number = 0;

	p2p.handle_incoming(`/elected/leader/${peer_unique_id}`, async (peer: Multiaddr, source: AsyncIterable<Uint8Array | BufferList>) => {
		let elected = '';
		for await (const msg of source) {
			elected += msg.toString();
		}
		logger.info(`Received elected leader \`${elected}\' from peer \`${peer}\``);

		// make sure they all agree on who the leader is.
		leaders_received_count++;
		if (elected !== leader) {
			logger.error(`Received elected leader \`${elected}\' from peer \`${peer}\` but it did not match our elected leader \`${leader}\``);
			// should we fully error out,
			// or should we keep going as long as 51% agrees just like the median?
		} else if (leaders_received_count === p2p._peers.size && elected == p2p._node_addr) { // check if we are the leader
			// reset for next run
			await p2p.unhandle(`/elected/leader/${peer_unique_id}`);

			if (leader == p2p._node_addr) {
				// send data to contract.
				sender(med);
			} else {
				sender(undefined);
			}
		}
	});

	p2p.handle_incoming(`/calculated/median/${peer_unique_id}`, async (peer: Multiaddr, source: AsyncIterable<Uint8Array | BufferList>) => {
		let full_msg = '';
		for await (const msg of source) {
			full_msg += msg.toString();
		}
		medians_received_count++;
		logger.info(`Received median \`${full_msg}\' from peer \`${peer}\``);

		let same_median = true;
		let received_median = new Big(full_msg);
		if (!received_median.eq(med)) {
			logger.error(`Received median \`${full_msg}\' from peer \`${peer}\` but it did not match our median \`${med}\``);
			same_median = false;
			// Should throw some error here or something?
			// 51 % + agrees still send the median?
			// log an error.
			// see if there is a way to grab who sent this iteration of data.
		} else if (medians_received_count === p2p._peers.size && same_median) {
			leader = await elect_leader(p2p, unresolvedRequest);
			logger.info(`Elected leader \`${leader}\'`);
			p2p.send(`/elected/leader/${peer_unique_id}`, [fromString(leader)]);
			// reset for next run
			await p2p.unhandle(`/calculated/median/${peer_unique_id}`);
		}
	});
	
	p2p.handle_incoming(`/send/data/${peer_unique_id}`, async (peer: Multiaddr, source: AsyncIterable<Uint8Array | BufferList>) => {
		let full_msg = '';
		for await (const msg of source) {
			full_msg += msg.toString();
		}
		logger.info(`Received data \`${full_msg}\' from peer \`${peer}\``);

		received.push(new Big(full_msg));
		// account for our data
		if (received.length === (p2p._peers.size + 1)) {
			med = median(received);
			logger.info(`Calculated median \`${med}\'`);
			p2p.send('/calculated/median', [fromString(med.toString())]);
			// reset for next run
			await p2p.unhandle(`/send/data/${peer_unique_id}`);
		}
	});

	logger.info(`Sending data to peers ${data_to_send}`);
	p2p.send(`/send/data/${peer_unique_id}`, [fromString(data_to_send.toString())]);
}