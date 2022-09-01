import { AnchorConfig } from "../../../models/AnchorConfig";
import { DataRequest, DataRequestResolved } from "../../../models/DataRequest";
import { DataRequestBatch, DataRequestBatchResolved } from "../../../models/DataRequestBatch";

interface PushPairExtraInfo extends AnchorConfig {
    pair: string;
    decimals: number;
    deviationPercentage: number;
    minimumUpdateInterval: number;
}

export interface PushPairDataRequest extends DataRequest {
    extraInfo: PushPairExtraInfo;
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
