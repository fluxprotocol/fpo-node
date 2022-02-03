import Web3 from "web3";
import { AppConfig } from "../../models/AppConfig";
import { Module, ModuleConfig } from "../../models/Module";
import { InternalLayerZeroModuleConfig, LayerZeroModuleConfig, parseLayerZeroModuleConfig } from "./models/LayerZeroModuleConfig";
import layerZeroOracleAbi from './LayerZeroOracleAbi.json';
import logger from "../../services/LoggerService";

export class LayerZeroModule extends Module {
    static type = "LayerZeroModule";

    internalConfig: InternalLayerZeroModuleConfig;

    constructor(moduleConfig: ModuleConfig, appConfig: AppConfig)  {
        super(moduleConfig, appConfig);

        if (!this.network.networkConfig.wssRpc) throw new Error(`"wssRpc" in ${this.network.id} is required for ${LayerZeroModule.type} to work`);

        this.internalConfig = parseLayerZeroModuleConfig(moduleConfig)
    }

    start(): void {
        const websocketProvider = new Web3.providers.WebsocketProvider(this.network.networkConfig.wssRpc!);
        const w3Instance = new Web3(websocketProvider);
        // ABI is valid but types of web3.js is a lil outdated..
        // @ts-ignore
        const contract = new w3Instance.eth.Contract(layerZeroOracleAbi, this.internalConfig.oracleContractAddress);

        contract.events.NotifyOracleOfBlock().on('data', (data: any) => {
            console.log('[] data -> ', data);
        });

        logger.info(`[${this.id}] Started listening`);
    }
}
