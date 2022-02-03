import Big from "big.js";
import { DataRequest } from "../models/DataRequest";
import { createBlockMock } from "./BlockMock";
import { createNetworkMock } from "./NetworkMock";

export function createDataRequestMock(request: Partial<DataRequest> = {}): DataRequest {
    return {
        args: [],
        confirmationsRequired: new Big(1),
        createdInfo: {
            block: createBlockMock(),
        },
        internalId: '',
        originNetwork: createNetworkMock(),
        targetNetwork: createNetworkMock(),
        ...request,
    };
}
