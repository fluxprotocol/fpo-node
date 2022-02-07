import Big from "big.js";

export interface Block {
    hash: string;
    receiptRoot: string;
    number: Big;
}



export interface BlockHashType {
    tag: string;
    type: 'hash';
}

export interface BlockTagType {
    tag: string;
    type: 'tag';
}

export type BlockTag = BlockHashType | BlockTagType;


export function getBlockType(tag: number | string): BlockTag {
    if (typeof tag === 'number') {
        const hexTag = tag.toString(16);

        return {
            type: 'tag',
            tag: `0x${hexTag}`,
        }
    }

    let resultTag = tag;

    if (!tag.startsWith('0x'))  {
        resultTag = '0x' + resultTag;
    }

    return {
        tag: resultTag,
        type: 'hash',
    };
}
