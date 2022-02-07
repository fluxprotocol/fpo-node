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
    extraInfo: {
        [key: string]: any;
    }
}


export interface DataRequestResolved extends DataRequest {
    logs: string[];
    txCallParams: {
        /** The address of the contract */
        address: string;

        /** Method to call on smart contract */
        method: string;

        /** Amount of native token to send along */
        amount: string;

        /** Some chains (EVM) need an ABI in order to call the contract and encode params */
        abi?: any;

        /** parameters to send with calling of transaction */
        params: {
            [key: string]: any,
        }
    }
}
