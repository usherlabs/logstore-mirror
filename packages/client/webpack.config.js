/* eslint-disable prefer-template */

process.env.NODE_ENV = process.env.NODE_ENV || 'development'; // set a default NODE_ENV

const path = require('path');

const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const LodashWebpackPlugin = require('lodash-webpack-plugin');
const { merge } = require('webpack-merge');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const { GitRevisionPlugin } = require('git-revision-webpack-plugin');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const { rimrafSync } = require('rimraf');

const pkg = require('./package.json');

const gitRevisionPlugin = new GitRevisionPlugin();

module.exports = (_, argv) => {
	const isProduction =
		argv.mode === 'production' || process.env.NODE_ENV === 'production';
	const analyze = !!process.env.BUNDLE_ANALYSIS;

	console.log(
		`Force remove the 'node_modules' installed inside of the streamr-network submodule...`
	);
	rimrafSync('../../modules/streamr-network/node_modules');
	rimrafSync('../../modules/streamr-network/packages/client/node_modules');
	console.log(
		`Submodule '../../modules/streamr-network/node_modules' deleted!`
	);
	console.log(
		`Submodule '../../modules/streamr-network/packages/client/node_modules' deleted!`
	);
	console.log();

	const commonConfig = {
		// cache: {
		// 	type: 'filesystem',
		// },
		name: 'logstore-client',
		mode: isProduction ? 'production' : 'development',
		entry: {
			'logstore-client': path.join(__dirname, 'src', 'exports-browser.ts'),
		},
		devtool: 'source-map',
		output: {
			umdNamedDefine: true,
		},
		optimization: {
			minimize: false,
			moduleIds: 'named',
		},
		module: {
			rules: [
				{
					test: /(\.jsx|\.js|\.ts)$/,
					exclude: /(node_modules|bower_components)/,
					use: {
						loader: 'babel-loader',
						options: {
							configFile: path.resolve(__dirname, '.babel.browser.config.js'),
							babelrc: false,
							cacheDirectory: true,
						},
					},
				},
			],
		},
		resolve: {
			modules: [
				'node_modules',
				...require.resolve.paths(''),
				path.resolve('./vendor'),
			],
			extensions: ['.json', '.js', '.ts'],
		},
		plugins: [
			gitRevisionPlugin,
			new webpack.EnvironmentPlugin({
				NODE_ENV: process.env.NODE_ENV,
				version: pkg.version,
				GIT_VERSION: gitRevisionPlugin.version(),
				GIT_COMMITHASH: gitRevisionPlugin.commithash(),
				GIT_BRANCH: gitRevisionPlugin.branch(),
			}),
			new Dotenv(),
		],
		performance: {
			hints: 'warning',
		},
	};

	const clientConfig = merge({}, commonConfig, {
		target: 'web',
		output: {
			filename: '[name].web.js',
			libraryTarget: 'umd',
			library: 'LogStoreClient',
			globalObject: 'globalThis',
		},
		resolve: {
			alias: {
				'@logsn/streamr-client': require.resolve(
					'../../modules/streamr-network/packages/client/src/exports-browser.ts'
				),
				stream: 'readable-stream',
				util: 'util',
				http: require.resolve(
					'../../modules/streamr-network/packages/client/src/shim/http-https.ts'
				),
				'@ethersproject/wordlists': require.resolve(
					'@ethersproject/wordlists/lib/browser-wordlists.js'
				),
				https: require.resolve(
					'../../modules/streamr-network/packages/client/src/shim/http-https.ts'
				),
				crypto: require.resolve('crypto-browserify'),
				buffer: require.resolve('buffer/'),
				'node-fetch': require.resolve(
					'../../modules/streamr-network/packages/client/src/shim/node-fetch.ts'
				),
				'@streamr/protocol': path.resolve(
					'../../modules/streamr-network/packages/protocol/src/exports.ts'
				),
				'@streamr/network-node': path.resolve(
					'../../modules/streamr-network/packages/network/src/exports-browser.ts'
				),
				[path.join(
					__dirname,
					'../../modules/streamr-network/packages/network/src/connection/webrtc/NodeWebRtcConnection.ts$'
				)]: path.resolve(
					'../../modules/streamr-network/packages/network/src/connection/webrtc/BrowserWebRtcConnection.ts'
				),
				[path.join(
					__dirname,
					'../../modules/streamr-network/packages/network/src/connection/ws/NodeClientWsEndpoint.ts$'
				)]: path.resolve(
					'../../modules/streamr-network/packages/network/src/connection/ws/BrowserClientWsEndpoint.ts'
				),
				[path.join(
					__dirname,
					'../../modules/streamr-network/packages/network/src/connection/ws/NodeClientWsConnection.ts$'
				)]: path.resolve(
					'../../modules/streamr-network/packages/network/src/connection/ws/BrowserClientWsConnection.ts'
				),
				// swap out ServerPersistence for BrowserPersistence
				[path.resolve(
					'../../modules/streamr-network/packages/client/src/utils/persistence/ServerPersistence.ts'
				)]: path.resolve(
					'../../modules/streamr-network/packages/client/src/utils/persistence/BrowserPersistence.ts'
				),
			},
			fallback: {
				module: false,
				fs: false,
				net: false,
				http: false,
				https: false,
				express: false,
				ws: false,
			},
		},
		plugins: [
			new NodePolyfillPlugin({
				excludeAliases: ['console'],
			}),
			new LodashWebpackPlugin(),
			...(analyze
				? [
						new BundleAnalyzerPlugin({
							analyzerMode: 'static',
							openAnalyzer: false,
							generateStatsFile: true,
						}),
				  ]
				: []),
		],
	});

	let clientMinifiedConfig;
	if (isProduction) {
		clientMinifiedConfig = merge({}, clientConfig, {
			cache: false,
			optimization: {
				minimize: true,
				minimizer: [
					new TerserPlugin({
						parallel: true,
						terserOptions: {
							ecma: 2018,
							output: {
								comments: false,
							},
						},
					}),
				],
			},
			output: {
				filename: '[name].web.min.js',
			},
		});
	}

	return [clientConfig, clientMinifiedConfig].filter(Boolean);
};
