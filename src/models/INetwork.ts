// export interface INetwork {
//     view(txParams: TxCallParams): Promise<any>;
//     call(txParams: TxCallParams): Promise<any>;

import { Block } from "./Block";
import { NetworkConfig } from "./NetworkConfig";
import { TxCallParams } from "./TxCallParams";

//     onQueueBatch(batch: DataRequestBatch): any;
//     getBlock(id: string | number): Promise<Block | undefined>;
//     getLatestBlock(): Promise<Block | undefined>;
//     init(): Promise<void>;
//     addRequestsToQueue(batch: DataRequestBatchResolved): void;
// }

export interface INetwork {
    type: string;
    id: string;
    networkId: NetworkConfig['networkId'];
    networkConfig: NetworkConfig;

    view(txParams: TxCallParams): Promise<any>;
    call(txParams: TxCallParams): Promise<any>;

    onQueueBatch(batch: any): any;
    getBlock(id: string | number): Promise<Block | undefined>;
    getLatestBlock(): Promise<Block | undefined>;
    init(): Promise<void>;
    addRequestsToQueue(batch: any): void;
}

