import Big from "big.js";
import { Block } from "./Block";
import { Network } from "./Network";

export interface CreatedInfo {
    block: Block;
}


export interface DataRequest {
    internalId: string;
    args: string[];
    createdInfo: CreatedInfo;
    originNetwork: Network;
    targetNetwork: Network;
    confirmationsRequired: Big;
}

export interface DataRequestResolvedResult {
    message: string;
    resolved: boolean;
}
