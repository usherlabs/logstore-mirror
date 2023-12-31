// checks that require works
const LogStoreClient = require('@logsn/client');

console.info("const LogStoreClient = require('@logsn/client'):", {
	LogStoreClient,
});

const auth = LogStoreClient.generateEthereumAccount();
const client = new LogStoreClient({
	auth,
});

client.connect().then(async () => {
	console.info('success');
	await client.destroy();
	process.exit(0);
});
