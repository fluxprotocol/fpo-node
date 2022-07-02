import { Network } from "../../../models/Network";
import { Pair, P2PInternalConfig } from "../models/P2PConfig"
import FluxP2PFactory from '../FluxP2PFactory.json';
import { getHashFeedIdForPair } from "../../pushPair/services/utils";
import logger from "../../../services/LoggerService";
import e from "express";
import { ethers, Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import EvmNetwork from "../../../networks/evm/EvmNetwork";
import getWalletPublicAddress from "../../../networks/evm/EvmNetwork"
import { exit } from "process";
import { sleep } from "../../../services/TimerUtils";

export async function createPairIfNeeded(pair: Pair, config: P2PInternalConfig, network: Network) {
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
                throw new Error(`No oracle found, can't deploy because given creator address ${config.creator}
                doesn't match the used wallet public address ${walletPublicAddress}`);
            }else if((feedAddress.toString() == ethers.constants.AddressZero) && (walletPublicAddress === config.creator)) {
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

            }else {
                logger.info(`**Oracle already deployed`);
                return;
            } 
           
        } else {
            throw new Error(`Network type ${network.type} is not supported for price pushing`);
        }
    } catch (err) {
        throw err;
    }
}
