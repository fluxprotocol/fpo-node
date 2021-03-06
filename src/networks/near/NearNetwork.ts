import Big from "big.js";
import BN from "bn.js";
import { transactions } from "near-api-js";
import { FinalExecutionOutcome } from "near-api-js/lib/providers";
import { DataRequestBatchResolved } from "../../models/DataRequestBatch";
import { Network } from "../../models/Network";
import { TxCallParams } from "../../models/TxCallParams";
import logger from "../../services/LoggerService";
import { InternalNearNetworkConfig, NearNetworkConfig, parseNearNetworkConfig } from "./models/NearNetworkConfig";
import { isTransactionFailure } from "./services/NearTransactionService";

const DEFAULT_MAX_GAS = '300000000000000';

export class NearNetwork extends Network {
    static type: string = 'near';
    internalConfig?: InternalNearNetworkConfig;

    constructor(config: NearNetworkConfig) {
        super(NearNetwork.type, config);
    }

    async init(): Promise<void> {
        this.internalConfig = await parseNearNetworkConfig(this.networkConfig);
        this.queue.start(this.onQueueBatch.bind(this));
    }

    async view(txParams: TxCallParams): Promise<any> {
        if (!this.internalConfig) throw new Error(`[${this.id}] Config is not loaded`);

        const result = await this.internalConfig.account.viewFunction(txParams.address, txParams.method, txParams.params);
        return result;
    }

    async call(txParams: TxCallParams): Promise<FinalExecutionOutcome> {
        if (!this.internalConfig) throw new Error(`[${this.id}] Config is not loaded`);

        const result = await this.internalConfig.account.functionCall({
            args: txParams.params,
            contractId: txParams.address,
            methodName: txParams.method,
            attachedDeposit: txParams.amount ? new BN(txParams.amount) : undefined,
            gas: new BN(DEFAULT_MAX_GAS)
        });

        return result;
    }

    async onQueueBatch(batch: DataRequestBatchResolved): Promise<void> {
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
            logger.error(`[${this.id}] On queue batch unknown error`, {
                error
            });
        }
    }

    async getBalance(accountId: string): Promise<Big | undefined> {
        try {
            const account = await this.internalConfig?.near.account(accountId);
            const balance = await account?.getAccountBalance();

            if (!balance) return;

            return new Big(balance.available);
        } catch (error) {
            logger.error(`[${this.id}-getBalance] Get balance unknown error`, {
                error,
                config: this.networkConfig,
            });
            return undefined;
        }
    }
}
