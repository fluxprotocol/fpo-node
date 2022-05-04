import { PairDeviationDataRequest } from "./PairDeviationDataRequest";

export interface PairDeviationReport {
    pair: PairDeviationDataRequest;
    diff: number;
    updated: boolean;
    message?: string;
}
