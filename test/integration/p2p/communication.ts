// Not really using jest for testing, but jest gives more import problems..
// for now we'll do it manually..
import PeerId from "peer-id";
import '../../TestPresets';
import main from '../../../src/main';
import { createNodeConfig, NodeInfo } from './config';

import peer1Key from './peer1.json';
import peer2Key from './peer2.json';
import peer3Key from './peer3.json';
import peer4Key from './peer4.json';


import { sleep } from "../../../src/services/TimerUtils";

async function test(index: number) {
    const node1: NodeInfo = {
        peerId: await PeerId.createFromJSON(peer1Key),
        port: 1356,
        privateKeyEnv: "EVM_PRIVATE_KEY1",
    };


    const node2: NodeInfo = {
        peerId: await PeerId.createFromJSON(peer2Key),
        port: 1357,
        privateKeyEnv: "EVM_PRIVATE_KEY2",
    }

    const node3: NodeInfo = {
        peerId: await PeerId.createFromJSON(peer3Key),
        port: 1358,
        privateKeyEnv: "EVM_PRIVATE_KEY3",
    }
    const node4: NodeInfo = {
        peerId: await PeerId.createFromJSON(peer4Key),
        port: 1359,
        privateKeyEnv: "EVM_PRIVATE_KEY4",
    }
    let nodeConfigs = []
    nodeConfigs[0] = createNodeConfig(node1, [node2, node3, node4], "node1_logs");
    nodeConfigs[1] = createNodeConfig(node2, [node1, node3, node4], "node2_logs");
    nodeConfigs[2] = createNodeConfig(node3, [node1, node2, node4], "node3_logs");
    nodeConfigs[3] = createNodeConfig(node4, [node1, node2, node3], "node4_logs");


    // nodeConfigs[0] = createNodeConfig(node1, [node2], "node1_logs");
    // nodeConfigs[1] = createNodeConfig(node2, [node1], "node2_logs");
    
    main(nodeConfigs[index]);
  

}

test(Number(process.argv.slice(2)[0]));
