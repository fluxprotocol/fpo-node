import { utils } from "ethers";

export function computeFactoryPairId(pair: string, decimals: number) {
    // Id = keccak256(bytes("Price-<PAIR>-<DECIMALS>)")
    return utils.keccak256(utils.toUtf8Bytes("Price-" + pair + "-" + decimals.toString()))
}
