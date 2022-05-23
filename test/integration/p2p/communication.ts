// Not really using jest for testing, but jest gives more import problems..
// for now we'll do it manually..
import PeerId from "peer-id";
import '../../TestPresets';
import main from '../../../src/main';
import { createNodeConfig, NodeInfo } from './config';

import peer1Key from './peer1.json';
import peer2Key from './peer2.json';

async function test() {
    const node1: NodeInfo = {
        peerId: await PeerId.createFromJSON(peer1Key),
        port: 1337
    };


    const node2: NodeInfo = {
        peerId: await PeerId.createFromJSON(peer2Key),
        port: 1338
    }

    const node1Config = createNodeConfig(node1, [node2]);
    const node2Config = createNodeConfig(node2, [node1]);

    main(node1Config);
    main(node2Config);
}

test();
