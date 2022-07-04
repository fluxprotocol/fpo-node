import PeerId from 'peer-id';
import { UnparsedAppConfig } from "../../../src/models/AppConfig";

export interface NodeInfo {
    port: number;
    peerId: PeerId;
    privateKeyEnv: string;
}

export function createNodeConfig(ownNode: NodeInfo, otherNodes: NodeInfo[], logFile: string) {

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
                "contractAddress": "0x398F04Db383ffFC97B31D191C1708ff81a286781",
                "deviationPercentage": 0.5,
                "minimumUpdateInterval": 1800000,
                "pairs": [
                    {
                        "pair": "NEAR//USDT",
                        "decimals": 7,
                        "sources": [
                            {
                                "source_path": "market_data.current_price.usd",
                                "end_point": "https://api.coingecko.com/api/v3/coins/near"
                            }
                        ]
                    },
                    {
                        "pair": "NEAR--USD",
                        "decimals": 7,
                        "sources": [
                            {
                                "source_path": "market_data.current_price.usd",
                                "end_point": "https://api.coingecko.com/api/v3/coins/near"
                            }
                        ]
                    }
                ],
                "interval": 60_000,
                "logFile": logFile,
                "creator": "0xE19E8d5346Ade8294ec07c5431E5f6A1bb7F8ab2",
                // "signers": ["0xE19E8d5346Ade8294ec07c5431E5f6A1bb7F8ab2", "0xD8FC00c7fe6e9a12d701192595abF425A6546E9A"],

                "signers": ["0xE19E8d5346Ade8294ec07c5431E5f6A1bb7F8ab2", "0xD8FC00c7fe6e9a12d701192595abF425A6546E9A", "0xC4003CBC00c9279cA18F66acFD951768B69fEB32"],
                "type": "P2PModule"
            }
        ]
    }
    return config;
}
