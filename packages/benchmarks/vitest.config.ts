import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// load env variables
		setupFiles: 'dotenv/config',
		include: ['**/?(*.){test,spec,benchmark}.?(c|m)[jt]s?(x)'],
		includeSource: ['src/**/*.{js,ts}'],
		testTimeout: 220_000,
		dangerouslyIgnoreUnhandledErrors: true,
	},
});
