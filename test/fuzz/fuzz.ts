import fs from 'fs';
import { Worker, workerData } from "worker_threads";
import main from '../../src/main';

import { load_fuzz_config, P2PFuzzConfig } from "./config";
import { generateP2PNodesConfigs } from "./p2p_node";

async function fuzz(fuzz_config_path: string) {
	try {
		const config: P2PFuzzConfig = load_fuzz_config(fuzz_config_path);
		let node_configs = await generateP2PNodesConfigs(config);
		let creator = node_configs.shift();
		// console.log(`configs:`, JSON.stringify(node_configs));

		if (!fs.existsSync('./logs/fuzz')){
			fs.mkdirSync('./logs/fuzz');
		}

		// let loggers = new Array(node_configs.length - 1);
		let alive_children: Worker[] = new Array(node_configs.length - 1);
		node_configs.forEach((node_config, index) => {
			// const logger = fs.createWriteStream(`./logs/fuzz/peer_${0}.logs`);
			const worker = new Worker('./dist/test/fuzz/worker_main.js', { workerData: node_config });
			// worker.stdout.pipe(logger);
			// worker.stderr.pipe(logger);
			alive_children[index] = worker;
			// loggers[index] = logger;
		});

		console.log(`Launched all nodes...`);
		main(creator!)
	} catch (err) {
		console.log(`err:`, err);
	}
}

(async () => {
	await fuzz(process.argv.slice(2)[0]);
})();