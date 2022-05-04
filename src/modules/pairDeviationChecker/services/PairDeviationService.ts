import Big from "big.js";
import { PairDeviationDataRequest } from "../models/PairDeviationDataRequest";

export enum PricePairUpdateReason {
    NO_PRICE = 'NO_PRICE',
    PRICE_DEVIATION = 'PRICE_DEVIATION',
    EXCEEDED_TIMESTAMP = 'EXCEEDED_TIMESTAMP',
}

export interface PricePairUpdateReasonReport {
    shouldUpdate: boolean;
    reason: PricePairUpdateReason;
}

export function shouldPricePairUpdate(pair: PairDeviationDataRequest, lastUpdate: number, newPrice: Big, oldPrice?: Big): PricePairUpdateReasonReport {
    // This is probably the first time we are pushing
    if (!oldPrice) {
        return {
            shouldUpdate: true,
            reason: PricePairUpdateReason.NO_PRICE,
        };
    }

    const timeSinceUpdate = Date.now() - lastUpdate;

    // There hasn't been an update in a while, we should just update
    if (timeSinceUpdate >= pair.extraInfo.minimumUpdateInterval) {
        return {
            shouldUpdate: true,
            reason: PricePairUpdateReason.EXCEEDED_TIMESTAMP,
        };
    }

    const valueChange = newPrice.minus(oldPrice);
    const percentageChange = valueChange.div(oldPrice).times(100);

    if (percentageChange.lt(0)) {
        return {
            shouldUpdate: percentageChange.lte(-pair.extraInfo.deviationPercentage),
            reason: PricePairUpdateReason.PRICE_DEVIATION,
        };
    }

    return {
        shouldUpdate: percentageChange.gte(pair.extraInfo.deviationPercentage),
        reason: PricePairUpdateReason.PRICE_DEVIATION,
    }
}
