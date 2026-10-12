import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const p = (s: string) => fileURLToPath(new URL(s, import.meta.url));

export default defineConfig({
	plugins: [svelte()],
	resolve: {
		conditions: ['browser'],
		alias: {
			$lib: p('./src/lib'),
			$components: p('./src/lib/components'),
			$state: p('./src/lib/state'),
			$utils: p('./src/lib/utils'),
			$server: p('./src/lib/server'),
			'$app/environment': p('./tests/mocks/app-environment.ts'),
			'$app/navigation': p('./tests/mocks/app-navigation.ts'),
			'$app/paths': p('./tests/mocks/app-paths.ts')
		}
	},
	test: {
		environment: 'jsdom',
		globals: true,
		include: ['src/**/*.{test,spec}.{ts,js}', 'tests/unit/**/*.{test,spec}.{ts,js}'],
		setupFiles: ['./tests/setup.ts'],
		css: false
	}
});
