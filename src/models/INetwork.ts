import Big from "big.js";
import EventEmitter from "events";
import { Block } from "./Block";
import { DataRequestBatch, DataRequestBatchResolved } from "./DataRequestBatch";
import { Queue } from "./Queue";
import { TxCallParams } from "./TxCallParams";

export interface NetworkConfig {
    type: string;
    networkId: number;
    rpc: string;
    wssRpc?: string;
    blockFetchingInterval: number;
    queueDelay: number;
    [key: string]: any;
}

export interface INetwork extends EventEmitter {
    id: string;
    type: string;
    networkId: NetworkConfig['networkId'];
    networkConfig: NetworkConfig;
    queue: Queue;

    init(): Promise<void>;

    view(txParams: TxCallParams): Promise<any>;
    call(txParams: TxCallParams): Promise<any>;

    onQueueBatch(batch: DataRequestBatch): Promise<void>;
    addRequestsToQueue(batch: DataRequestBatchResolved): void;

    getBlock(id: string | number): Promise<Block | undefined>;
    getLatestBlock(): Promise<Block | undefined>;

    getBalance(accountId: string): Promise<Big | undefined>;

}
