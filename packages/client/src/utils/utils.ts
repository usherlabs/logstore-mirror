import { StreamID, toStreamID } from '@streamr/protocol';
import { randomString, toEthereumAddress } from '@streamr/utils';

import pkg from '../../package.json';
import LRU from '../../vendor/quick-lru';
import { SEPARATOR } from './uuid';

/**
 * Generates counter-based ids.
 * Basically lodash.uniqueid but per-prefix.
 * Not universally unique.
 * Generally useful for tracking instances.
 *
 * Careful not to use too many prefixes since it needs to hold all prefixes in memory
 * e.g. don't pass new uuid as a prefix
 *
 * counterId('test') => test.0
 * counterId('test') => test.1
 */

// TODO convert to a class?
type CounterIdType = ((prefix: string, separator?: string) => string) & {
	clear: (...args: [string] | []) => void;
};
export const CounterId = (
	rootPrefix?: string,
	{ maxPrefixes = 256 }: { maxPrefixes?: number } = {}
): CounterIdType => {
	let counts: Record<string, number> = {}; // possible we could switch this to WeakMap and pass functions or classes.
	let didWarn = false;
	const counterIdFn = (prefix = 'ID', separator = SEPARATOR) => {
		// pedantic: wrap around if count grows too large
		counts[prefix] = (counts[prefix] + 1 || 0) % Number.MAX_SAFE_INTEGER;

		// warn once if too many prefixes
		if (!didWarn) {
			const numTracked = Object.keys(counts).length;
			if (numTracked > maxPrefixes) {
				didWarn = true;
				console.warn(
					`counterId should not be used for a large number of unique prefixes: ${numTracked} > ${maxPrefixes}`
				);
			}
		}

		// connect prefix with separator
		return [rootPrefix, prefix, counts[prefix]]
			.filter((v) => v != null) // remove {root}Prefix if not set
			.join(separator);
	};

	/**
	 * Clears counts for prefix or all if no prefix supplied.
	 *
	 * @param {string?} prefix
	 */
	counterIdFn.clear = (...args: [string] | []) => {
		// check length to differentiate between clear(undefined) & clear()
		if (args.length) {
			const [prefix] = args;
			delete counts[prefix];
		} else {
			// clear all
			counts = {};
		}
	};
	return counterIdFn;
};

export const counterId = CounterId();

export interface AnyInstance {
	constructor: {
		name: string;
		prototype: null | AnyInstance;
	};
}
export function instanceId(instance: AnyInstance, suffix = ''): string {
	return counterId(instance.constructor.name) + suffix;
}

function getVersion() {
	// dev deps are removed for production build
	const hasDevDependencies = !!(
		pkg.devDependencies && Object.keys(pkg.devDependencies).length
	);
	const isProduction =
		process.env.NODE_ENV === 'production' || hasDevDependencies;
	return `${pkg.version}${!isProduction ? 'dev' : ''}`;
}

// hardcode this at module exec time as can't change
const versionString = getVersion();

export function getVersionString(): string {
	return versionString;
}

export function formLogStoreSystemStreamId(
	logStoreNodeManagerAddress: string
): StreamID {
	return toStreamID('/system', toEthereumAddress(logStoreNodeManagerAddress));
}

export class MaxSizedSet<T> {
	private readonly delegate: LRU<T, true>;

	constructor(maxSize: number) {
		this.delegate = new LRU<T, true>({ maxSize });
	}

	add(value: T): void {
		this.delegate.set(value, true);
	}

	has(value: T): boolean {
		return this.delegate.has(value);
	}

	delete(value: T): void {
		this.delegate.delete(value);
	}
}

export function generateClientId(): string {
	return counterId(process.pid ? `${process.pid}` : randomString(4), '/');
}
