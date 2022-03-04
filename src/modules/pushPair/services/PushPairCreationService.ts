import { Pair, PushPairInternalConfig } from "../models/PushPairConfig";
import FluxPriceFeedAbi from '../FluxPriceFeed.json';
import { NearNetwork } from "../../../networks/near/NearNetwork";
import logger from '../../../services/LoggerService';
import { INetwork } from "../../../models/INetwork";

const DEFAULT_NEAR_STORAGE_DEPOSIT = '300800000000000000000000';


async function createPairIfNeededForNear(pair: Pair, config: PushPairInternalConfig, network: NearNetwork) {
    let hasPriceFeed = false;

    // We have to do multiple try/catches because near throws errors instead of sending an "failed" object
    try {
        const entry = await network.view({
            method: 'get_entry',
            address: config.contractAddress,
            amount: '0',
            params: {
                provider: network.internalConfig?.account.accountId,
                pair: pair.pair,
            },
        });

        hasPriceFeed = true;

        if (entry.decimals !== pair.decimals) {
            logger.error(`Decimals on pair ${pair.pair}, network ${network.id} reported to have ${entry.decimals} (contract) but node is configured for ${pair.decimals}`);
            process.exit(1);
        }
    } catch (error) {
        hasPriceFeed = false;
        logger.debug(`No price feed found, creating one for ${pair.pair} with ${pair.decimals} decimals on ${network.networkId}`);
    }

    if (!hasPriceFeed) {
        await network.call({
            method: 'create_pair',
            address: config.contractAddress,
            amount: DEFAULT_NEAR_STORAGE_DEPOSIT,
            params: {
                pair: pair.pair,
                decimals: pair.decimals,
                // We expect the module to submit the price after this call
                initial_price: '0',
            },
        });
        logger.info(`Created pair for ${pair.pair}`);
    }
}

export async function createPairIfNeeded(pair: Pair, config: PushPairInternalConfig, network: INetwork) {
    if (network.type === 'evm') {
        if (config.pairsType === 'single') {
            // For EVM there is no pair creation, we just want to check if the decimals match.
            const decimals = await network.view({
                method: 'decimals',
                address: config.contractAddress,
                amount: '0',
                params: {},
                abi: FluxPriceFeedAbi.abi,
            });

            if (decimals !== pair.decimals) {
                throw new Error(`Decimals on pair ${pair.pair}, network ${network.id} reported to have ${decimals} (contract) but node is configured for ${pair.decimals}`);
            }
        }
    } else if (network.type === 'near') {
        await createPairIfNeededForNear(pair, config, network as NearNetwork);
    } else {
        throw new Error(`Network type ${network.type} is not supported for price pushing`);
    }
}
