import Big from "big.js";

export interface Block {
    hash: string;
    receiptRoot: string;
    number: Big;
}
