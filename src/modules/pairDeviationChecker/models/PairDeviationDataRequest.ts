import Big from "big.js";
import { FetchJob } from "../../../jobs/fetch/FetchJob";
import { DataRequest } from "../../../models/DataRequest";
import { INetwork } from "../../../models/INetwork";
import { CheckingPair, InternalPairDeviationCheckerModuleConfig } from "../models/PairDeviationCheckerModuleConfig";

export interface PairDeviationDataRequest extends DataRequest {
    extraInfo: {
        address: string;
        pair: string;
        decimals: number;
        deviationPercentage: number;
        minimumUpdateInterval: number;
        provider: string;
    },
}

/**
 * Creates a data request that can be used to execute jobs
 *
 * @export
 * @param {CheckingPair[]} pairs
 * @param {INetwork} network Only used for completeness of the data request interface. Can be a mock
 * @return {PairDeviationDataRequest[]}
 */
export function createRequestsFromPairs(config: InternalPairDeviationCheckerModuleConfig, network: INetwork): PairDeviationDataRequest[] {
    return config.pairs.map((pair, index) => {
        return {
            args: [
                FetchJob.type,
                JSON.stringify(pair.sources),
                'number',
                (10 ** pair.decimals).toString(),
            ],
            confirmationsRequired: new Big(0),
            createdInfo: {
                // Block info is not important for this request
                block: {
                    hash: '0x000000',
                    number: new Big(0),
                    receiptRoot: '0x000000',
                },
            },
            extraInfo: {
                address: pair.address,
                decimals: pair.decimals,
                deviationPercentage: pair.deviationPercentage,
                minimumUpdateInterval: pair.minimumUpdateInterval,
                pair: pair.pair,
                provider: pair.provider ?? config.provider,
            },
            internalId: `${network.id}/p${pair.pair}-i${index}-a${pair.address}`,
            originNetwork: network,
            targetNetwork: network,
        };
    });
}
