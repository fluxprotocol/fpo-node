import { DataRequest, DataRequestResolved } from "../../../models/DataRequest";
import { DataRequestBatch, DataRequestBatchResolved } from "../../../models/DataRequestBatch";

export interface PushPairDataRequest extends DataRequest {
    extraInfo: {
        pair: string;
        decimals: number;
    }
}

export interface PushPairResolvedDataRequest extends DataRequestResolved {
    extraInfo: {
        pair: string;
        decimals: number;
    }
};

export interface PushPairDataRequestBatch extends DataRequestBatch {
    requests: PushPairDataRequest[];
}

export interface PushPairDataRequestBatchResolved extends DataRequestBatchResolved {
    requests: PushPairResolvedDataRequest[];
}
