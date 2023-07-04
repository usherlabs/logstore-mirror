/**
 * Config and utilities for interating with identity & Ethereum chain.
 */
import type { BigNumber } from '@ethersproject/bignumber';
import type { Overrides } from '@ethersproject/contracts';
import type { Provider } from '@ethersproject/providers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Wallet } from '@ethersproject/wallet';
import type { ConnectionInfo } from '@ethersproject/web';
import type { ChainConnectionInfo } from 'streamr-client';

import { StrictLogStoreClientConfig } from './Config';

export const generateEthereumAccount = (): {
	address: string;
	privateKey: string;
} => {
	const wallet = Wallet.createRandom();
	return {
		address: wallet.address,
		privateKey: wallet.privateKey,
	};
};

export const getMainnetProviders = (
	config: Pick<StrictLogStoreClientConfig, 'contracts'>
): Provider[] => {
	return getRpcProviders(config.contracts.mainChainRPCs);
};

export const getStreamRegistryChainProviders = (
	config: Pick<StrictLogStoreClientConfig, 'contracts'>
): Provider[] => {
	return getRpcProviders(config.contracts.streamRegistryChainRPCs);
};

const getRpcProviders = (connectionInfo: ChainConnectionInfo): Provider[] => {
	return connectionInfo.rpcs.map((c: ConnectionInfo) => {
		return new JsonRpcProvider(c);
	});
};

export const getStreamRegistryOverrides = (
	config: Pick<StrictLogStoreClientConfig, 'contracts'>
): Overrides => {
	const primaryProvider = getStreamRegistryChainProviders(config)[0];
	return getOverrides(
		config.contracts.streamRegistryChainRPCs.name ?? 'polygon',
		primaryProvider,
		config
	);
};

/**
 * Apply the gasPriceStrategy to the estimated gas price, if given
 * Ethers.js will resolve the gas price promise before sending the tx
 */
const getOverrides = (
	chainName: string,
	provider: Provider,
	config: Pick<StrictLogStoreClientConfig, 'contracts'>
): Overrides => {
	const chainConfig = config.contracts.ethereumNetworks[chainName];
	if (chainConfig === undefined) {
		return {};
	}
	const overrides = chainConfig.overrides ?? {};
	if (chainConfig.highGasPriceStrategy) {
		const gasPriceStrategy = (estimatedGasPrice: BigNumber) =>
			estimatedGasPrice.add('10000000000');
		return {
			...overrides,
			gasPrice: provider.getGasPrice().then(gasPriceStrategy),
		};
	}
	return overrides;
};
