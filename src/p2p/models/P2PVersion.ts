import BufferList from "bl/BufferList";
import logger from "../../services/LoggerService";

export interface P2PVersion {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
}

export function new_version(version: string): P2PVersion {
	const split = version.split(".");

	return {
		major: parseInt(split[0]) ?? 0,
		minor: parseInt(split[1]) ?? 0,
		patch: parseInt(split[2]) ?? 0,
	};
}

export function toString(version: P2PVersion): string {
	return `${version.major}.${version.minor}.${version.patch}`;
}

	// helper function to reduce to grab the latest version.
export function latestVersion(lhs: P2PVersion, rhs: P2PVersion): P2PVersion {
	if (lhs.major > rhs.major) {
		return lhs;
	} else if (lhs.major < rhs.major) {
		return rhs;
	}

	if (lhs.minor > rhs.minor) {
		return lhs;
	} else if (lhs.minor < rhs.minor) {
		return rhs;
	}
	
	if (lhs.patch > rhs.patch) {
		return lhs;
	} else if (lhs.patch < rhs.patch) {
		return rhs;
	}

	return lhs;
}

	// Returns true if the versions are different by a major version.
export function rejectVersion(lhs: P2PVersion, rhs: P2PVersion): boolean {
	return lhs.major === rhs.major ? false : true;
}


export interface P2PVersionMessage {
    node_version: P2PVersion;
    report_version: P2PVersion;
}

export async function extractP2PVersionMessage(source: AsyncIterable<Uint8Array | BufferList>): Promise<P2PVersionMessage | undefined> {
    try {
        let p2pMessage: P2PVersionMessage | undefined;

        for await (const msg of source) {
            p2pMessage = JSON.parse(msg.toString());
        }

        return p2pMessage;
    } catch (error) {
        logger.error(`[extractP2PVersionMessage] unknown error`, {
            error,
        });
        return undefined;
    }
}