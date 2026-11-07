import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Compile component SSR regression tests without the full SvelteKit plugin.
export default defineConfig({
	plugins: [svelte()],
	resolve: {
		alias: {
			'$app/forms': fileURLToPath(new URL('./node_modules/@sveltejs/kit/src/runtime/app/forms.js', import.meta.url)),
			'$app/state': fileURLToPath(new URL('./tests/mocks/app-state.ts', import.meta.url)),
			'$app/navigation': fileURLToPath(new URL('./tests/mocks/app-navigation.ts', import.meta.url)),
			$admin: fileURLToPath(new URL('./src/lib', import.meta.url)),
			$components: fileURLToPath(new URL('./src/lib/components', import.meta.url))
		}
	},
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
		server: { deps: { inline: [/@sveltejs\/kit/] } },
		restoreMocks: true,
		reporters: ['default']
	}
});
