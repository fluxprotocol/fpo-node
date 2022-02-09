import { JsonRpcProvider } from "@ethersproject/providers";
import Big from "big.js";
import { Contract, Wallet } from "ethers";

import { Block, getBlockType } from "../../models/Block";
import { DataRequestBatchResolved } from "../../models/DataRequestBatch";
import { Network } from "../../models/Network";
import { TxCallParams } from "../../models/TxCallParams";
import logger from "../../services/LoggerService";
import { EvmNetworkConfig, InternalEvmNetworkConfig, parseEvmNetworkConfig } from "./models/EvmNetworkConfig";

export default class EvmNetwork extends Network {
    static type: string = "evm";
    internalConfig: InternalEvmNetworkConfig;
    private wallet: Wallet;

    constructor(config: EvmNetworkConfig) {
        super(EvmNetwork.type, config);

        this.internalConfig = parseEvmNetworkConfig(config);
        this.wallet = new Wallet(this.internalConfig.privateKey, new JsonRpcProvider(this.internalConfig.rpc));
        this.queue.start(this.onQeueuBatch.bind(this));
    }

    async view(txParams: TxCallParams): Promise<any> {
        if (!txParams.abi) throw new Error(`[${this.id}] ABI is required for tx ${JSON.stringify(txParams)}`);
        const provider = new JsonRpcProvider(this.internalConfig.rpc);
        const contract = new Contract(txParams.address, txParams.abi, provider);

        const args = Object.values(txParams.params);
        console.log('[] args -> ', args);
        const result = await contract[txParams.method]();

        return result;
    }

    async onQeueuBatch(batch: DataRequestBatchResolved): Promise<void> {
        try {
            for await (const request of batch.requests) {
                if (!request.txCallParams.abi) {
                    logger.warn(`[${this.id}] Tx ${request.internalId} was not processed due to missing ABI`);
                    continue;
                }

                const contract = new Contract(request.txCallParams.address, request.txCallParams.abi, this.wallet);

                if (!contract[request.txCallParams.method]) {
                    logger.warn(`[${this.id}] Tx ${request.internalId} was not processed due to missing method ${request.txCallParams.method}`);
                    continue;
                }

                const args = Object.values(request.txCallParams.params);
                await contract[request.txCallParams.method](...args);
            }
        } catch (error) {
            logger.error(`[${this.id}-onQueueBatch] ${error}`);
        }
    }

    async init() {
        return;
    }

    async getLatestBlock(): Promise<Block | undefined> {
        try {
            const provider = new JsonRpcProvider(this.networkConfig.rpc);
            const currentBlock = await provider.getBlockNumber();

            return this.getBlock(currentBlock);
        } catch (error) {
            logger.error(`[${this.id}-getLatestBlock] ${error}`);
            return undefined;
        }
    }

    async getBlock(id: string | number): Promise<Block | undefined> {
        try {
            const blockType = getBlockType(id);
            const provider = new JsonRpcProvider(this.networkConfig.rpc);
            const type = blockType.type === 'hash' ? 'blockHash' : 'blockTag';

            const block = await provider.perform('getBlock', {
                [type]: blockType.tag,
            });

            if (!block) return;

            return {
                hash: block.hash,
                receiptRoot: block.receiptsRoot,
                number: new Big(parseInt(block.number)),
            };
        } catch (error) {
            logger.error(`[${this.id}-getBlock] ${error}`);
            return undefined;
        }
    }
}
