import { DataRequest } from "../../models/DataRequest";
import { Job } from "../../models/Job";
import { Outcome, OutcomeType } from "../../models/Outcome";
import logger from "../../services/LoggerService";
import loadBasicFetchBinary from "./loadBinary";

export class FetchJob extends Job {
    static type = 'FetchJob';
    id = FetchJob.type;
    type = FetchJob.type;

    async init(): Promise<boolean> {
        try {
            await loadBasicFetchBinary();
            return true;
        } catch (error) {
            logger.error(`[${this.id}] ${error}`);
            return false;
        }
    }

    async executeRequest(request: DataRequest): Promise<Outcome> {
        return {
            type: OutcomeType.Invalid
        };
    }
}

