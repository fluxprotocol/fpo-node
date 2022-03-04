import EventEmitter from "events";
import { Block } from "./Block";
import { DataRequestBatch, DataRequestBatchResolved } from "./DataRequestBatch";
import { INetwork } from "./INetwork";
import { NetworkConfig } from "./NetworkConfig";
import { Queue } from "./Queue";
import { TxCallParams } from "./TxCallParams";

export class Network extends EventEmitter implements INetwork {
    static type = "network";
    networkConfig: NetworkConfig;
    queue: Queue;
    id: string;
    type: string;
    networkId: NetworkConfig['networkId'];

    constructor(type: string, config: NetworkConfig) {
        super();
        this.networkConfig = config;
        this.id = `${config.type}-${config.networkId}`;
        this.queue = new Queue(this.id, config.queueDelay);
        this.networkId = config.networkId;
        this.type = type;
    }

    async view(txParams: TxCallParams): Promise<any> {
        throw new Error(`${this.id} Not implemented view`);
    }

    async call(txParams: TxCallParams): Promise<any> {
        throw new Error(`${this.id} Not implemented call`);
    }

    async onQueueBatch(batch: DataRequestBatch) {
        throw new Error(`${this.id} Not implemented onQueueBatch`);
    }

    async getBlock(id: string | number): Promise<Block | undefined> {
        throw new Error(`${this.id} Not implemented getBlock`);
    }

    async getLatestBlock(): Promise<Block | undefined> {
        throw new Error(`${this.id} Not implemented getLatestBlock`);
    }

    async init(): Promise<void> {
        throw new Error(`${this.id} Not implemented init`);
    }

    addRequestsToQueue(batch: DataRequestBatchResolved): void {
        this.queue.add(batch);
    }
}
