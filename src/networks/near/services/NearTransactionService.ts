import { providers } from "near-api-js";

export function isTransactionFailure(executionOutcome: providers.FinalExecutionOutcome) {
    return executionOutcome.receipts_outcome.some((receipt) => {
        if (typeof receipt.outcome.status === 'string') {
            return false;
        }

        if (receipt.outcome.status?.Failure) {
            return true;
        }

        return false;
    });
}
