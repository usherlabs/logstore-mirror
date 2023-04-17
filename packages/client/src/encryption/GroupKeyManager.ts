import { StreamID, StreamPartID, StreamPartIDUtils } from '@streamr/protocol';
import { EthereumAddress, waitForEvent } from '@streamr/utils';
import crypto from 'crypto';
import { inject, Lifecycle, scoped } from 'tsyringe';

import {
	LogStoreClientConfigInjectionToken,
	StrictLogStoreClientConfig,
} from '../Config';
import { DestroySignal } from '../DestroySignal';
import { LogStoreClientEventEmitter } from '../events';
import { uuid } from '../utils/uuid';
import { GroupKey } from './GroupKey';
import { GroupKeyStore } from './GroupKeyStore';
import { LitProtocolFacade } from './LitProtocolFacade';
import { SubscriberKeyExchange } from './SubscriberKeyExchange';

@scoped(Lifecycle.ContainerScoped)
export class GroupKeyManager {
	private readonly groupKeyStore: GroupKeyStore;
	private readonly litProtocolFacade: LitProtocolFacade;
	private readonly subscriberKeyExchange: SubscriberKeyExchange;
	private readonly eventEmitter: LogStoreClientEventEmitter;
	private readonly destroySignal: DestroySignal;
	private readonly config: Pick<StrictLogStoreClientConfig, 'encryption'>;

	constructor(
		@inject(GroupKeyStore)
		groupKeyStore: GroupKeyStore,
		litProtocolFacade: LitProtocolFacade,
		@inject(SubscriberKeyExchange)
		subscriberKeyExchange: SubscriberKeyExchange,
		@inject(LogStoreClientEventEmitter)
		eventEmitter: LogStoreClientEventEmitter,
		@inject(DestroySignal)
		destroySignal: DestroySignal,
		@inject(LogStoreClientConfigInjectionToken)
		config: Pick<StrictLogStoreClientConfig, 'encryption'>
	) {
		this.groupKeyStore = groupKeyStore;
		this.litProtocolFacade = litProtocolFacade;
		this.subscriberKeyExchange = subscriberKeyExchange;
		this.eventEmitter = eventEmitter;
		this.destroySignal = destroySignal;
		this.config = config;
	}

	async fetchKey(
		streamPartId: StreamPartID,
		groupKeyId: string,
		publisherId: EthereumAddress
	): Promise<GroupKey> {
		const streamId = StreamPartIDUtils.getStreamID(streamPartId);

		// 1st try: local storage
		let groupKey = await this.groupKeyStore.get(groupKeyId, streamId);
		if (groupKey !== undefined) {
			return groupKey;
		}

		// 2nd try: lit-protocol
		if (this.config.encryption.litProtocolEnabled) {
			groupKey = await this.litProtocolFacade.get(streamId, groupKeyId);
			if (groupKey !== undefined) {
				await this.groupKeyStore.add(groupKey, streamId);
				return groupKey;
			}
		}

		// 3rd try: Streamr key-exchange
		await this.subscriberKeyExchange.requestGroupKey(
			groupKeyId,
			publisherId,
			streamPartId
		);
		const groupKeys = await waitForEvent(
			// TODO remove "as any" type casing in NET-889
			this.eventEmitter as any,
			'addGroupKey',
			this.config.encryption.keyRequestTimeout,
			(storedGroupKey: GroupKey) => storedGroupKey.id === groupKeyId,
			this.destroySignal.abortSignal
		);
		return groupKeys[0] as GroupKey;
	}

	async storeKey(
		groupKey: GroupKey | undefined,
		streamId: StreamID
	): Promise<GroupKey> {
		// TODO: name
		if (groupKey === undefined) {
			const keyData = crypto.randomBytes(32);
			// 1st try lit-protocol, if a key cannot be generated and stored, then generate group key locally
			if (this.config.encryption.litProtocolEnabled) {
				groupKey = await this.litProtocolFacade.store(streamId, keyData);
			}
			if (groupKey === undefined) {
				groupKey = new GroupKey(uuid('GroupKey'), keyData);
			}
		}
		await this.groupKeyStore.add(groupKey, streamId);
		return groupKey;
	}

	addKeyToLocalStore(groupKey: GroupKey, streamId: StreamID): Promise<void> {
		return this.groupKeyStore.add(groupKey, streamId);
	}
}
