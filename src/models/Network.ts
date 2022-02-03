import logger from "../services/LoggerService";
import { Block } from "./Block";
import { DataRequest, DataRequestResolvedResult } from "./DataRequest";
import { DataRequestBatch } from "./DataRequestBatch";
import { Queue } from "./Queue";

export interface NetworkConfig {
    type: string;
    networkId: number;
    rpc: string;
    wssRpc?: string;
    [key: string]: any;
}

export function parseUnparsedNetworkConfig(config: Partial<NetworkConfig>): NetworkConfig {
    if (!config.type || typeof config.type !== 'string') throw new Error(`"type" is required and must be a string`);
    if (!config.networkId || typeof config.networkId !== 'number') throw new Error(`"networkId" is required and must be a number`);
    if (!config.rpc || typeof config.rpc !== 'string') throw new Error(`"rpc" is required and must be a string`);
    if (config.wssRpc && typeof config.wssRpc !== 'string') throw new Error(`"wssRpc" must be a string`);

    return {
        // Spread the rest. They could contain more information per network
        ...config,
        networkId: config.networkId,
        rpc: config.rpc,
        type: config.type,
        wssRpc: config.wssRpc,
    };
}

export class Network {
    static type = "network";
    networkConfig: NetworkConfig;
    queue: Queue;
    id: string;
    networkId: NetworkConfig['networkId'];

    constructor(config: NetworkConfig) {
        this.networkConfig = config;
        this.id = `${config.type}-${config.networkId}`;
        this.queue = new Queue(this.id);
        this.networkId = config.networkId;
    }

    async onQeueuBatch(batch: DataRequestBatch) {
        throw new Error('Not implemented');
    }

    async getBlock(id: string): Promise<Block> {
        throw new Error('Not implemented');
    }

    async init(): Promise<void> {
        throw new Error('Not implemented');
    }

    addRequestsToQueue(batch: DataRequestBatch): void {
        this.queue.add(batch);
    }
}
