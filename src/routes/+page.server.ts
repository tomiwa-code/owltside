import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Supabase may fall back to Site URL when a redirect URL is not allowlisted.
// Recover same-origin PKCE returns here rather than rendering a guest splash.
export const load: PageServerLoad = ({ url }) => {
	if (['code', 'token_hash', 'error', 'error_description'].some((key) => url.searchParams.has(key))) {
		const params = new URLSearchParams();
		for (const key of ['code', 'token_hash', 'type', 'error', 'error_description']) {
			const value = url.searchParams.get(key);
			if (value) params.set(key, value);
		}
		redirect(303, `/auth/callback?${params}`);
	}
};
