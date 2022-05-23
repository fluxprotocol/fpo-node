import PeerId from 'peer-id';
import { UnparsedAppConfig } from "../../../src/models/AppConfig";

export interface NodeInfo {
    port: number;
    peerId: PeerId;
}

export function createNodeConfig(ownNode: NodeInfo, otherNodes: NodeInfo[]) {

    const config: UnparsedAppConfig = {
        "p2p": {
            "peer_id": ownNode.peerId.toJSON(),
            // @ts-ignore
            "addresses": {
                "listen": [`/ip4/127.0.0.1/tcp/${ownNode.port}/p2p/${ownNode.peerId.toB58String()}`],
            },
            "peers": otherNodes.map(peer => {
                return `/ip4/127.0.0.1/tcp/${peer.port}/p2p/${peer.peerId.toB58String()}`;
            }),
        },
        "networks": [
            {
                "type": "evm",
                "networkId": 5,
                "chainId": 5,
                "privateKeyEnvKey": "EVM_PRIVATE_KEY",
                "rpc": "https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",
            }
        ],
        "modules": [
            {
                "networkId": 5,
                // @ts-ignore
                "contractAddress": "0x3E599C6FbB823a631b97908485784a9ED9C51F35",
                "deviationPercentage": 0.5,
                "minimumUpdateInterval": 1800000,
                "pairs": [
                    {
                        "pair": "NEAR/USDT",
                        "decimals": 6,
                        "sources": [
                            {
                                "source_path": "market_data.current_price.usd",
                                "end_point": "https://api.coingecko.com/api/v3/coins/near"
                            }
                        ]
                    }
                ],
                "interval": 60000,
                "type": "P2PModule"
            }
        ]
    }

    return config;
}
