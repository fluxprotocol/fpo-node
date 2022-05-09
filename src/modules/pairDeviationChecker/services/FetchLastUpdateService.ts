import Big from "big.js";
import { Network } from "../../../models/Network";
import { NearNetwork } from "../../../networks/near/NearNetwork";
import logger from "../../../services/LoggerService";

import FluxPriceFeed from '../FluxPriceFeed.json';
import { PairDeviationDataRequest } from "../models/PairDeviationDataRequest";

export async function fetchLatestTimestamp(pair: PairDeviationDataRequest, network: Network): Promise<number | undefined> {
    try {
        if (network.type === 'evm') {
            const latestTimestamp = await network.view({
                method: 'latestTimestamp',
                address: pair.extraInfo.address,
                amount: '0',
                params: {},
                abi: FluxPriceFeed.abi,
            });

            // Convert contract timestamp to milliseconds
            return latestTimestamp.toNumber() * 1000;
        } else if (network.type === 'near') {
            const entry = await network.view({
                method: 'get_entry',
                address: pair.extraInfo.address,
                amount: '0',
                params: {
                    provider: pair.extraInfo.provider,
                    pair: pair.extraInfo.pair,
                },
            });

            // Convert contract timestamp to milliseconds
            return Math.floor(entry.last_update / 1000000);
        }

        throw new Error(`Network ${network.type} is not supported by this module`);
    } catch (error) {
        logger.error(`[PairDeviationChecker] Fetch latest timestamp error`, {
            error,
            fingerprint: `PairDeviationChecker-fetchLatestTimestamp-failure`,
        });
    }
}

export async function fetchLatestPrice(pair: PairDeviationDataRequest, network: Network): Promise<Big | undefined> {
    try {
        if (network.type === 'evm') {
            const result = await network.view({
                method: 'latestAnswer',
                address: pair.extraInfo.address,
                amount: '0',
                params: {},
                abi: FluxPriceFeed.abi,
            });

            return new Big(result.toString());
        } else if (network.type === 'near') {
            const result = await network.view({
                method: 'get_entry',
                address: pair.extraInfo.address,
                amount: '0',
                params: {
                    provider: (network as NearNetwork).internalConfig?.account.accountId,
                    pair: pair.extraInfo.pair,
                },
            });

            return new Big(result.price);
        }

        throw new Error(`Network ${network.type} is not supported by this module`);
    } catch (error) {
        logger.error(`[PairDeviationChecker] failed to fetchLatestPrice`, {
            error,
            fingerprint: `PairDeviationChecker-fetchLatestPrice-unknown`,
        });

        return undefined;
    }
}
