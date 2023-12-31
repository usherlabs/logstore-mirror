/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
// CJS entrypoint.
const LogStoreClientExports = require('./exports');

Object.assign(LogStoreClientExports.LogStoreClient, LogStoreClientExports);

// required to get require('@logsn/streamr-client') instead of require('@logsn/streamr-client').default
module.exports = LogStoreClientExports.LogStoreClient;
