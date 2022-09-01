import Big from "big.js";
import { FetchJob } from "../jobs/fetch/FetchJob";
import { createDataRequestMock } from "../mocks/DataRequestMock";
import { AnchorConfig } from "../models/AnchorConfig";
import { AppConfig } from "../models/AppConfig";
import { OutcomeType } from "../models/Outcome";
import logger from "./LoggerService";
import { sleep } from "./TimerUtils";

export interface FetchAnchorResult {
    shouldUpdate: boolean;
    anchorPrice: Big;
}

export async function fetchAnchorPrice(appConfig: AppConfig, dataRequestId: string, originalPrice: Big, decimals: number, anchorConfig: AnchorConfig, retriesLeft = 2): Promise<FetchAnchorResult> {
    try {
        // We mock a data request to fit the interfaces
        const request = createDataRequestMock({
            internalId: `${dataRequestId}-anchor`,
            args: [
                FetchJob.type,
                JSON.stringify(anchorConfig.anchorSources),
                'number',
                (10 ** decimals).toString(),
            ],
        });

        const job = appConfig.jobs.find(job => job.type === FetchJob.type);
        if (!job) throw new Error(`No job found with id ${FetchJob.type}`);

        const outcome = await job.executeRequest(request);
        
        if (outcome.type === OutcomeType.Invalid) {
            if (retriesLeft > 0 && anchorConfig.anchorRetriesBeforeFail > 0) {
                logger.warn(`[${dataRequestId}-anchor] Failed to fetch, retrying in ${anchorConfig.anchorWaitBetweenTriesInMs}ms, retries left: ${retriesLeft}`);
                await sleep(anchorConfig.anchorWaitBetweenTriesInMs);
                return fetchAnchorPrice(appConfig, dataRequestId, originalPrice, decimals, anchorConfig, retriesLeft - 1);
            }

            logger.warn(`[${dataRequestId}-anchor] Could not resolve anchor, will push: ${anchorConfig.anchorPushOnCheckFail}`);

            return {
                shouldUpdate: anchorConfig.anchorPushOnCheckFail,
                anchorPrice: new Big(0),
            }
        }

        const anchorPrice = new Big(outcome.answer);
        const valueChange = anchorPrice.minus(originalPrice);
        const percentageChange = valueChange.div(originalPrice).times(100);

        if (percentageChange.lt(0)) {
            const shouldUpdate = percentageChange.gte(-anchorConfig.anchorDeviationPercentage);

            return {
                shouldUpdate,
                anchorPrice,
            }
        }

        const shouldUpdate = percentageChange.lte(anchorConfig.anchorDeviationPercentage);

        return {
            shouldUpdate,
            anchorPrice,
        }
    } catch (error) {
        logger.error(`[AnchorPointService] Unknown error`, {
            error,
        });

        if (retriesLeft > 0 && anchorConfig.anchorRetriesBeforeFail > 0) {
            logger.warn(`[${dataRequestId}-anchor] Unknown error, retrying in ${anchorConfig.anchorWaitBetweenTriesInMs}ms, retries left: ${retriesLeft}`);
            await sleep(anchorConfig.anchorWaitBetweenTriesInMs);
            return fetchAnchorPrice(appConfig, dataRequestId, originalPrice, decimals, anchorConfig, retriesLeft - 1);
        }

        return {
            shouldUpdate: anchorConfig.anchorPushOnCheckFail,
            anchorPrice: new Big(0),
        }
    }
}