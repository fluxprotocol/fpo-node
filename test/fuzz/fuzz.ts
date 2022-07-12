import fs from 'fs';
import cluster, { Worker} from 'node:cluster';
import { cpus } from 'node:os';
import { exit } from 'process';
import main from '../../src/main';
import { latestVersion, new_version, P2PVersion, toString } from '../../src/p2p/models/P2PVersion';
import { sleep } from '../../src/services/TimerUtils';

import { load_fuzz_config, P2PFuzzConfig } from "./config";
import { generateP2PNodesConfigs } from "./p2p_node";
import { randNumberFromRange, random_item } from './utils';

interface NodeCluster {
	[id: number]: {
		index: string,
		node_version: P2PVersion,
		report_version: P2PVersion,
	}
}

async function fuzz(fuzz_config_path: string) {
	try {
		const config: P2PFuzzConfig = load_fuzz_config(fuzz_config_path);
		const node_configs = (await generateP2PNodesConfigs(config)).randomize();
		const window_size = config.window ?? cpus().length;
		let node_version = new_version(`${randNumberFromRange(0, 3)}.${randNumberFromRange(2, 8)}.${randNumberFromRange(3, 11)}`);
		let latest_node_version = node_version;
		let report_version = new_version(`${randNumberFromRange(2, 4)}.${randNumberFromRange(0, 1)}.${randNumberFromRange(1, 6)}`);
		process.env.P2P_NODE_VERSION = toString(node_version);
		process.env.P2P_REPORT_VERSION = toString(report_version);
		let nodes_version_mismatch = false;

		if (!fs.existsSync('.fuzz')) {
			fs.mkdirSync('.fuzz');
		}

		let workers: NodeCluster = {};
		if (window_size > 0) {
			const windowed = node_configs.window(window_size);
			windowed.forEach((window, index) => {
				fs.writeFileSync(
					`.fuzz/window_${index}.json`,
					JSON.stringify({
						configs: window,
					},
					null,
					2
				));
				process.env.CHILD_INDEX = index.toString();
				let new_worker = cluster.fork(process.env).on('reconnect', (child: Worker) => cluster.emit('reconnect', child));
				workers[new_worker.id] =  {
					index: process.env.CHILD_INDEX,
					node_version,
					report_version
				};
			});
		}

		process.on('SIGINT', () => {
			const workers = cluster.workers!;
			for (const worker in workers) {
				workers[worker]!.kill();
			}
			exit(0);
		});

		let resetting_node_version = false;
		cluster.on('reconnect', async (child: Worker) => {
			console.log(`in reconnect`);
			child.process.kill();
			await sleep(config.p2p_config.reconnect_interval ?? 300_000);
			const node_cluster = workers[child.id];
			delete workers[child.id];
			process.env.CHILD_INDEX = node_cluster.index;

			// Snapshot previous version
			// This is done to prevent accidentally updating other killed nodes.
			// i.e. covers more simulation cases
			let prev_node_version = process.env.P2P_NODE_VERSION;
			if (resetting_node_version) {
				process.env.P2P_NODE_VERSION = toString(latest_node_version);
				prev_node_version = process.env.P2P_NODE_VERSION;
				resetting_node_version = false;
				nodes_version_mismatch = false;
			} else if (config.p2p_config.randomly_update_nodes && randNumberFromRange(0, 100) <= (config.p2p_config.random_disconnect_chance ?? 15)) {
				let major = node_cluster.node_version.major;
				let minor = node_cluster.node_version.minor;
				let patch = node_cluster.node_version.patch;

				let num = randNumberFromRange(0, 100);
				console.log(`update major ${num}, ${num <= 100}`)
				if (num <= (config.p2p_config.major_update_chance ?? 15)) {
					major += 1;
					minor = 0;
					patch = 0;
					// we only care if there is a major version mismatch.
					// as the others should still function.
					nodes_version_mismatch = true;
				} else if (randNumberFromRange(0, 100) <= (config.p2p_config.minor_update_chance ?? 20)) {
					minor += 1;
					patch = 0;
				} else {
					patch += 1;
				}
				
				const new_v = new_version(`${major}.${minor}.${patch}`);
				process.env.P2P_NODE_VERSION = toString(new_v);
				latest_node_version = latestVersion(new_v, node_version);
				console.log(`Updating nodes in thread: ${process.env.CHILD_INDEX} to version ${process.env.P2P_NODE_VERSION}`);
			}

			console.log(`Reconnecting nodes in thread: ${process.env.CHILD_INDEX}`);
			let new_worker = cluster.fork(process.env).on('reconnect', (child: Worker) => cluster.emit('reconnect', child));
			
			// restore version if not major change
			workers[new_worker.id] = {
				index: process.env.CHILD_INDEX,
				node_version: new_version(process.env.P2P_NODE_VERSION!),
				report_version: new_version(process.env.P2P_REPORT_VERSION!),
			};
			process.env.P2P_NODE_VERSION = prev_node_version;
		});

		let node_rounds_outdated = 0;
		while (true) {
			await sleep(config.p2p_config.attempt_disconnect_interval ?? 180_000);

			if (config.p2p_config.allow_disconnects && randNumberFromRange(0, 100) <= (config.p2p_config.random_disconnect_chance ?? 15)) {
				const worker = random_item(cluster.workers!);
				process.env.DC_INDEX = workers[worker.id].index;
				console.log(`Disconnecting nodes in thread: ${process.env.DC_INDEX}`);
				worker.emit('reconnect', worker);
			}

			if (nodes_version_mismatch) {
				// TODO need a way to redo remaining nodes at latest version after a few runs
				if (node_rounds_outdated <= (config.p2p_config.outdated_rounds_allowed ?? 5)) {
					node_rounds_outdated++;
					console.log(`node_rounds_outdated: ${node_rounds_outdated}`);
				} else {
					node_rounds_outdated = 0;
					const workers = cluster.workers!;
					resetting_node_version = true;
					console.log(`Resetting all nodes to latest version: ${toString(latest_node_version)}`);
					for (const worker in workers) {
						const non_null = workers[worker]!;
						non_null.emit('reconnect', non_null);
					}
					
					continue;
				}
			}
			
		}

	} catch (err) {
		console.log(`err:`, err);
	}
}

if (cluster.isPrimary) {
	(async () => {
		await fuzz(process.argv.slice(2)[0]);
	})();
} else {
	const config_str = fs.readFileSync(`.fuzz/window_${process.env.CHILD_INDEX}.json`, 'utf8');
	const config_json = JSON.parse(config_str);
	for (const config of config_json.configs) {
		main(config)
	}
}