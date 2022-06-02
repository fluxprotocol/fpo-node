import PeerId from 'peer-id';
import { UnparsedAppConfig } from "../../../src/models/AppConfig";

export interface NodeInfo {
    port: number;
    peerId: PeerId;
    privateKeyEnv: string;
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
                "networkId": 1313161555,
                "chainId": 1313161555,
                "privateKeyEnvKey": ownNode.privateKeyEnv,
                "rpc": "https://aurora-testnet.infura.io/v3/c74faac46a3f4b7f855851aab2292f8b",
            }
        ],
        "modules": [
            {
                "networkId": 1313161555,
                // @ts-ignore
                "contractAddress": "0x5C52246D0a114Beb0943673E851140447fDF6C20",
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