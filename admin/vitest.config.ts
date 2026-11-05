import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Compile component SSR regression tests without the full SvelteKit plugin.
export default defineConfig({
	plugins: [svelte()],
	resolve: {
		alias: {
			'$app/navigation': fileURLToPath(new URL('./tests/mocks/app-navigation.ts', import.meta.url)),
			$admin: fileURLToPath(new URL('./src/lib', import.meta.url)),
			$components: fileURLToPath(new URL('./src/lib/components', import.meta.url))
		}
	},
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
		restoreMocks: true,
		reporters: ['default']
	}
});
