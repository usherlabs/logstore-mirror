import { Wallet } from 'ethers';
import hre, { ethers } from 'hardhat';

import {
	getNodeManagerInputParameters,
	getQueryManagerInputParameters,
	getReportBlockBuffer,
	getStoreManagerInputParameters,
	writeJSONToFileOutside,
} from '../utils/functions';

function createPK(index: number, prefix: string) {
	const hexString = index.toString(16);
	return '0x' + prefix + hexString.padStart(64 - prefix.length, '0');
}

const SAFE_ADDRESS: string =
	'0x468e80b73192998C565cFF53B1Dc02a12d5685c4' as const; // for MATIC Only
// const forceLSANToken = process.env.FORCE_LSAN_TOKEN === 'true';

async function main() {
	const [signer] = await hre.ethers.getSigners();

	// --------------------------- deploy the LSAN token
	const safeAddress =
		hre.network.config.chainId === 137 ? SAFE_ADDRESS : signer.address;
	const tokenManager = await hre.ethers.getContractFactory('LSAN');
	const tokenManagerContract = await hre.upgrades.deployProxy(tokenManager, [
		safeAddress,
		[],
	]);
	await tokenManagerContract.deployed();
	const tokenManagerAddress = tokenManagerContract.address;
	console.log(`tokenManagerAddress deployed to ${tokenManagerAddress}`, {
		safeAddress,
	});
	// --------------------------- deploy the LSAN token

	// --------------------------- deploy the node manager contract --------------------------- //
	console.log('Using LSAN TOKEN token as Stake Token...');
	const stakeTokenAddress = tokenManagerAddress;
	const nodeManagerContractParams = await getNodeManagerInputParameters(
		stakeTokenAddress
	);
	const nodeManagerArtifact = await hre.ethers.getContractFactory(
		'LogStoreNodeManager'
	);
	const nodeManagerContract = await hre.upgrades.deployProxy(
		nodeManagerArtifact,
		nodeManagerContractParams
	);
	await nodeManagerContract.deployed();
	const { address: nodeManagerAddress } = nodeManagerContract;
	console.log(`LogStoreNodeManager deployed to ${nodeManagerAddress}`);
	// --------------------------- deploy the node manager contract --------------------------- //

	// --------------------------- deploy the store manager --------------------------- //
	const storeManagerContractParams = await getStoreManagerInputParameters(
		nodeManagerAddress
	);
	const storeManagerArtifact = await hre.ethers.getContractFactory(
		'LogStoreManager'
	);
	const storeManagerContract = await hre.upgrades.deployProxy(
		storeManagerArtifact,
		storeManagerContractParams
	);
	await storeManagerContract.deployed();
	const { address: storeManagerAddress } = storeManagerContract;
	console.log(`LogStoreStoreManager deployed to ${storeManagerAddress}`);
	// --------------------------- deploy the store manager --------------------------- //

	// --------------------------- deploy the query manager contract --------------------------- //
	const queryManagerContractParams = await getQueryManagerInputParameters(
		nodeManagerAddress
	);
	const queryManagerArtifact = await hre.ethers.getContractFactory(
		'LogStoreQueryManager'
	);
	const queryManagerContract = await hre.upgrades.deployProxy(
		queryManagerArtifact,
		queryManagerContractParams
	);
	await queryManagerContract.deployed();
	const { address: queryManagerAddress } = queryManagerContract;
	console.log(`LogStoreQueryManager deployed to ${queryManagerAddress}`);
	// --------------------------- deploy the query manager contract --------------------------- //

	// --------------------------- deploy the report manager contract --------------------------- //
	// Get block time of chain id
	const reportBlockBuffer = await getReportBlockBuffer();
	const Lib = await hre.ethers.getContractFactory('VerifySignature');
	const lib = await Lib.deploy();
	await lib.deployed();
	// deploy contract
	const reportManager = await hre.ethers.getContractFactory(
		'LogStoreReportManager',
		{
			libraries: {
				VerifySignature: lib.address,
			},
		}
	);
	const reportManagerContract = await hre.upgrades.deployProxy(
		reportManager,
		[nodeManagerAddress, reportBlockBuffer],
		{
			unsafeAllowLinkedLibraries: true,
		}
	);
	await reportManagerContract.deployed();
	const { address: reportManagerAddress } = reportManagerContract;
	console.log(`LogStoreReportManager deployed to ${reportManagerAddress}`, {
		nodeManagerAddress,
		reportBlockBuffer,
	});
	// --------------------------- deploy the query manager contract --------------------------- //

	// --------------------------- mint dev token to the test accounts ------------------------- //
	if ([5, 8997].includes(hre.network.config.chainId || 0)) {
		const tokenManager = await hre.ethers.getContractFactory('LSAN');
		const token = await tokenManager.attach(stakeTokenAddress);

		const wallets: string[] = [];
		const MINT_AMOUNT = '1000000000000000000000000';
		const ACCOUNT_PK_PREFIX = '';
		const BROKER_PK_PREFIX = 'bb';
		const NUM_ACCOUNTS = 100;
		const NUM_BROKERS = 3;
		const NUM_ACCOUNTS_IN_BATCH = 100;

		console.log(`Minting LSAN to 10 Streamr developer accounts`);
		console.log(`Minting...`);
		wallets.push(
			'0xa3d1F77ACfF0060F7213D7BF3c7fEC78df847De1',
			'0x4178baBE9E5148c6D5fd431cD72884B07Ad855a0',
			'0xdC353aA3d81fC3d67Eb49F443df258029B01D8aB',
			'0x7986b71C27B6eAAB3120a984F26511B2dcfe3Fb4',
			'0xa6743286b55F36AFA5F4e7e35B6a80039C452dBD',
			'0x7B556228B0D887CfC8d895cCe27CbC79d3e55b3C',
			'0x795063367EbFEB994445d810b94461274E4f109A',
			'0xcA9b39e7A7063cDb845483426D4f12F1f4A44A19',
			'0x505D48552Ac17FfD0845FFA3783C2799fd4aaD78',
			'0x65416CBeF822290d9A2FC319Eb6c7f6D9Cd4a541'
		);
		await (await token.mintManyTokens(wallets, MINT_AMOUNT)).wait();
		wallets.splice(0);

		console.log(
			`Minting LSAN to ${NUM_ACCOUNTS} test accounts with Primary Keys:`
		);
		console.log('from: ', createPK(1, ACCOUNT_PK_PREFIX));
		console.log('to: ', createPK(NUM_ACCOUNTS, ACCOUNT_PK_PREFIX));
		console.log(`Minting...`);
		for (let accountIndex = 1; accountIndex <= NUM_ACCOUNTS; accountIndex++) {
			const privkey = createPK(accountIndex, ACCOUNT_PK_PREFIX);
			wallets.push(new Wallet(privkey).address);

			// Call mintManyTokens with batches to speed up the process and not exceed the gas limit.
			if (
				accountIndex === NUM_ACCOUNTS ||
				wallets.length === NUM_ACCOUNTS_IN_BATCH
			) {
				await (await token.mintManyTokens(wallets, MINT_AMOUNT)).wait();
				wallets.splice(0);
				console.log(
					`Minted to ${accountIndex} accounts out of ${NUM_ACCOUNTS}`
				);
			}
		}

		console.log(
			`Minting native token and LSAN to ${NUM_BROKERS} broker accounts with Primary Keys:`
		);
		console.log('from: ', createPK(1, BROKER_PK_PREFIX));
		console.log('to: ', createPK(NUM_BROKERS, BROKER_PK_PREFIX));
		console.log(`Minting...`);
		for (let accountIndex = 1; accountIndex <= NUM_BROKERS; accountIndex++) {
			const privkey = createPK(accountIndex, BROKER_PK_PREFIX);
			const address = new Wallet(privkey).address;
			wallets.push(address);

			const tx = {
				to: address,
				value: hre.ethers.utils.parseEther('1'),
			};
			await (await signer.sendTransaction(tx)).wait();

			// Call mintManyTokens with batches to speed up the process and not exceed the gas limit.
			if (
				accountIndex === NUM_BROKERS ||
				wallets.length === NUM_ACCOUNTS_IN_BATCH
			) {
				await (await token.mintManyTokens(wallets, MINT_AMOUNT)).wait();
				wallets.splice(0);
				console.log(`Minted to ${accountIndex} accounts out of ${NUM_BROKERS}`);
			}
		}
	}
	// --------------------------- mint dev token to the test accounts ------------------------- //

	// --------------------------- write addresses to file --------------------------- //
	// initialise nodemanager contract with sub contracts
	const registerQueryManagerTx =
		await nodeManagerContract.functions.registerQueryManager(
			queryManagerAddress
		);
	await registerQueryManagerTx.wait();

	const registerStoreManagerTx =
		await nodeManagerContract.functions.registerStoreManager(
			storeManagerAddress
		);
	await registerStoreManagerTx.wait();

	const registerReportManagerTx =
		await nodeManagerContract.functions.registerReportManager(
			reportManagerAddress
		);
	await registerReportManagerTx.wait();

	// adjust initial values within AlphaNet TokenManager
	const INITIAL_MATIC_PER_BYTE = ethers.utils.parseEther('0.0000001');
	const TOTAL_BYTES_STORED = 10;
	const bytesMaticTx = await tokenManagerContract.functions.setMaticPerByte(
		INITIAL_MATIC_PER_BYTE
	);
	await bytesMaticTx.wait();
	const bytesStoredTx =
		await tokenManagerContract.functions.setTotalBytesStored(
			TOTAL_BYTES_STORED
		);
	await bytesStoredTx.wait();
	const WHITELISTED_ADDRESSES = [
		storeManagerAddress,
		reportManagerAddress,
		nodeManagerAddress,
		queryManagerAddress,
	];
	const whitelistTx = await tokenManagerContract.functions.massWhitelistUpdate(
		WHITELISTED_ADDRESSES,
		1
	);
	await whitelistTx.wait();
	console.log(`tokenManagerAddress updated to whitelist addresses`, {
		tx: whitelistTx.id,
	});

	const deployedContractAddresses = {
		tokenManagerAddress,
		nodeManagerAddress,
		storeManagerAddress,
		queryManagerAddress,
		reportManagerAddress,
	};
	// write the file to json
	await writeJSONToFileOutside(deployedContractAddresses, 'address.json');
	// --------------------------- write addresses to file --------------------------- //
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
