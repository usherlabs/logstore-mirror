/**
 * Wrapper around PushPipeline specific to StreamMessages.
 * Subscriptions are MessageStreams.
 * Not all MessageStreams are Subscriptions.
 */
import { Message, MessageMetadata } from '@concertodao/streamr-client';
import { StreamMessage } from '@streamr/protocol';
import { omit } from 'lodash';

import { convertStreamMessageToMessage } from './Message';
import * as G from './utils/GeneratorUtils';
import { Pipeline, PipelineTransform } from './utils/Pipeline';
import { PushPipeline } from './utils/PushPipeline';

export type MessageListener = (
	content: unknown,
	metadata: MessageMetadata
) => unknown | Promise<unknown>;

/**
 * Provides asynchronous iteration with
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of | for await .. of}.
 */
export class MessageStream implements AsyncIterable<Message> {
	private readonly pipeline: PushPipeline<StreamMessage, StreamMessage> =
		new PushPipeline();

	/** @internal */
	// eslint-disable-next-line @typescript-eslint/no-useless-constructor
	constructor() {}

	/**
	 * Attach a legacy onMessage handler and consume if necessary.
	 * onMessage is passed parsed content as first arument, and streamMessage as second argument.
	 * @internal
	 */
	useLegacyOnMessageHandler(onMessage: MessageListener): this {
		this.pipeline.onMessage.listen(async (streamMessage) => {
			const msg = convertStreamMessageToMessage(streamMessage);
			await onMessage(msg.content, omit(msg, 'content'));
		});
		this.pipeline.flow();

		return this;
	}

	/** @internal */
	getStreamMessages(): AsyncIterableIterator<StreamMessage> {
		return this.pipeline;
	}

	async *[Symbol.asyncIterator](): AsyncIterator<Message> {
		for await (const msg of this.pipeline) {
			yield convertStreamMessageToMessage(msg);
		}
	}

	/*
	 * The methods below are used to control or observe the pipeline.
	 * TODO We should refactor the pipeline handling so that a MessageStream producer
	 * (e.g. SubscriptionSession or Resends) creates a PushPipeline (or similar) data structure,
	 * and calls these methods for that pipeline. Here in MessageStream we'd see the object
	 * as Pipeline interface. Ideally here in MessageStream we'd use the pipeline only to get
	 * an async iterator when [Symbol.asyncIterator]() is called for this MessageStream.
	 * When the we have done the refactoring, all/most other methods below could be removed.
	 */

	/** @internal */
	onFinally = this.pipeline.onFinally;

	/** @internal */
	onBeforeFinally = this.pipeline.onBeforeFinally;

	/** @internal */
	onError = this.pipeline.onError;

	/** @internal */
	onMessage = this.pipeline.onMessage;

	/** @internal */
	flow(): void {
		this.pipeline.flow();
	}

	/** @internal */
	async push(item: StreamMessage): Promise<void> {
		await this.pipeline.push(item);
	}

	/** @internal */
	pipe<NewOutType>(
		fn: PipelineTransform<StreamMessage, NewOutType>
	): Pipeline<StreamMessage, NewOutType> {
		return this.pipeline.pipe(fn);
	}

	// used only in tests
	/** @internal */
	pipeBefore(
		fn: PipelineTransform<StreamMessage, StreamMessage>
	): Pipeline<StreamMessage, StreamMessage> {
		return this.pipeline.pipeBefore(fn);
	}

	/** @internal */
	map<NewOutType>(
		fn: G.GeneratorMap<StreamMessage, NewOutType>
	): Pipeline<StreamMessage, NewOutType> {
		return this.pipeline.map(fn);
	}

	/** @internal */
	forEach(
		fn: G.GeneratorForEach<StreamMessage>
	): Pipeline<StreamMessage, StreamMessage> {
		return this.pipeline.forEach(fn);
	}

	// used only in tests
	/** @internal */
	async consume(fn?: (streamMessage: StreamMessage) => void): Promise<void> {
		await this.pipeline.consume(fn);
	}

	// used only in tests
	/** @internal */
	onConsumed(fn: () => void | Promise<void>): void {
		this.pipeline.onConsumed(fn);
	}

	/** @internal */
	async pull(source: AsyncGenerator<StreamMessage>): Promise<void> {
		return this.pipeline.pull(source);
	}

	/** @internal */
	async handleError(err: Error): Promise<void> {
		await this.pipeline.handleError(err);
	}

	/** @internal */
	end(err?: Error): void {
		this.pipeline.end(err);
	}

	/** @internal */
	endWrite(err?: Error): void {
		this.pipeline.endWrite(err);
	}

	/** @internal */
	isDone(): boolean {
		return this.pipeline.isDone();
	}

	/** @internal */
	return(): Promise<unknown> {
		return this.pipeline.return();
	}

	// used only in tests
	/** @internal */
	throw(err: Error): Promise<unknown> {
		return this.pipeline.throw(err);
	}
}
