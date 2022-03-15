import { logger } from "ethers";
import EventEmitter from "events";
import { AppConfig } from "./AppConfig";
import { Block } from "./Block";
import { DataRequestBatch, DataRequestBatchResolved } from "./DataRequestBatch";
import { Queue } from "./Queue";
import { TxCallParams } from "./TxCallParams";

export interface NetworkConfig {
    type: string;
    networkId: number;
    rpc: string[];
    wssRpc?: string;
    blockFetchingInterval: number;
    queueDelay: number;
    [key: string]: any;
}

export interface NetworkConfigUnparsed extends Omit<NetworkConfig, 'rpc'> {
    rpc: string | string[];
}

export function parseUnparsedNetworkConfig(config: Partial<NetworkConfigUnparsed>): NetworkConfig {
    if (!config.type || typeof config.type !== 'string') throw new Error(`"type" is required and must be a string`);
    if (!config.networkId || typeof config.networkId !== 'number') throw new Error(`"networkId" is required and must be a number`);
    if (config.wssRpc && typeof config.wssRpc !== 'string') throw new Error(`"wssRpc" must be a string`);
    if (config.blockFetchingInterval && typeof config.blockFetchingInterval !== 'number') throw new Error(`"blockFetchingInterval" must be a number`);
    if (config.queueDelay && typeof config.queueDelay !== 'number') throw new Error(`"queueDelay" must be a number`);
    if (!config.rpc) throw new Error(`"rpc" is required and must be a string or an array of strings`);

    let rpcs: string[] = [];

    if (typeof config.rpc === 'string') {
        rpcs = [config.rpc];
    } else if (Array.isArray(config.rpc)) {
        rpcs = config.rpc;
    } else {
        throw new Error(`"rpc" must be an string or an array of strings`);
    }

    return {
        // Spread the rest. They could contain more information per network
        ...config,
        networkId: config.networkId,
        rpc: rpcs,
        type: config.type,
        wssRpc: config.wssRpc,
        blockFetchingInterval: config.blockFetchingInterval ?? 5_000,
        queueDelay: config.queueDelay ?? 1_000,
    };
}

export interface WatchEventConfig {
    address: string;
    topic: string;
    prefix: string;
    resync?: boolean;
    fromBlock?: number | "latest";
    toBlock?: number | "latest";
    blockSteps?: number;
    pollMs?: number;
    abi?: any;
}

export interface TxEvent {
    blockNumber: number;
    blockHash: string;
    transactionHash: string;
    logIndex: number;
    args: {
        [key: string]: any;
    };
}

export class Network extends EventEmitter {
    static type = "network";
    networkConfig: NetworkConfig;
    queue: Queue;
    id: string;
    type: string;
    networkId: NetworkConfig['networkId'];

    constructor(type: string, config: NetworkConfig, appConfig: AppConfig) {
        super();
        this.networkConfig = config;
        this.id = `${config.type}-${config.networkId}`;
        this.queue = new Queue(this.id, config.queueDelay, appConfig);
        this.networkId = config.networkId;
        this.type = type;
    }

    async view(txParams: TxCallParams): Promise<any> {
        throw new Error(`${this.id} Not implemented view`);
    }

    async watchEvent(watchConfig: WatchEventConfig, onEvent: (events: TxEvent) => void) {
        throw new Error(`${this.id} Not implemented watchEvents`);
    }

    async markEventAsProcessed(config: WatchEventConfig, event: TxEvent) {
        throw new Error(`${this.id} Not implemented markEventAsProcessed`);
    }

    async getEvents(address: string, abi: any): Promise<any> {
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
