import BN from "bn.js";
import { transactions } from "near-api-js";
import { DataRequestBatchResolved } from "../../models/DataRequestBatch";
import { Network } from "../../models/Network";
import logger from "../../services/LoggerService";
import { InternalNearNetworkConfig, NearNetworkConfig, parseNearNetworkConfig } from "./models/NearNetworkConfig";
import { isTransactionFailure } from "./services/NearTransactionService";

export class NearNetwork extends Network {
    static type: string = 'near';
    private internalConfig?: InternalNearNetworkConfig;

    constructor(config: NearNetworkConfig) {
        super(NearNetwork.type, config);
    }

    async init(): Promise<void> {
        this.internalConfig = await parseNearNetworkConfig(this.networkConfig);
        this.queue.start(this.onQeueuBatch.bind(this));
    }

    async onQeueuBatch(batch: DataRequestBatchResolved): Promise<void> {
        try {
            if (!this.internalConfig) throw new Error(`[${this.id}] Config is not loaded`);
            const maxGas = new BN(this.internalConfig.maxGas);

            const actions = batch.requests.map((request) => {
                return transactions.functionCall(request.txCallParams.method, {
                    ...request.txCallParams.params,
                }, maxGas.div(new BN(batch.requests.length)), new BN(request.txCallParams.amount));
            });

            // Near blocks access to actions that can batch... Yet they document the method...
            // @ts-ignore
            const txOutcome = await this.internalConfig.account.signAndSendTransaction({
                receiverId: batch.targetAddress,
                actions,
            });

            if (isTransactionFailure(txOutcome)) {
                logger.error(`[${this.id}] Batch could not be completed`, {
                    txOutcome: JSON.stringify(txOutcome),
                });
            }
        } catch (error) {
            logger.error(`[${this.id}] ${error}`);
        }
    }
}
