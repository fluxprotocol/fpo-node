import { JsonRpcProvider } from "@ethersproject/providers";
import Big from "big.js";
import { BigNumber, Contract, ethers, Wallet } from "ethers";
import { FAILED_TX_RETRY_SLEEP_MS, MAX_TX_TRANSACTIONS } from "../../config";
import { AppConfig } from "../../models/AppConfig";

import { Block, getBlockType } from "../../models/Block";
import { DataRequestResolved } from "../../models/DataRequest";
import { DataRequestBatchResolved } from "../../models/DataRequestBatch";
import { Network, TxEvent, WatchEventConfig } from "../../models/Network";
import { StoredEvents } from "../../models/StoredEvent";
import { TxCallParams } from "../../models/TxCallParams";
import database from "../../services/DatabaseService";
import logger from "../../services/LoggerService";
import { clamp } from "../../services/NumberUtils";
import { debouncedInterval, sleep } from "../../services/TimerUtils";
import { EvmNetworkConfig, InternalEvmNetworkConfig, parseEvmNetworkConfig } from "./models/EvmNetworkConfig";

export default class EvmNetwork extends Network {
    static type: string = "evm";
    internalConfig: InternalEvmNetworkConfig;
    private wallet: Wallet;
    private rpcIndex: number = 0;
    private dbPrefix: string;

    constructor(config: EvmNetworkConfig, appConfig: AppConfig) {
        super(EvmNetwork.type, config, appConfig);

        this.internalConfig = parseEvmNetworkConfig(config);
        this.wallet = new Wallet(this.internalConfig.privateKey, new JsonRpcProvider(this.getRpc()));
        this.queue.start(this.onQueueBatch.bind(this));
        this.dbPrefix = `network_${this.type}_${this.networkId}`;
    }

    async view(txParams: TxCallParams): Promise<any> {
        if (!txParams.abi) throw new Error(`[${this.id}] ABI is required for tx ${JSON.stringify(txParams)}`);
        const provider = new JsonRpcProvider(this.getRpc());
        const contract = new Contract(txParams.address, txParams.abi, provider);

        const args = Object.values(txParams.params);
        const result = await contract[txParams.method](...args);

        return result;
    }

    async getEvents(address: string, abi: any): Promise<any> {
        // const provider = new JsonRpcProvider(this.getRpc());
        // const contract = new Contract(address, abi, provider);

        // let eventFilter = contract.filters.NotifiedOracle();
        // let events = await contract.queryFilter(eventFilter);
        // console.log('jep', events);
    }

    async markEventAsProcessed(config: WatchEventConfig, event: TxEvent) {
        const eventsTableName = `${this.dbPrefix}_${config.prefix}_event_${config.address}_${config.topic}`;
        console.log('[] eventsTableName -> ', eventsTableName);
        let currentStoredEvents = await database.findDocumentById<StoredEvents>(eventsTableName, event.blockHash);

        console.log('[markEventAsProcessed] event -> ', event, currentStoredEvents);

        if (!currentStoredEvents) {
            logger.warn(`[${this.id}] Tried to delete non existing event`, {
                event,
            });
            return;
        }

        const index = currentStoredEvents.events.findIndex(event => event.logIndex === event.logIndex && event.transactionHash === event.transactionHash);
        currentStoredEvents.events.splice(index, 1);

        if (currentStoredEvents.events.length) {
            await database.replaceDocument(eventsTableName, event.blockHash, currentStoredEvents);
        } else {
            await database.deleteDocument(eventsTableName, event.blockHash);
        }

        logger.debug(`[${this.type}] Marked ${config.topic} event as completed at block ${event.blockNumber}`);
    }

    async watchEvent(config: WatchEventConfig, onEvent: (events: TxEvent) => void) {
        if (!config.abi) throw new Error(`"abi" is required for watchEvents`);
        const eventsTableName = `${this.dbPrefix}_${config.prefix}_event_${config.address}_${config.topic}`;
        database.createTable(eventsTableName);
        const blockSteps = config.blockSteps ?? 100;

        let provider = new JsonRpcProvider(this.getRpc());
        let contract = new Contract(config.address, config.abi, provider);
        const latestBlock = await this.getLatestBlock();
        if (!latestBlock) throw new Error('Could not fetch latest block');

        const eventFilter = contract.filters[config.topic]();
        let startingBlock = 0;
        let toBlock = 0;

        // Select which block to start from
        if (config.resync) {
            const currentEvents: StoredEvents[] = await database.getAllFromTable(eventsTableName);
            let latestEvents = currentEvents[currentEvents.length - 1];

            // Any events that are still unresolved should be handled again by the module
            if (latestEvents) {
                let highestBlockNumberResolved = latestEvents.blockNumber;

                // Search for highest block number that we have processed
                currentEvents.forEach((event) => {
                    if (event.blockNumber > highestBlockNumberResolved) {
                        latestEvents = event;
                        highestBlockNumberResolved = event.blockNumber;
                    }
                });

                startingBlock = latestEvents.blockNumber;
                toBlock = clamp(latestBlock.number.toNumber(), startingBlock, startingBlock + blockSteps);
            }

            // Events that are still in the database are not resolved
            // We should give them to the module again
            currentEvents.forEach((storedEvent) =>
                storedEvent.events.forEach(event => onEvent(event))
            );
        }

        // We should always use numbers for easier calculation of our block pointer
        // This should only trigger if there was nothing in our sync
        if (config.fromBlock === 'latest' && startingBlock === 0) {
            startingBlock = latestBlock.number.toNumber();
            toBlock = latestBlock.number.toNumber();
        }

        if (startingBlock === 0 && typeof config.fromBlock === 'number') {
            startingBlock = config.fromBlock;
            toBlock = clamp(latestBlock.number.toNumber(), startingBlock, startingBlock + blockSteps);
        }

        if (startingBlock === 0) {
            throw new Error('Starting block cannot be 0');
        }

        debouncedInterval(async () => {
            logger.debug(`[${this.id}] Looking for topic ${config.topic} with block range ${startingBlock}-${toBlock}`);

            // Setting the contract again in case of an RPC switch
            provider = new JsonRpcProvider(this.getRpc());
            contract = new Contract(config.address, config.abi, provider);

            const events = await contract.queryFilter(eventFilter, startingBlock, toBlock);

            // We want to make sure we atleast have a pointer so we don't keep fetching the same data with a restart
            if (!events.length) {
                const endBlock = await this.getBlock(toBlock);
                if (!endBlock) return;

                const storedEvents: StoredEvents = {
                    blockHash: endBlock.hash,
                    blockNumber: endBlock.number.toNumber(),
                    events: [],
                };

                logger.debug(`[${this.id}] Storing wavepoint for block ${endBlock.number.toString()}`);
                await database.createOrUpdateDocument(eventsTableName, endBlock.hash, storedEvents);

            }

            // Delete previous block pointer to not have unecessary blocks floating
            // Should only be blocks that we already processed and are not currently in our pointer
            if (startingBlock !== toBlock) {
                const startBlock = await this.getBlock(startingBlock);
                if (!startBlock) return;
                const storedEventsForBlock = await database.findDocumentById<StoredEvents>(eventsTableName, startBlock.hash);

                if (!storedEventsForBlock?.events.length) {
                    logger.debug(`[${this.id}] Deleted wavepoint for ${startBlock.number.toString()}`);
                    await database.deleteDocument(eventsTableName, startBlock.hash);
                }
            }

            for await (const event of events) {
                const args: { [key: string]: string | number | BigNumber } = { ...event.args } ?? {};

                Object.keys(args).forEach((key) => {
                    const value = args[key];
                    if (typeof value === 'number') return { [key]: value };
                    args[key] = value.toString();
                });

                const txEvent: TxEvent = {
                    args,
                    blockHash: event.blockHash,
                    blockNumber: event.blockNumber,
                    logIndex: event.logIndex,
                    transactionHash: event.transactionHash,
                };

                // We only want to use the database if it's necassary by the module
                if (config.resync) {
                    let currentStoredEvents = await database.findDocumentById<StoredEvents>(eventsTableName, txEvent.blockHash);

                    if (!currentStoredEvents) {
                        currentStoredEvents = {
                            blockHash: txEvent.blockHash,
                            blockNumber: txEvent.blockNumber,
                            events: [txEvent],
                        };
                    } else {
                        // Make sure we didn't already got the same event
                        // This will also cancel the onEvent callback
                        if (currentStoredEvents.events.some(e => e.transactionHash === event.transactionHash)) {
                            continue;
                        }

                        currentStoredEvents.events.push(txEvent);
                    }

                    await database.createOrUpdateDocument(eventsTableName, txEvent.blockNumber.toString(), currentStoredEvents);
                }

                onEvent(txEvent);
            }

            // Move the block cursor forward
            const latestBlock = await this.getLatestBlock();
            if (!latestBlock) return;

            startingBlock = toBlock - 10;
            toBlock = clamp(latestBlock.number.toNumber(), toBlock, toBlock + blockSteps);
        }, config.pollMs ?? 10_000);
    }

    private getRpc(): string {
        return this.internalConfig.rpc[this.rpcIndex];
    }

    private nextRpc() {
        this.rpcIndex = (this.rpcIndex + 1) % this.internalConfig.rpc.length;
        this.wallet = new Wallet(this.internalConfig.privateKey, new JsonRpcProvider(this.getRpc()));
    }

    async onQueueBatch(batch: DataRequestBatchResolved): Promise<void> {
        for await (const request of batch.requests) {
                try {
                if (!request.txCallParams.abi) {
                    logger.warn(`[${this.id}] Tx ${request.internalId} was not processed due to missing ABI`);
                    continue;
                }

                await this.sendRequest(request);
            } catch (error) {
                logger.error(`[${this.id}-onQueueBatch] ${error}`, {
                    config: this.networkConfig,
                });
            }
        }
    }

    async sendRequest(request: DataRequestResolved, retries: number = 0): Promise<boolean> {
        if (retries < MAX_TX_TRANSACTIONS) {
            try {
                if (retries !== 0) {
                    logger.info(`[${this.id}] Retrying transaction ${request.internalId} with ${retries} retries`);
                }

                const contract = new Contract(request.txCallParams.address, request.txCallParams.abi, this.wallet);

                if (!contract[request.txCallParams.method]) {
                    logger.warn(`[${this.id}] Tx ${request.internalId} was not processed due to missing method ${request.txCallParams.method}`);
                    return false;
                }

                const args = Object.values(request.txCallParams.params);

                let tx = await contract[request.txCallParams.method](...args);
                await tx.wait();
                logger.info(`[${this.id}-sendRequest] hash for tx with id ${request.internalId}  is: ${tx.hash}`);
                return true;
            } catch(error: any) {
                this.nextRpc();
                logger.error(`[${this.id}-sendRequest] ${error}`, { config: this.networkConfig });
                logger.info(`[${this.id}-sendRequest] transaction ${request.internalId} failed retrying in 1s with next RPC: ${this.getRpc()}...`);
                await sleep(FAILED_TX_RETRY_SLEEP_MS);
                logger.debug(`[${this.id}-sendRequest] Sleep over, retrying now`);
                const retryCounter = retries + 1;
                const result = await this.sendRequest(request, retryCounter);
                return result;
            }
        } else {
            logger.error(`[${this.id}-sendRequest] retried more than ${MAX_TX_TRANSACTIONS} times, dropping request`);
            return false;
        }
    }

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

            if (!block && retries < MAX_TX_TRANSACTIONS) {
                await sleep(FAILED_TX_RETRY_SLEEP_MS);
                return await this.getBlock(id, retries++);
            };

            return {
                hash: block.hash,
                receiptRoot: block.receiptsRoot,
                number: new Big(parseInt(block.number)),
            };
        } catch (error) {
            if (retries < MAX_TX_TRANSACTIONS) {
                this.nextRpc();
                logger.info(`[${this.id}-getBlock] failed fetching block, retrying with next RPC ${this.getRpc()}`);
                await sleep(FAILED_TX_RETRY_SLEEP_MS);
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
