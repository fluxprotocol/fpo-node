import Big from "big.js";
import { Block } from "../models/Block";

export function createBlockMock(block: Partial<Block> = {}): Block {
    return {
        hash: '0x1111',
        number: new Big(1),
        receiptRoot: '0x00000',
        ...block,
    }
}
