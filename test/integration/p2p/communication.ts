// Not really using jest for testing, but jest gives more import problems..
// for now we'll do it manually..
import PeerId from "peer-id";
import '../../TestPresets';
import main from '../../../src/main';
import { createNodeConfig, NodeInfo } from './config';

import peer1Key from './peer1.json';
import peer2Key from './peer2.json';
import peer3Key from './peer3.json';

import { sleep } from "../../../src/services/TimerUtils";

async function test(index: number) {
    const node1: NodeInfo = {
        peerId: await PeerId.createFromJSON(peer1Key),
        port: 1337,
        privateKeyEnv: "EVM_PRIVATE_KEY",
    };


    const node2: NodeInfo = {
        peerId: await PeerId.createFromJSON(peer2Key),
        port: 1338,
        privateKeyEnv: "EVM_PRIVATE_KEY2",
    }

    const node3: NodeInfo = {
        peerId: await PeerId.createFromJSON(peer3Key),
        port: 1339,
        privateKeyEnv: "EVM_PRIVATE_KEY3",
    }
    let nodeConfigs = []
    nodeConfigs[0] = createNodeConfig(node1, [node2, node3], "node1_logs");
    nodeConfigs[1] = createNodeConfig(node2, [node1, node3], "node2_logs");
    nodeConfigs[2] = createNodeConfig(node3, [node1, node2], "node3_logs");

    // nodeConfigs[0] = createNodeConfig(node1, [node2], "node1_logs");
    // nodeConfigs[1] = createNodeConfig(node2, [node1], "node2_logs");
    
    main(nodeConfigs[index]);
  

}

test(Number(process.argv.slice(2)[0]));
