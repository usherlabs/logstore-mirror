import { StreamrClientEvents } from '@concertodao/streamr-client';
import EventEmitter3 from 'eventemitter3';
import { Lifecycle, scoped } from 'tsyringe';

import { GroupKey } from './encryption/GroupKey';
import { LogStoreAssignmentEvent } from './registry/LogStoreRegistry';

type Events<T> = { [K in keyof T]: (payload: any) => void };

export interface LogStoreClientEvents extends StreamrClientEvents {
	addToLogStore: (payload: LogStoreAssignmentEvent) => void;
	removeFromLogStore: (payload: LogStoreAssignmentEvent) => void;
	/** @internal */
	addGroupKey: (groupKey: GroupKey) => void;
}

// events for internal communication between StreamrClient components
export interface InternalEvents {
	publish: () => void;
	subscribe: () => void;
}

interface ObserverEvents<E extends Events<E>> {
	addEventListener: (eventName: keyof E) => void;
	removeEventListener: (eventName: keyof E) => void;
}

/*
 * Emits an addEventListener/removeEventListener event to a separate EventEmitter
 * whenever a listener is added or removed
 */
export class ObservableEventEmitter<E extends Events<E>> {
	private delegate: EventEmitter3<any> = new EventEmitter3();
	private observer: EventEmitter3<ObserverEvents<E>> = new EventEmitter3();

	on<T extends keyof E>(eventName: T, listener: E[T]): void {
		this.delegate.on(eventName, listener);
		this.observer.emit('addEventListener', eventName);
	}

	once<T extends keyof E>(eventName: T, listener: E[T]): void {
		const wrappedFn = (payload: Parameters<E[T]>[0]) => {
			listener(payload);
			this.observer.emit('removeEventListener', eventName);
		};
		this.delegate.once(eventName, wrappedFn);
		this.observer.emit('addEventListener', eventName);
	}

	off<T extends keyof E>(eventName: T, listener: E[T]): void {
		this.delegate.off(eventName, listener);
		this.observer.emit('removeEventListener', eventName);
	}

	removeAllListeners(): void {
		const eventNames = this.delegate.eventNames();
		this.delegate.removeAllListeners();
		for (const eventName of eventNames) {
			this.observer.emit('removeEventListener', eventName);
		}
	}

	emit<T extends keyof E>(eventName: T, payload: Parameters<E[T]>[0]): void {
		this.delegate.emit(eventName, payload);
	}

	getListenerCount<T extends keyof E>(eventName: T): number {
		return this.delegate.listenerCount(eventName);
	}

	getObserver(): EventEmitter3<ObserverEvents<E>, any> {
		return this.observer;
	}
}

/*
 * Initializes a gateway which can produce events to the given emitter. The gateway is running
 * when there are any listeners for the given eventName: the start() callback is called
 * when a first event listener for the event name is added, and the stop() callback is called
 * when the last event listener is removed.
 */
export const initEventGateway = <E extends Events<E>, T extends keyof E, P>(
	eventName: T,
	start: (emit: (payload: Parameters<E[T]>[0]) => void) => P,
	stop: (listener: P) => void,
	emitter: ObservableEventEmitter<E>
): void => {
	const observer = emitter.getObserver();
	const emit = (payload: Parameters<E[T]>[0]) =>
		emitter.emit(eventName, payload);
	let producer: P | undefined;
	observer.on('addEventListener', (sourceEvent: keyof E) => {
		if (sourceEvent === eventName && producer === undefined) {
			producer = start(emit);
		}
	});
	observer.on('removeEventListener', (sourceEvent: keyof E) => {
		if (
			sourceEvent === eventName &&
			producer !== undefined &&
			emitter.getListenerCount(eventName) === 0
		) {
			stop(producer);
			producer = undefined;
		}
	});
	if (emitter.getListenerCount(eventName) > 0) {
		producer = start(emit);
	}
};

@scoped(Lifecycle.ContainerScoped)
export class LogStoreClientEventEmitter extends ObservableEventEmitter<
	LogStoreClientEvents & InternalEvents
> {}
