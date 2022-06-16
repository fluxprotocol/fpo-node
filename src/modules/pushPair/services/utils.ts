import toPath from 'lodash.topath';
import { utils } from "ethers";
import { P2PInternalConfig } from '../../p2p/models/P2PConfig';

export function convertOldSourcePath(sourcePath: string): string {
    // Keep support for more functions
    if (sourcePath.startsWith('$')) {
        return sourcePath;
    }

    const pathCrumbs = toPath(sourcePath);
    let result = '$';

    pathCrumbs.forEach((crumb) => {
        // Is an array path
        if (!isNaN(Number(crumb))) {
            result += `[${crumb}]`;
        } else if (crumb === '$$last') {
            result += '[-1:]';
        } else {
            result += `.${crumb}`;
        }
    });

    return result;
}

export function computeFactoryPairId(pair: string, decimals: number, provider?: string) {
    if (provider) {
        // Id = keccak256(bytes("Price-<PAIR>-<DECIMALS>-<PROVIDER_ADDRESS>)")
        return utils.solidityKeccak256(["string", "address"], [`Price-${pair}-${decimals.toString()}-`, provider]);
    } else {
        // Id = keccak256(bytes("Price-<PAIR>-<DECIMALS>)")
        return utils.keccak256(utils.toUtf8Bytes(`Price-${pair}-${decimals.toString()}`));
    }
}

export async function getHashFeedIdForPair(config: P2PInternalConfig, pair: string, decimals: number): Promise<string> {
    return utils.solidityKeccak256(
        ["string", "string", "string", "address"],
        ["Price-", pair, `-${decimals.toString()}-`, config.contractAddress],
    );
}