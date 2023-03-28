import {
	StreamID,
	StreamIDUtils,
	StreamPartID,
	StreamPartIDUtils,
	toStreamID,
	toStreamPartID,
} from '@streamr/protocol';
import { EthereumAddress } from '@streamr/utils';
import { StreamDefinition } from 'streamr-client';
import { inject, Lifecycle, scoped } from 'tsyringe';

import { Authentication, AuthenticationInjectionToken } from './Authentication';

export const DEFAULT_PARTITION = 0;

function pickStreamId(
	definition: { id: string } | { stream: string } | { streamId: string }
): StreamID {
	const obj = definition as any;
	if (obj.id !== undefined) {
		return obj.id;
	} else if (obj.stream !== undefined) {
		return obj.stream;
	} else if (obj.streamId !== undefined) {
		return obj.streamId;
	} else {
		throw new Error(
			'streamDefinition: object must have property: "id", "stream", or "streamId"'
		);
	}
}

function parseRawDefinition(
	definition: StreamDefinition
): [string, number | undefined] | never {
	if (typeof definition === 'string') {
		return StreamPartIDUtils.parseRawElements(definition);
	} else if (typeof definition === 'object') {
		return [pickStreamId(definition), definition.partition];
	} else {
		throw new Error('streamDefinition: must be of type string or object');
	}
}

@scoped(Lifecycle.ContainerScoped)
export class StreamIDBuilder {
	private authentication: Authentication;

	constructor(
		@inject(AuthenticationInjectionToken) authentication: Authentication
	) {
		this.authentication = authentication;
	}

	async toStreamID(streamIdOrPath: string): Promise<StreamID> {
		let address: EthereumAddress | undefined;
		if (StreamIDUtils.isPathOnlyFormat(streamIdOrPath)) {
			address = await this.authentication.getAddress();
		}
		return toStreamID(streamIdOrPath, address);
	}

	async toStreamPartID(definition: StreamDefinition): Promise<StreamPartID> {
		const [streamId, streamPartition] = await this.toStreamPartElements(
			definition
		);
		return toStreamPartID(streamId, streamPartition ?? DEFAULT_PARTITION);
	}

	async toStreamPartElements(
		definition: StreamDefinition
	): Promise<[StreamID, number | undefined]> {
		const [streamId, streamPartition] = parseRawDefinition(definition);
		return [await this.toStreamID(streamId), streamPartition];
	}

	async match(
		definition: StreamDefinition,
		streamPartId: StreamPartID
	): Promise<boolean> {
		const [targetStreamId, targetPartition] = await this.toStreamPartElements(
			definition
		);
		return (
			targetStreamId === StreamPartIDUtils.getStreamID(streamPartId) &&
			(targetPartition === undefined ||
				targetPartition === StreamPartIDUtils.getStreamPartition(streamPartId))
		);
	}
}
