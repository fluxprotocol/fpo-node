import Big from "big.js";
import { Block } from "./Block";
import { INetwork } from "./INetwork";
import { Outcome } from "./Outcome";
import { TxCallParams } from "./TxCallParams";

export interface CreatedInfo {
    block: Block;
}


export interface DataRequest {
    internalId: string;
    args: string[];
    createdInfo: CreatedInfo;
    originNetwork: INetwork;
    targetNetwork: INetwork;
    confirmationsRequired: Big;
    extraInfo: {
        [key: string]: any;
    }
}

export interface DataRequestResolved extends DataRequest {
    outcome: Outcome;
    txCallParams: TxCallParams;
}
