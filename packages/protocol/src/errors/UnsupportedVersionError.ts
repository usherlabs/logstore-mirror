export default class UnsupportedVersionError extends Error {
	readonly version;

	constructor(version: number, message: string) {
		super(`Unsupported version: ${version}, message: ${message}`);
		this.version = version;
	}
}
