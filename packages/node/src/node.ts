import { Node as KyveNode } from '@kyve/core';
import { sleep } from '@kyve/core/dist/src/utils';
import { IRuntime } from '@/types';
import { cmd } from './cmd';

// import {runCache} from '@/methods/runCache';

export class Node extends KyveNode {
	protected runtime!: IRuntime;

	protected evmPrivateKey: string = '';

	/**
	 * Defines node options for CLI and initializes those inputs
	 * Node name is generated here depending on inputs
	 *
	 * @method constructor
	 */
	constructor() {
		super();

		// define extended program
		const options = cmd.parse().opts();
		this.evmPrivateKey = options.evmPrivateKey;

		// TODO: setup listeners for each source -- such that new conditions determined by pipelines can modify the listeners
	}

	protected runCache: () => Promise<void> = async () => {
		let createdAt = 0;
		let currentHeight = 0;
		let toHeight = 0;
		let maxHeight = 0;

		while (true) {
			// a smaller to_height means a bundle got dropped or invalidated
			if (+this.pool.bundle_proposal!.to_height < toHeight) {
				this.logger.debug(`Attempting to clear cache`);
				await this.cache.drop();
				this.logger.info(`Cleared cache\n`);
			}

			// cache data items from current height to required height
			createdAt = +this.pool.bundle_proposal!.created_at;
			currentHeight = +this.pool.current_height;
			toHeight =
				+this.pool.bundle_proposal!.to_height || +this.pool.current_height;
			maxHeight = +this.pool.max_bundle_size + toHeight;

			// clear finalized items
			let current = currentHeight;

			while (current > 0) {
				current -= 1;

				try {
					await this.cache.del(current.toString());
				} catch {
					break;
				}
			}

			let startHeight: number;
			let key: string;

			// determine from which height to continue caching
			if (await this.cache.exists((toHeight - 1).toString())) {
				startHeight = toHeight;
				key = this.pool.bundle_proposal!.to_key;
			} else {
				startHeight = currentHeight;
				key = this.pool.current_key;
			}

			this.logger.debug(
				`Caching from height ${startHeight} to ${maxHeight} ...`
			);

			let height = startHeight;

			this.runtime.setup();

			while (height < maxHeight) {
				try {
					let nextKey;

					if (key) {
						nextKey = await this.runtime.getNextKey(key);
					} else {
						nextKey = this.pool.start_key;
					}

					const item = await this.runtime.getDataItem(this, nextKey);

					await this.cache.put(height.toString(), item);
					await sleep(50);

					key = nextKey;
					height += 1;
				} catch {
					this.logger.warn(` Failed to get data item from height ${height}`);
					await sleep(10 * 1000);
				}
			}

			// wait until new bundle proposal gets created
			while (createdAt === +this.pool.bundle_proposal!.created_at) {
				await sleep(1000);
			}
		}
	};
}
