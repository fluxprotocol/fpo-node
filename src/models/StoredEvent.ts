import { TxEvent } from "./Network";

export interface StoredEvents {
    blockNumber: number;
    blockHash: string;
    events: TxEvent[];
}
