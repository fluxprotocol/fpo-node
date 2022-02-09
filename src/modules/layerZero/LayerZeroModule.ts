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

export class LayerZeroModule extends Module {
    static type = "LayerZeroModule";

    internalConfig: InternalLayerZeroModuleConfig;
    confirmationsQueue: DataRequestConfirmationsQueue;
    receivedTransactions: Set<string> = new Set();

    constructor(moduleConfig: LayerZeroModuleConfig, appConfig: AppConfig)  {
        super(LayerZeroModule.type, moduleConfig, appConfig);

        if (!this.network.networkConfig.wssRpc) throw new Error(`"wssRpc" in ${this.network.id} is required for ${LayerZeroModule.type} to work`);
        if (this.network.networkConfig.type !== 'evm') throw new Error(`Only networks with type "evm" are supported`);

        this.internalConfig = parseLayerZeroModuleConfig(moduleConfig);
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

    private onConfirmationQueueRequestReady(batch: DataRequestBatch, confirmations: Big) {
        const resolvedRequests: DataRequestResolved[] = batch.requests.map(request => {
            const destinationModule = this.getDestinationModule(request.targetNetwork.networkId);

            if (!destinationModule) {
                logger.warn(`[${this.id}] No destination address found in "modules" with type ${this.type}`);
                return;
            }

            if (request.targetNetwork.networkConfig.type === 'evm') {
                return {
                    ...request,
                    logs: [],
                    txCallParams: {
                        address: destinationModule.internalConfig.oracleContractAddress,
                        amount: '0',
                        method: 'proceedUpdateBlockHeader',
                        abi: layerZeroOracleAbi.abi,
                        params: {
                            dstNetworkAddress: request.args[1],
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
    }

    async start(): Promise<boolean> {
        const websocketProvider = new Web3.providers.WebsocketProvider(this.network.networkConfig.wssRpc!);
        const w3Instance = new Web3(websocketProvider);
        // ABI is valid but types of web3.js is a lil outdated..
        // @ts-ignore
        const contract = new w3Instance.eth.Contract(layerZeroOracleAbi.abi, this.internalConfig.oracleContractAddress);

        contract.events.NotifyOracleOfBlock().on('data', async (data: any) => {
            if (this.receivedTransactions.has(data.transactionHash)) {
                logger.debug(`[${this.id}] WSS double send tx ${data.transactionHash} skipping..`);
                return;
            }

            // Extra sleep to give the RPC time to process the block
            await sleep(2000);
            const block = await this.network.getBlock(data.blockHash);

            if (!block) {
                logger.error(`[${this.id}] Could not find block ${data.blockNumber}`);
                return;
            }

            const targetNetwork = this.appConfig.networks.find(n => n.networkId === Number(data.returnValues.chainId));

            if (!targetNetwork) {
                logger.warn(`[${this.id}] Could not find networkId ${data.returnValues.chainId}`);
                return;
            }

            // Double check our destination if an oracle address has even been configured
            const destinationModule = this.getDestinationModule(Number(data.returnValues.chainId));

            if (!destinationModule) {
                logger.warn(`[${this.id}] Could not find networkId ${data.returnValues.chainId} in "modules" config with type ${LayerZeroModule.type}`);
            }

            const request: DataRequest = {
                args: [this.type, data.returnValues.layerZeroContract],
                confirmationsRequired: new Big(data.returnValues.requiredBlockConfirmations),
                createdInfo: { block },
                internalId: `${this.network.id}-${block.number.toString()}-${data.returnValues.chainId}-${data.transactionHash}`,
                originNetwork: this.network,
                targetNetwork,
                extraInfo: {
                    payloadHash: data.returnValues.payloadHash,
                },
            };

            this.receivedTransactions.add(data.transactionHash);
            logger.info(`[${this.id}] Added request ${request.internalId}`);
            this.confirmationsQueue.addBatch(createDataRequestBatch([request]));
        });

        logger.info(`[${this.id}] Started listening`);
        return true;
    }
}
