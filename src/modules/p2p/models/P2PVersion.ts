
interface Semvar {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
}
export class P2PVersion implements Semvar {
	major: number;
	minor: number;
	patch: number;

	constructor(version: string) {
		const split = version.split(".");

		this.major = parseInt(split[0]) ?? 0;
		this.minor = parseInt(split[1]) ?? 0;
		this.patch = parseInt(split[2]) ?? 0;
	}

	public toString(): string {
		return `${this.major}.${this.minor}.${this.patch}`;
	}

	// helper function to reduce to grab the latest version.
	public latestVersion(rhs: P2PVersion): P2PVersion {
		if (this.major > rhs.major) {
			return this;
		} else if (this.major < rhs.major) {
			return rhs;
		}

		if (this.minor > rhs.minor) {
			return this;
		} else if (this.minor < rhs.minor) {
			return rhs;
		}
		
		if (this.patch > rhs.patch) {
			return this;
		} else if (this.patch < rhs.patch) {
			return rhs;
		}

		return this;
	}

	// Returns true if the versions are different by a major version.
	public rejectVersion(rhs: P2PVersion): boolean {
		return this.major === rhs.major ? false : true;
	}
}



