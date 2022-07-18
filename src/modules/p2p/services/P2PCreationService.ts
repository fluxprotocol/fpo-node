import { Network } from "../../../models/Network";
import { Pair, P2PInternalConfig } from "../models/P2PConfig"
import FluxP2PFactory from '../FluxP2PFactory.json';
import { getHashFeedIdForPair } from "../../pushPair/services/utils";
import logger from "../../../services/LoggerService";
import { ethers } from "ethers";
import { sleep } from "../../../services/TimerUtils";

export async function createPairIfNeeded(pair: Pair, config: P2PInternalConfig, network: Network): Promise<boolean> {
    try {
        if (network.type === 'evm') {
            const hashFeedId: string = await getHashFeedIdForPair(config, pair.pair, pair.decimals);
            let feedAddress = await network.view({
                method: 'addressOfPricePair',
                address: config.contractAddress,
                amount: '0',
                params: {
                    id: hashFeedId,
                },
                abi: FluxP2PFactory.abi,
            });

            let walletPublicAddress = network.getWalletPublicAddress();

            if ((feedAddress.toString() == ethers.constants.AddressZero) && (walletPublicAddress !== config.creator)) {
                logger.info(`No oracle found, can't deploy because given creator address ${config.creator}
                doesn't match the used wallet public address ${walletPublicAddress}`);
                logger.info(`Waiting for creator node to deploy the pair...`);
                return false;
            } else if((feedAddress.toString() == ethers.constants.AddressZero) && (walletPublicAddress === config.creator)) {
                logger.info(`**Deploying a new oracle`);
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
                return true;
            } else {
                logger.info(`**Oracle already deployed`);
                return true;
            } 
           
        } else {
            throw new Error(`Network type ${network.type} is not supported for price pushing`);
        }
    } catch (err) {
         // throw err;
         console.log("--createPairIfNeeded failed -- should retry: ", err)
         await sleep(5_000)
         return false
    }
}
