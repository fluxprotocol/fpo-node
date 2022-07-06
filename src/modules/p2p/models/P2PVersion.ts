
export interface P2PVersion {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
}

export function newVersion(version: string): P2PVersion {
	const split = version.split(".");

	return {
		major: parseInt(split[0]) ?? 0,
		minor: parseInt(split[1]) ?? 0,
		patch: parseInt(split[2]) ?? 0,
	};
}

// helper function to reduce to grab the latest version.
export function lastestVersion(lhs: P2PVersion, rhs: P2PVersion): P2PVersion {
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
	return lhs.major === rhs.major ? true : false;
}