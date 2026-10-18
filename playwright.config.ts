import { defineConfig, devices } from '@playwright/test';

const chromiumFlags = [
	'--use-fake-ui-for-media-stream',
	'--use-fake-device-for-media-stream'
];

export default defineConfig({
	webServer: {
		command: 'npm run dev',
		port: 5173,
		reuseExistingServer: true,
		timeout: 60_000
	},
	testDir: 'tests/e2e',
	use: {
		...devices['Pixel 7'],
		baseURL: 'http://localhost:5173',
		// The gate scanner opens the phone camera, so the browser may ask for it
		// and gets a fake camera instead of a real one.
		permissions: ['camera'],
		launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {
			executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
			args: [
				'--no-sandbox',
				'--disable-dev-shm-usage',
				'--disable-gpu',
				'--no-zygote',
				...chromiumFlags
			]
		} : { args: chromiumFlags }
	}
});
