import { DataRequest, DataRequestResolved } from "../../../models/DataRequest";
import { DataRequestBatch, DataRequestBatchResolved } from "../../../models/DataRequestBatch";

export interface P2PDataRequest extends DataRequest {
    extraInfo: {
        pair: string;
        decimals: number;
    }
}

export interface P2PResolvedDataRequest extends DataRequestResolved {
    extraInfo: {
        pair: string;
        decimals: number;
    }
};

export interface P2PDataRequestBatch extends DataRequestBatch {
    requests: P2PDataRequest[];
}

export interface P2PDataRequestBatchResolved extends DataRequestBatchResolved {
    requests: P2PResolvedDataRequest[];
}
