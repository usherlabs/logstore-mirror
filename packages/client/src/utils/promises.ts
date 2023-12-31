import { Defer } from '@streamr/utils';
import pLimit from 'p-limit';
import pThrottle from 'p-throttle';

/**
 * Execute functions in parallel, but ensure they resolve in the order they were executed
 */
export function pOrderedResolve<ArgsType extends unknown[], ReturnType>(
	fn: (...args: ArgsType) => ReturnType
): ((...args: ArgsType) => Promise<any>) & { clear(): void } {
	const queue = pLimit(1);
	return Object.assign(
		async (...args: ArgsType) => {
			const d = new Defer<ReturnType>();
			const done = queue(() => d);
			await Promise.resolve(fn(...args)).then(
				d.resolve.bind(d),
				d.reject.bind(d)
			);
			return done;
		},
		{
			clear() {
				queue.clearQueue();
			},
		}
	);
}

/**
 * Returns a function that executes with limited concurrency.
 */
export function pLimitFn<ArgsType extends unknown[], ReturnType>(
	fn: (...args: ArgsType) => ReturnType | Promise<ReturnType>,
	limit = 1
): ((...args: ArgsType) => Promise<ReturnType>) & { clear(): void } {
	const queue = pLimit(limit);
	return Object.assign((...args: ArgsType) => queue(() => fn(...args)), {
		clear() {
			queue.clearQueue();
		},
	});
}

/**
 * Only allows one outstanding call.
 * Returns same promise while task is executing.
 */

export function pOne<ArgsType extends unknown[], ReturnType>(
	fn: (...args: ArgsType) => ReturnType | Promise<ReturnType>
): (...args: ArgsType) => Promise<ReturnType> {
	const once = pOnce(fn);
	return async (...args: ArgsType): Promise<ReturnType> => {
		try {
			return await once(...args);
		} finally {
			once.reset();
		}
	};
}

/**
 * Only allows calling `fn` once.
 * Returns same promise while task is executing.
 */

export function pOnce<ArgsType extends unknown[], ReturnType>(
	fn: (...args: ArgsType) => ReturnType | Promise<ReturnType>
): ((...args: ArgsType) => Promise<ReturnType>) & {
	reset(): void;
	isStarted(): boolean;
} {
	type CallStatus =
		| PromiseSettledResult<ReturnType>
		| { status: 'init' }
		| { status: 'pending'; promise: Promise<ReturnType> };
	let currentCall: CallStatus = { status: 'init' };

	return Object.assign(
		async function pOnceWrap(...args: ArgsType): Promise<ReturnType> {
			// eslint-disable-line prefer-arrow-callback
			// capture currentCall so can assign to it, even after reset
			const thisCall = currentCall;
			if (thisCall.status === 'pending') {
				return thisCall.promise;
			}

			if (thisCall.status === 'fulfilled') {
				return thisCall.value;
			}

			if (thisCall.status === 'rejected') {
				throw thisCall.reason;
			}

			// status === 'init'

			currentCall = thisCall;

			const promise = (async () => {
				// capture value/error
				try {
					const value = await fn(...args);
					Object.assign(thisCall, {
						promise: undefined, // release promise
						status: 'fulfilled',
						value,
					});
					return value;
				} catch (reason) {
					Object.assign(thisCall, {
						promise: undefined, // release promise
						status: 'rejected',
						reason,
					});

					throw reason;
				}
			})();
			promise.catch(() => {}); // prevent unhandled
			Object.assign(thisCall, {
				status: 'pending',
				promise,
			});

			return promise;
		},
		{
			isStarted() {
				return currentCall.status !== 'init';
			},
			reset() {
				currentCall = { status: 'init' };
			},
		}
	);
}

export const withThrottling = (
	fn: (...args: any[]) => Promise<any>,
	maxInvocationsPerSecond: number
): ((...args: any[]) => Promise<any>) => {
	const throttler = pThrottle({
		limit: maxInvocationsPerSecond,
		interval: 1000,
	});
	return throttler(fn);
};

export const tryInSequence = async <T>(
	fns: ((...args: any[]) => Promise<T>)[]
): Promise<T | never> => {
	if (fns.length === 0) {
		throw new Error('no tasks');
	}
	let firstError: any;
	for (const fn of fns) {
		try {
			const promise = fn();
			return await promise;
		} catch (e: any) {
			if (firstError === undefined) {
				firstError = e;
			}
		}
	}
	throw firstError;
};
