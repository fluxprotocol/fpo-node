import { Network } from "../../../models/Network";
import { Pair, P2PInternalConfig } from "../models/P2PConfig"
import FluxP2PFactory from '../FluxP2PFactory.json';
import { getHashFeedIdForPair } from "../../pushPair/services/utils";
import logger from "../../../services/LoggerService";
import e from "express";

export async function createPairIfNeeded(pair: Pair, config: P2PInternalConfig, network: Network) {
    try {
        if (network.type === 'evm') {
            const hashFeedId: string = await getHashFeedIdForPair(config, pair.pair, pair.decimals);
            let [,,status] = await network.view({
                method: 'valueFor',
                address: config.contractAddress,
                amount: '0',
                params: {
                    id: hashFeedId,
                },
                abi: FluxP2PFactory.abi,
            });
            if(Number(status) == 404){
                logger.info(`Deploying a new oracle`);
                await network.call({
                    method: 'deployOracle',
                    address: config.contractAddress,
                    amount: '0',
                    params: {
                        _pricePair: pair.pair,
                        _decimals: pair.decimals,
                        _signers: config.signers,
                    },
                    abi: FluxP2PFactory.abi,
                });
            }else{
                logger.info(`Oracle already deployed`);
            }
           
        } else {
            throw new Error(`Network type ${network.type} is not supported for price pushing`);
        }
    } catch (err) {
        // if (err instanceof Object && err.toString().search("Already deployed")) {
        //     return;
        // }
        throw err;
    }
}
