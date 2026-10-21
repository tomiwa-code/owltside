import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests run against the pure store / auth / export modules, so they only
 * need the `$admin` alias — no SvelteKit plugin (which would fight `vite.config.ts`).
 */
export default defineConfig({
	resolve: {
		alias: {
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
