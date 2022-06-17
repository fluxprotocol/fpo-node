import { Network } from "../../../models/Network";
import { Pair, P2PInternalConfig } from "../models/P2PConfig"
import FluxP2PFactory from '../FluxP2PFactory.json';

export async function createPairIfNeeded(pair: Pair, config: P2PInternalConfig, network: Network) {
    try {
        if (network.type === 'evm') {
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
        } else {
            throw new Error(`Network type ${network.type} is not supported for price pushing`);
        }
    } catch (err) {
        if (err instanceof Object && err.toString().search("Already deployed")) {
            return;
        }

        throw err;
    }
}
