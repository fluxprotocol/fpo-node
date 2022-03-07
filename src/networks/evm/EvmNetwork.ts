import { JsonRpcProvider } from "@ethersproject/providers";
import Big from "big.js";
import { Contract, Wallet } from "ethers";
import { MAX_TX_TRANSACTIONS } from "../../config";
import { AppConfig } from "../../models/AppConfig";

import { Block, getBlockType } from "../../models/Block";
import { DataRequestResolved } from "../../models/DataRequest";
import { DataRequestBatchResolved } from "../../models/DataRequestBatch";
import { Network } from "../../models/Network";
import { TxCallParams } from "../../models/TxCallParams";
import { Database } from "../../services/DatabaseService";
import logger from "../../services/LoggerService";
import { sleep } from "../../services/TimerUtils";
import { EvmNetworkConfig, InternalEvmNetworkConfig, parseEvmNetworkConfig } from "./models/EvmNetworkConfig";

export default class EvmNetwork extends Network {
    static type: string = "evm";
    internalConfig: InternalEvmNetworkConfig;
    private wallet: Wallet;
    private rpcIndex: number = 0;

    constructor(config: EvmNetworkConfig, appConfig: AppConfig) {
        super(EvmNetwork.type, config, appConfig);

        this.internalConfig = parseEvmNetworkConfig(config);
        this.wallet = new Wallet(this.internalConfig.privateKey, new JsonRpcProvider(this.getRpc()));
        this.queue.start(this.onQueueBatch.bind(this));
    }

    async view(txParams: TxCallParams): Promise<any> {
        if (!txParams.abi) throw new Error(`[${this.id}] ABI is required for tx ${JSON.stringify(txParams)}`);
        const provider = new JsonRpcProvider(this.getRpc());
        const contract = new Contract(txParams.address, txParams.abi, provider);
        const args = Object.values(txParams.params);
        const result = await contract[txParams.method](...args);

        return result;
    }

    private getRpc(): string {
        return this.internalConfig.rpc[this.rpcIndex];
    }

    private nextRpc() {
        this.rpcIndex = (this.rpcIndex + 1) % this.internalConfig.rpc.length;
        this.wallet = new Wallet(this.internalConfig.privateKey, new JsonRpcProvider(this.getRpc()));
    }

    async onQueueBatch(batch: DataRequestBatchResolved): Promise<void> {
        try {
            for await (const request of batch.requests) {
                if (!request.txCallParams.abi) {
                    logger.warn(`[${this.id}] Tx ${request.internalId} was not processed due to missing ABI`);
                    continue;
                }

                if (!await this.sendRequest(request)) {
                    continue;
                }
            }
        } catch (error) {
            logger.error(`[${this.id}-onQueueBatch] ${error}`, {
                config: this.networkConfig,
            });
        }
    }

    async sendRequest(request: DataRequestResolved, retries: number = 0): Promise<boolean> {
        if (retries < MAX_TX_TRANSACTIONS) {
            try {
                const contract = new Contract(request.txCallParams.address, request.txCallParams.abi, this.wallet);

                if (!contract[request.txCallParams.method]) {
                    logger.warn(`[${this.id}] Tx ${request.internalId} was not processed due to missing method ${request.txCallParams.method}`);
                    return false;
                }

                const args = Object.values(request.txCallParams.params);

                await contract[request.txCallParams.method](...args);
                return true;
            } catch(error: any) {
                this.nextRpc();
                logger.error(`[${this.id}-onQueueBatch] ${error}`, { config: this.networkConfig });
                logger.info(`[${this.id}-onQueueBatch] transaction failed retrying in 1s with next RPC: ${this.getRpc()}...`);
                await sleep(1000);
                return await this.sendRequest(request, retries++);
            }
        } else {
            logger.error(`[${this.id}-onQueueBatch] retried more than ${MAX_TX_TRANSACTIONS} times, dropping request`);
            return false;
        }
    }

    // async getLogs(txParams: TxCallParams) {
    //     try {
    //         const provider = new JsonRpcProvider(this.networkConfig.rpc);
    //         const toBlock = await provider.getBlockNumber();
    //         const fromBlock = toBlock - 100;
    //         const filter = {
    //             address: txParams.address,
    //             fromBlock,
    //             toBlock,
    //         }

    //     } catch (error) {
    //         logger.error(`[${this.id}-eth_getLogs] ${error}`, {
    //             config: this.networkConfig,
    //         });
    //     }
    // }

    async getLatestBlock(): Promise<Block | undefined> {
        try {
            const provider = new JsonRpcProvider(this.getRpc());
            const currentBlock = await provider.getBlockNumber();
            return this.getBlock(currentBlock);
        } catch (error) {
            logger.error(`[${this.id}-getLatestBlock] ${error}`, {
                config: this.networkConfig,
            });
            return undefined;
        }
    }

    async getBlock(id: string | number, retries: number = 0): Promise<Block | undefined> {
        try {
            const blockType = getBlockType(id);
            const provider = new JsonRpcProvider(this.getRpc());
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
            if (retries < MAX_TX_TRANSACTIONS) {
                this.nextRpc();
                logger.info(`[${this.id}-getBlock] failed fetching block, retrying with next RPC ${this.getRpc()}`);
                await sleep(2000);
                return await this.getBlock(id, retries++);
            } else {
                logger.error(`[${this.id}-getBlock] ${error}`, {
                    config: this.networkConfig,
                });
                return undefined;
            }
        }
    }
}
