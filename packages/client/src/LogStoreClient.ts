import type {
	MessageListener,
	MessageStream,
	Stream,
	StreamDefinition,
} from '@logsn/streamr-client';
import { StreamrClient } from '@logsn/streamr-client';
import { cloneDeep } from 'lodash';
import 'reflect-metadata';
import { container as rootContainer } from 'tsyringe';

import {
	createStrictConfig,
	LogStoreClientConfigInjectionToken,
	redactConfig,
} from './Config';
import { LogStoreClientEventEmitter, LogStoreClientEvents } from './events';
import { LogStoreClientConfig } from './LogStoreClientConfig';
import { Queries, QueryOptions } from './Queries';
import { LogStoreRegistry } from './registry/LogStoreRegistry';

export class LogStoreClient extends StreamrClient {
	private readonly logStoreRegistry: LogStoreRegistry;
	private readonly logStoreQueries: Queries;
	private readonly logStoreClientEventEmitter: LogStoreClientEventEmitter;

	constructor(
		config: LogStoreClientConfig = {},
		/** @internal */
		parentContainer = rootContainer
	) {
		const container = parentContainer.createChildContainer();

		// Prepare a copy of `config` to call the super() method
		const streamrClientConfig = cloneDeep(config);
		delete streamrClientConfig.contracts?.logStoreNodeManagerChainAddress;
		delete streamrClientConfig.contracts?.logStoreStoreManagerChainAddress;
		delete streamrClientConfig.contracts?.logStoreTheGraphUrl;

		super(streamrClientConfig, container);
		// TODO: Using parentContainer breaks authentication in the Broker's tests
		// super(streamrClientConfig, parentContainer);

		const strictConfig = createStrictConfig(config);
		redactConfig(strictConfig);

		container.register(LogStoreClient, {
			useValue: this,
		});

		container.register(LogStoreClientConfigInjectionToken, {
			useValue: strictConfig,
		});

		this.logStoreClientEventEmitter =
			container.resolve<LogStoreClientEventEmitter>(LogStoreClientEventEmitter);

		this.logStoreRegistry =
			container.resolve<LogStoreRegistry>(LogStoreRegistry);

		this.logStoreQueries = container.resolve<Queries>(Queries);
	}

	// --------------------------------------------------------------------------------------------
	// Query
	// --------------------------------------------------------------------------------------------

	/**
	 * Stake funds so can query
	 */
	async queryStake(amount: bigint, options = { usd: false }) {
		return this.logStoreRegistry.queryStake(amount, { usd: options.usd });
	}

	/**
	 * Performs a query of stored historical data.
	 *
	 * @category Important
	 *
	 * @param streamDefinition - the stream partition for which data should be resent
	 * @param options - defines the kind of query that should be performed
	 * @param onMessage - callback will be invoked for each message retrieved
	 * @returns a {@link MessageStream} that provides an alternative way of iterating messages. Rejects if the stream is
	 * not stored (i.e. is not assigned to a storage node).
	 */
	async query(
		streamDefinition: StreamDefinition,
		options: QueryOptions,
		onMessage?: MessageListener
	): Promise<MessageStream> {
		const streamPartId = await this.streamIdBuilder.toStreamPartID(
			streamDefinition
		);
		const messageStream = await this.logStoreQueries.query(
			streamPartId,
			options
		);
		if (onMessage !== undefined) {
			messageStream.useLegacyOnMessageHandler(onMessage);
		}
		return messageStream;
	}

	// --------------------------------------------------------------------------------------------
	// LogStore
	// --------------------------------------------------------------------------------------------

	/**
	 * Add a stream to LogStore.
	 */
	async stakeOrCreateStore(
		streamIdOrPath: string,
		amount: bigint
	): Promise<void> {
		return this.logStoreRegistry.stakeOrCreateStore(streamIdOrPath, amount);
	}

	/**
	 * Checks whether a stream is assigned to a storage node.
	 */
	async isLogStoreStream(streamIdOrPath: string): Promise<boolean> {
		return this.logStoreRegistry.isLogStoreStream(streamIdOrPath);
	}

	/**
	 * Gets all streams assigned to a storage node.
	 *
	 * @returns a list of {@link Stream} as well as `blockNumber` of result (i.e. blockchain state)
	 */
	async getLogStoreStreams(): Promise<{
		streams: Stream[];
		blockNumber: number;
	}> {
		return this.logStoreRegistry.getStoredStreams();
	}

	/**
	 * Destroys an instance of a {@link StreamrClient} by disconnecting from peers, clearing any pending tasks, and
	 * freeing up resources. This should be called once a user is done with the instance.
	 *
	 * @remarks As the name implies, the client instance (or any streams or subscriptions returned by it) should _not_
	 * be used after calling this method.
	 */
	override destroy(): Promise<void> {
		this.logStoreClientEventEmitter.removeAllListeners();
		return super.destroy();
	}

	// --------------------------------------------------------------------------------------------
	// Events
	// --------------------------------------------------------------------------------------------

	/**
	 * Adds an event listener to the client.
	 * @param eventName - event name, see {@link LogStoreClientEvents} for options
	 * @param listener - the callback function
	 */
	override on<T extends keyof LogStoreClientEvents>(
		eventName: T,
		listener: LogStoreClientEvents[T]
	): void {
		this.logStoreClientEventEmitter.on(eventName, listener as any);
	}

	/**
	 * Adds an event listener to the client that is invoked only once.
	 * @param eventName - event name, see {@link LogStoreClientEvents} for options
	 * @param listener - the callback function
	 */
	override once<T extends keyof LogStoreClientEvents>(
		eventName: T,
		listener: LogStoreClientEvents[T]
	): void {
		this.logStoreClientEventEmitter.once(eventName, listener as any);
	}

	/**
	 * Removes an event listener from the client.
	 * @param eventName - event name, see {@link LogStoreClientEvents} for options
	 * @param listener - the callback function to remove
	 */
	override off<T extends keyof LogStoreClientEvents>(
		eventName: T,
		listener: LogStoreClientEvents[T]
	): void {
		this.logStoreClientEventEmitter.off(eventName, listener as any);
	}
}
