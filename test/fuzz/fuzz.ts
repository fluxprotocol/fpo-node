import fs from 'fs';
import cluster, { Worker} from 'node:cluster';
import { cpus } from 'node:os';
import { exit } from 'process';
import main from '../../src/main';
import { sleep } from '../../src/services/TimerUtils';

import { load_fuzz_config, P2PFuzzConfig } from "./config";
import { generateP2PNodesConfigs } from "./p2p_node";
import { randNumberFromRange } from './utils';

async function fuzz(fuzz_config_path: string) {
	try {
		const config: P2PFuzzConfig = load_fuzz_config(fuzz_config_path);
		const node_configs = (await generateP2PNodesConfigs(config)).randomize();
		const window_size = config.window ?? cpus().length;

		if (!fs.existsSync('.fuzz')){
			fs.mkdirSync('.fuzz');
		}

		let workers: Worker[] = new Array();
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
				workers.push(cluster.fork(process.env));
			});
		}

		cluster.on('exit', async (dead_child) => {
			const oldPID = dead_child.process.pid;
			console.log('worker '+oldPID+' died.');

			// if (config.p2p_config.allow_disconnects) {
			// 	await sleep(120_000);

			// 	const worker = cluster.fork();
			// 	const newPID = worker.process.pid;

			// 	// Log the event
			// 	console.log('worker '+newPID+' born.');
			// }
		});

		process.on('SIGINT', () => {
			for (const worker of workers) {
				worker.process.kill();
			}
			exit(0);
		});

		cluster.on('reconnect', async (worker) => {
			await sleep(30_000);
			process.env["CHILD_INDEX"] = process.env["DC_INDEX"];
			console.log(`Reconnecting nodes in thread: ${process.env["CHILD_INDEX"]}`);
			cluster.fork();
		});

		await sleep(300_000);
		while (true) {
			await sleep(30_000);
			if (config.p2p_config.allow_disconnects && (randNumberFromRange(90, 100) > (config.p2p_config.random_disconnect_chance ?? 15))) {
				const index = workers.random_index();
				console.log(`Disconnecting nodes in thread: ${index}`);
				process.env["DC_INDEX"] = index.toString();
				workers[index].kill('reconnect');
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