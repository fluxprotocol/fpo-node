import EvmNetwork from '../../../networks/evm/EvmNetwork';
import { NearNetwork } from "../../../networks/near/NearNetwork";
import { P2PInternalConfig } from "../models/P2PConfig";
import { BigNumber } from 'ethers';
import { computeFactoryPairId } from '../../pushPair/services/utils';
import FluxP2PFactory from '../FluxP2PFactory.json';
import { sleep } from '../../../services/TimerUtils';

interface TimestampUpdateReport {
    oldestTimestamp: number;
    timestamps: number[];
}

export async function fetchEvmLastUpdate(config: P2PInternalConfig, network: EvmNetwork): Promise<TimestampUpdateReport> {
    let lastUpdated: BigNumber;
    let allPairTimestamps: number[];

    let pairTimestamps: BigNumber[] = [];

    for await (let pair of config.pairs) {
        // Contract returns [answer, updatedAt, statusCode]
        let pairTimestamp: BigNumber = BigNumber.from(-1)
        while(Number(pairTimestamp) == -1){
            try{
                pairTimestamp = (await network.view({
                    method: 'valueFor',
                    address: config.contractAddress,
                    amount: '0',
                    params: {
                        id: computeFactoryPairId(pair.pair, pair.decimals),
                    },
                    abi: FluxP2PFactory.abi,
                }))[1]
            }catch(err){
                console.log("@@fetchEvmLastUpdate: Error calling valueFor -- will retry ", err)
                await sleep(5_000)
            }

        }
        pairTimestamps.push(pairTimestamp);
    }

    lastUpdated = pairTimestamps.reduce((prev, next) => prev.gt(next) ? next : prev);
    allPairTimestamps = pairTimestamps.map(t => t.mul(1000).toNumber());

    return {
        oldestTimestamp: lastUpdated.mul(1000).toNumber(),
        timestamps: allPairTimestamps,
    };
}

// TODO: I don't think we support near yet?
export async function fetchNearLastUpdate(config: P2PInternalConfig, network: NearNetwork): Promise<TimestampUpdateReport> {
    let pairTimestamps: number[] = [];
    for await (let pair of config.pairs) {
        const entry = await network.view({
            method: 'get_entry',
            address: config.contractAddress,
            amount: '0',
            params: {
                provider: network.internalConfig?.account.accountId,
                pair: pair.pair,
            },
        });

        // Convert contract timestamp to milliseconds
        pairTimestamps.push(Math.floor(entry.last_update / 1000000));
    }

    const timestamp = pairTimestamps.reduce((prev, next) => prev > next ? next : prev);

    return {
        oldestTimestamp: timestamp,
        timestamps: pairTimestamps,
    };
}
