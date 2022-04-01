import Web3 from "web3";
import { AppConfig } from "../../models/AppConfig";
import { Module, ModuleConfig } from "../../models/Module";
import { InternalLayerZeroModuleConfig, LayerZeroModuleConfig, parseLayerZeroModuleConfig } from "./models/LayerZeroModuleConfig";
import layerZeroOracleAbi from './FluxLayerZeroOracle.json';
import logger from "../../services/LoggerService";
import { sleep } from "../../services/TimerUtils";
import { DataRequestConfirmationsQueue } from "../../models/DataRequestConfirmationsQueue";
import { createDataRequestBatch, DataRequestBatch } from "../../models/DataRequestBatch";
import { DataRequest, DataRequestResolved } from "../../models/DataRequest";
import Big from "big.js";
import { OutcomeType } from "../../models/Outcome";
import { TxEvent, WatchEventConfig } from "../../models/Network";

export class LayerZeroModule extends Module {
    static type = "LayerZeroModule";

    internalConfig: InternalLayerZeroModuleConfig;
    confirmationsQueue: DataRequestConfirmationsQueue;
    receivedTransactions: Set<string> = new Set();
    wsProvider: any;
    watchConfig: WatchEventConfig;

    constructor(moduleConfig: LayerZeroModuleConfig, appConfig: AppConfig)  {
        super(LayerZeroModule.type, moduleConfig, appConfig);

        if (!this.network.networkConfig.wssRpc) throw new Error(`"wssRpc" in ${this.network.id} is required for ${LayerZeroModule.type} to work`);
        if (this.network.networkConfig.type !== 'evm') throw new Error(`Only networks with type "evm" are supported`);

        this.internalConfig = parseLayerZeroModuleConfig(moduleConfig);
        this.watchConfig = {
            prefix: this.type,
            address: this.internalConfig.oracleContractAddress,
            topic: 'NotifiedOracle',
            abi: layerZeroOracleAbi.abi,
            fromBlock: this.internalConfig.startingBlock,
            resync: true,
        };

        // const config = {
        //     reconnect: {
        //         auto: true,
        //         delay: 1000,
        //         maxAttempts: 5,
        //         onTimeout: false
        //     }
        // }

        // this.wsProvider = new Web3.providers.WebsocketProvider(this.network.networkConfig.wssRpc, config);
        // this.network.getEvents(this.internalConfig.oracleContractAddress, layerZeroOracleAbi.abi)
        // this.wsProvider.on('connect', () => logger.info(`[network:${this.network.id}]: (re)connected`))
        // this.wsProvider.on('end', (msg: any) => logger.info(`[network:${this.network.id}]: ended ${msg}`))
        // this.wsProvider.on('error', (e: any) => logger.info(`[network:${this.network.id}]: error ${e}`))
        this.confirmationsQueue = new DataRequestConfirmationsQueue(this.network);
        this.confirmationsQueue.onRequestReady(this.onConfirmationQueueRequestReady.bind(this));
    }

    private getDestinationModule(networkId: number): LayerZeroModule | undefined {
        const layerZeroModule = this.appConfig.modules.find(module => {
            if (module.type !== LayerZeroModule.type) {
                return false;
            }

            if ((module as LayerZeroModule).internalConfig.networkId !== networkId) {
                return false;
            }

            return true;
        });

        return layerZeroModule as LayerZeroModule;
    }

    private async onConfirmationQueueRequestReady(batch: DataRequestBatch, confirmations: Big) {
        const resolvedRequests: DataRequestResolved[] = batch.requests.map(request => {
            const destinationModule = this.getDestinationModule(request.targetNetwork.networkId);

            if (!destinationModule) {
                logger.warn(`[${this.id}] No destination address found in "modules" with type ${this.type}`);
                return;
            }

            if (request.targetNetwork.networkConfig.type === 'evm') {
                return {
                    ...request,
                    outcome: {
                        type: OutcomeType.Answer,
                        answer: "",
                        logs: [],
                    },
                    txCallParams: {
                        address: destinationModule.internalConfig.oracleContractAddress,
                        amount: '0',
                        method: 'updateHash',
                        abi: layerZeroOracleAbi.abi,
                        params: {
                            srcChainId: request.originNetwork.networkId,
                            blockHash: request.createdInfo.block.hash,
                            confirmations: confirmations.toString(),
                            receiptRoot: request.createdInfo.block.receiptRoot,
                        },
                    }
                }
            }

            logger.warn(`[${this.id}] Network with type ${request.targetNetwork.networkConfig.type} was requested but not supported`);
            return undefined;
        }).filter(i => i) as DataRequestResolved[];

        batch.targetNetwork.addRequestsToQueue({
            ...batch,
            targetAddress: this.internalConfig.oracleContractAddress,
            requests: resolvedRequests,
        });

        resolvedRequests.forEach(async (request) => {
            await this.network.markEventAsProcessed(this.watchConfig, request.extraInfo.event);
        });
    }

    async start(): Promise<boolean> {
        await this.network.watchEvent(this.watchConfig, async (data: TxEvent) => {
            if (this.receivedTransactions.has(`${data.transactionHash}_${data.blockHash}`)) {
                logger.debug(`[${this.id}] Double send tx ${data.transactionHash} skipping..`);
                return;
            }

            // Extra sleep to give the RPC time to process the block
            await sleep(2000);
            const block = await this.network.getBlock(data.blockHash);

            if (!block) {
                logger.error(`[${this.id}] Could not find block ${data.blockNumber}`);
                return;
            }

            const targetNetwork = this.appConfig.networks.find(n => n.networkId === Number(data.args.chainId));

            if (!targetNetwork) {
                logger.warn(`[${this.id}] Could not find networkId ${data.args.chainId}`);
                return;
            }

            // Double check our destination if an oracle address has even been configured
            const destinationModule = this.getDestinationModule(Number(data.args.chainId));

            if (!destinationModule) {
                logger.warn(`[${this.id}] Could not find networkId ${data.args.chainId} in "modules" config with type ${LayerZeroModule.type}`);
            }

            const request: DataRequest = {
                args: [this.type, data.args.layerZeroContract],
                confirmationsRequired: new Big(data.args.requiredBlockConfirmations),
                createdInfo: { block },
                internalId: `${this.network.id}-${block.number.toString()}-${data.args.chainId}-${data.transactionHash}`,
                originNetwork: this.network,
                targetNetwork,
                extraInfo: {
                    payloadHash: data.args.payloadHash,
                    event: data,
                },
            };

            this.receivedTransactions.add(`${data.transactionHash}_${data.blockHash}`);
            logger.info(`[${this.id}] Added request ${request.internalId}`);
            this.confirmationsQueue.addBatch(createDataRequestBatch([request]));
        });

        return true;
    }

}
