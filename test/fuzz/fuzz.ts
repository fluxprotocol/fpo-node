import fs from 'fs';
import cluster, { Worker} from 'node:cluster';
import { cpus } from 'node:os';
import { exit } from 'process';
import main from '../../src/main';

import { load_fuzz_config, P2PFuzzConfig } from "./config";
import { generateP2PNodesConfigs } from "./p2p_node";
import { randNumberFromRange, window } from './utils';

async function fuzz(fuzz_config_path: string) {
	try {
		const config: P2PFuzzConfig = load_fuzz_config(fuzz_config_path);
		const node_configs = await generateP2PNodesConfigs(config);
		const window_size = config.window ?? cpus().length;

		if (!fs.existsSync('.fuzz')){
			fs.mkdirSync('.fuzz');
		}

		let workers: Worker[] = new Array();
		if (window_size > 0) {
			const windowed = window(node_configs, window_size);
			windowed.forEach((window, index) => {
				console.log('window', window);
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