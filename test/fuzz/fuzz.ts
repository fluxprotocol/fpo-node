import fs from 'fs';
import cluster, { Worker} from 'node:cluster';
import { cpus } from 'node:os';
import { exit } from 'process';
import main from '../../src/main';
import { sleep } from '../../src/services/TimerUtils';

import { load_fuzz_config, P2PFuzzConfig } from "./config";
import { generateP2PNodesConfigs } from "./p2p_node";
import { randNumberFromRange, random_item } from './utils';

async function fuzz(fuzz_config_path: string) {
	try {
		const config: P2PFuzzConfig = load_fuzz_config(fuzz_config_path);
		const node_configs = (await generateP2PNodesConfigs(config)).randomize();
		const window_size = config.window ?? cpus().length;

		if (!fs.existsSync('.fuzz')){
			fs.mkdirSync('.fuzz');
		}

		let workers: NodeJS.Dict<string> = {};
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
				process.env["CHILD_INDEX"] = index.toString();
				let new_worker = cluster.fork(process.env).on('reconnect', (child: Worker) => cluster.emit('reconnect', child));
				workers[new_worker.id] =  index.toString();
			});
		}

		// cluster.on('exit', async (dead_child) => {
		// 	const oldPID = dead_child.process.pid;
		// 	console.log('worker '+oldPID+' died.');
		// });

		process.on('SIGINT', () => {
			const workers = cluster.workers!;
			for (const worker in workers) {
				workers[worker]!.kill();
			}
			exit(0);
		});

		cluster.on('reconnect', async (child: Worker) => {
			console.log(`in reconnect`);
			child.process.kill();
			await sleep(config.p2p_config.reconnect_interval ?? 300_000);
			process.env["CHILD_INDEX"] = workers[child.id];
			delete workers[child.id];
			console.log(`Reconnecting nodes in thread: ${process.env["CHILD_INDEX"]}`);
			let new_worker = cluster.fork().on('reconnect', (child: Worker) => cluster.emit('reconnect', child));
			workers[new_worker.id] = process.env["CHILD_INDEX"];
		});

		while (true) {
			await sleep(60_000);
			if (config.p2p_config.allow_disconnects && (randNumberFromRange(90, 100) > (config.p2p_config.random_disconnect_chance ?? 15))) {
				const worker = random_item(cluster.workers!);
				process.env["DC_INDEX"] = workers[worker.id];
				console.log(`Disconnecting nodes in thread: ${process.env["DC_INDEX"]}`);
				worker.emit('reconnect', worker);
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
	const config_str = fs.readFileSync(`.fuzz/window_${process.env["CHILD_INDEX"]}.json`, 'utf8');
	const config_json = JSON.parse(config_str);
	for (const config of config_json.configs) {
		main(config)
	}
}