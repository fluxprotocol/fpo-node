import { readFile } from 'fs/promises'

let cachedDefaultBinary: Buffer;

export const WASM_LOCATION = process.env.BASIC_FETCH_WASM_LOCATION ?? './wasm/basic-fetch.wasm';

export default async function loadBasicFetchBinary() {
    if (cachedDefaultBinary) {
        return cachedDefaultBinary;
    }

    cachedDefaultBinary = await readFile(WASM_LOCATION);
    return cachedDefaultBinary;
}
