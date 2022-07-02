import fs from 'fs';
import { Worker, workerData } from "worker_threads";
import main from '../../src/main';

import { Pair } from '../../src/modules/p2p/models/P2PConfig';

import { load_fuzz_config, P2PFuzzConfig } from "./config";
import { generateP2PNodesConfigs } from "./p2p_node";
import createPairs from './pair';

async function fuzz(fuzz_config_path: string) {
	const config: P2PFuzzConfig = load_fuzz_config(fuzz_config_path);
	let node_configs = await generateP2PNodesConfigs(config);
	let creator = node_configs.shift();
	// console.log(`configs:`, JSON.stringify(node_configs));
	let alive_children: Worker[] = [];
	// for (const node_config of node_configs) {
	// 	console.log(fs.existsSync('./dist/test/fuzz/worker_main.js'));
	// 	const worker = new Worker('./dist/test/fuzz/worker_main.js', { workerData: node_config });
	// 	worker.stdout.pipe(process.stdout);
	// 	worker.stderr.pipe(process.stderr);
	// 	alive_children.push(worker);
	// }

	console.log(`Launched all nodes...`)
	main(creator!)
}

(async () => {
	await fuzz(process.argv.slice(2)[0]);
})();