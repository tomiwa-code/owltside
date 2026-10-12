import { defineConfig, devices } from '@playwright/test';

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
		baseURL: 'http://localhost:5173'
	}
});
