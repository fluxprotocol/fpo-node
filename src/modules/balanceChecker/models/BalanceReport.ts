import Big from "big.js";

export enum BalanceReportError {
    CONNECT = 'COULD_NOT_ESTABLISH_CONNECTION_WITH_RPC',
    NOT_ENOUGH_BALANCE = 'NOT_ENOUGH_BALANCE',
}

export interface BalanceReport {
    balance: Big;
    threshold: Big;
    address: string;
    error?: BalanceReportError;
}
