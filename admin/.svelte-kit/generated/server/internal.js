
import root from '../root.js';
import { set_building, set_prerendering } from '$app/env/internal';
import { set_assets } from '$app/paths/internal/server';
import { set_manifest, set_read_implementation } from '__sveltekit/server';
import { set_private_env, set_public_env } from '../../../node_modules/@sveltejs/kit/src/runtime/shared-server.js';
import error from '../shared/error-template.js';

export const options = {
	app_template_contains_nonce: false,
	async: false,
	csp: {"mode":"auto","directives":{"upgrade-insecure-requests":false,"block-all-mixed-content":false},"reportOnly":{"upgrade-insecure-requests":false,"block-all-mixed-content":false}},
	csrf_check_origin: true,
	csrf_trusted_origins: [],
	embedded: false,
	env_public_prefix: 'PUBLIC_',
	env_private_prefix: '',
	hash_routing: false,
	hooks: null, // added lazily, via `get_hooks`
	preload_strategy: "modulepreload",
	root,
	service_worker: false,
	service_worker_options: undefined,
	server_error_boundaries: false,
	templates: {
		app: ({ head, body, assets, nonce, env }) => "<!doctype html>\r\n<html lang=\"en\" class=\"dark\">\r\n\t<head>\r\n\t\t<meta charset=\"utf-8\" />\r\n\t\t<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, viewport-fit=cover\" />\r\n\t\t<meta name=\"theme-color\" content=\"#101014\" />\r\n\t\t<meta name=\"robots\" content=\"noindex, nofollow, noarchive\" />\r\n\t\t<meta name=\"referrer\" content=\"strict-origin-when-cross-origin\" />\r\n\t\t<meta\r\n\t\t\tname=\"description\"\r\n\t\t\tcontent=\"Owltside Admin — restricted internal control plane for events, ticketing, settlements and trust & safety.\"\r\n\t\t/>\r\n\t\t<link rel=\"icon\" type=\"image/png\" href=\"" + assets + "/icons/icon-192.png\" />\r\n\t\t<link rel=\"apple-touch-icon\" href=\"" + assets + "/icons/icon-192.png\" />\r\n\t\t" + head + "\r\n\t</head>\r\n\t<body data-sveltekit-preload-data=\"hover\" class=\"bg-ink\">\r\n\t\t<div style=\"display: contents\">" + body + "</div>\r\n\t</body>\r\n</html>\r\n",
		error
	},
	version_hash: "1vi3q1q"
};

export async function get_hooks() {
	let handle;
	let handleFetch;
	let handleError;
	let handleValidationError;
	let init;
	({ handle, handleFetch, handleError, handleValidationError, init } = await import("../../../src/hooks.server.ts"));

	let reroute;
	let transport;
	

	return {
		handle,
		handleFetch,
		handleError,
		handleValidationError,
		init,
		reroute,
		transport
	};
}

export { set_assets, set_building, set_manifest, set_prerendering, set_private_env, set_public_env, set_read_implementation };
