import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		alias: {
			$components: 'src/lib/components',
			$state: 'src/lib/state',
			$utils: 'src/lib/utils',
			$server: 'src/lib/server'
		},
		serviceWorker: {
			register: false
		}
	}
};

export default config;
