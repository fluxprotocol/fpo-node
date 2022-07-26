// npx ts-node test/integration/p2p/createPeer.ts

import PeerId = require('peer-id');
import fs = require('fs');


async function main() {
    const id = await PeerId.create()
    console.log(JSON.stringify(id.toJSON(), null, 2))

    const providerPath = './test/integration/p2p/peer4.json'
    fs.writeFileSync(providerPath, JSON.stringify(id.toJSON(), null, 2))
}

main();