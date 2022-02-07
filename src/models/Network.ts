import EventEmitter from "events";
import { Block } from "./Block";
import { DataRequestBatch, DataRequestBatchResolved } from "./DataRequestBatch";
import { Queue } from "./Queue";

export interface NetworkConfig {
    type: string;
    networkId: number;
    rpc: string;
    wssRpc?: string;
    blockFetchingInterval: number;
    [key: string]: any;
}

export function parseUnparsedNetworkConfig(config: Partial<NetworkConfig>): NetworkConfig {
    if (!config.type || typeof config.type !== 'string') throw new Error(`"type" is required and must be a string`);
    if (!config.networkId || typeof config.networkId !== 'number') throw new Error(`"networkId" is required and must be a number`);
    if (!config.rpc || typeof config.rpc !== 'string') throw new Error(`"rpc" is required and must be a string`);
    if (config.wssRpc && typeof config.wssRpc !== 'string') throw new Error(`"wssRpc" must be a string`);
    if (config.blockFetchingInterval && typeof config.blockFetchingInterval !== 'number') throw new Error(`"blockFetchingInterval" must be a number`);

    return {
        // Spread the rest. They could contain more information per network
        ...config,
        networkId: config.networkId,
        rpc: config.rpc,
        type: config.type,
        wssRpc: config.wssRpc,
        blockFetchingInterval: config.blockFetchingInterval ?? 5_000,
    };
}

export class Network extends EventEmitter {
    static type = "network";
    networkConfig: NetworkConfig;
    queue: Queue;
    id: string;
    networkId: NetworkConfig['networkId'];

    constructor(config: NetworkConfig) {
        super();
        this.networkConfig = config;
        this.id = `${config.type}-${config.networkId}`;
        this.queue = new Queue(this.id);
        this.networkId = config.networkId;
    }

    async onQeueuBatch(batch: DataRequestBatch) {
        throw new Error(`${this.id} Not implemented onQeueuBatch`);
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
