import Big from "big.js";
import { Contract, ethers, Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { fromString } from 'uint8arrays';

import logger from "../../services/LoggerService";
import { Block, getBlockType } from "../../models/Block";
import { DataRequestBatchResolved } from "../../models/DataRequestBatch";
import { EvmNetworkConfig, InternalEvmNetworkConfig, parseEvmNetworkConfig } from "./models/EvmNetworkConfig";
import { Network } from "../../models/Network";
import { TxCallParams, TxViewParams } from "../../models/TxCallParams";
import { DataRequestResolved } from "../../models/DataRequest";

export default class EvmNetwork extends Network {
    static type: string = "evm";
    internalConfig: InternalEvmNetworkConfig;
    private wallet: Wallet;

    constructor(config: EvmNetworkConfig) {
        super(EvmNetwork.type, config);

        this.internalConfig = parseEvmNetworkConfig(config);
        this.wallet = new Wallet(this.internalConfig.privateKey, new JsonRpcProvider(this.internalConfig.rpc));
        this.queue.start(this.onQueueBatch.bind(this));
    }

    async view(txParams: TxViewParams): Promise<any> {
        if (!txParams.abi) throw new Error(`[${this.id}] ABI is required for tx ${JSON.stringify(txParams)}`);
        const provider = new JsonRpcProvider(this.internalConfig.rpc);
        const contract = new Contract(txParams.address, txParams.abi, provider);

        const args = Object.values(txParams.params);
        const result = await contract[txParams.method](...args);

        return result;
    }

    async onQueueBatch(batch: DataRequestBatchResolved): Promise<void> {
        for await (const request of batch.requests) {
            try {
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
            } catch (error: any) {
                // Try to check if SERVER ERROR was because a node already pushed the same update
                //
                // Error messages (i.e. `error.body.error.message`) differ depending on the network.
                //  - Aurora Testnet: `ERR_INCORRECT_NONCE`
                //  - Goerli: `already known`
                if (error.code === 'SERVER_ERROR' && error.body) {
                    try {
                        const body = JSON.parse(error.body);
                        if (body.error && body.error.code && body.error.code === -32000 && body.error.message
                            && (body.error.message === 'ERR_INCORRECT_NONCE' || body.error.message === 'already known')
                        ) {
                            logger.debug(`[${this.id}-onQueueBatch] [${request.internalId}] Request seems to be already pushed (${body.error.message})`);
                            continue;
                        }
                    } catch (error) {
                        // Do nothing as error will be logged in next lines
                    }
                }

                logger.error(`[${this.id}-onQueueBatch] [${request?.internalId}] On queue batch unknown error`, {
                    error,
                    config: this.networkConfig,
                    fingerprint: `${this.type}-${this.networkId}-onQueueBatch-unknown`,
                });
            }
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
            logger.error(`[${this.id}-getLatestBlock] Get latest block unknown error`, {
                error,
                config: this.networkConfig,
                fingerprint: `${this.type}-${this.networkId}-getLatestBlock-unknown`,
            });
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
            logger.error(`[${this.id}-getBlock] Get block unknown error`, {
                error,
                config: this.networkConfig,
                fingerprint: `${this.type}-${this.networkId}-getBlock-unknown`,
            });
            return undefined;
        }
    }

    async getBalance(accountId: string): Promise<Big | undefined> {
        try {
            const provider = new JsonRpcProvider(this.networkConfig.rpc);
            const balance = await provider.getBalance(accountId);

            if (!balance) return;

            return new Big(balance.toString());
        } catch (error) {
            logger.error(`[${this.id}-getBalance] Get balance unknown error`, {
                error,
                config: this.networkConfig,
                fingerprint: `${this.type}-${this.networkId}-getBalance-unknown`,
            });
            return undefined;
        }
    }

    async sign(digest: Uint8Array): Promise<Uint8Array> {
        const signature = await this.wallet.signMessage(digest);
        return fromString(signature);
    }

    async verifySignature(message: Uint8Array, signature: Uint8Array): Promise<string> {
        return ethers.utils.verifyMessage(message, signature);
    }

    async createSignedTransaction(dataRequest: DataRequestResolved): Promise<void> {
        this.wallet.populateTransaction({

        });
    }

    getWalletPublicAddress() {
        return this.wallet.address;
    }
}
