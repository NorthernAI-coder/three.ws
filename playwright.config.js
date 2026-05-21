import { defineConfig } from '@playwright/test';

// Playwright config for the /club smoke. Drives a real Chromium against the
// Vite dev server. Kept separate from Vitest (which only globs *.test.js) by
// using the `.spec.js` suffix in `tests/e2e/`.
export default defineConfig({
	testDir: 'tests/e2e',
	timeout: 60_000,
	retries: 1,
	fullyParallel: false,
	use: {
		baseURL: 'http://localhost:3000',
		headless: true,
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		trace: 'retain-on-failure',
	},
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:3000',
		timeout: 60_000,
		reuseExistingServer: !process.env.CI,
	},
});
