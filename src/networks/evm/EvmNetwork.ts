import { DataRequestBatch } from "../../models/DataRequestBatch";
import { Network } from "../../models/Network";
import { EvmNetworkConfig, InternalEvmNetworkConfig, parseEvmNetworkConfig } from "./models/EvmNetworkConfig";



export default class EvmNetwork extends Network {
    static type: string = "evm";
    internalConfig: InternalEvmNetworkConfig;

    constructor(config: EvmNetworkConfig) {
        super(config);

        this.internalConfig = parseEvmNetworkConfig(config);
        this.queue.start(this.onQeueuBatch);
    }

    async onQeueuBatch(batch: DataRequestBatch): Promise<void> {

    }
}
