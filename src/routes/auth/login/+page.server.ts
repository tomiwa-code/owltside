import { createSupabase } from '$lib/server/supabase';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	sendCode: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		if (!/^\S+@\S+\.\S+$/.test(email)) return fail(400, { error: 'Enter a valid email address', email });

		const db = createSupabase(cookies);
		if (db) {
			const { error } = await db.auth.signInWithOtp({
				email,
				options: { emailRedirectTo: `${url.origin}/auth/verify` }
			});
			if (error) return fail(400, { error: error.message, email });
		}
		redirect(303, `/auth/verify?email=${encodeURIComponent(email)}`);
	},
	google: async ({ cookies, url }) => {
		const db = createSupabase(cookies);
		if (!db) return fail(503, { error: 'Google sign-in is unavailable until the Google provider is configured.' });
		const { data, error } = await db.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent('/home')}` }
		});
		if (error) return fail(400, { error: error.message });
		if (!data.url) return fail(502, { error: 'Google sign-in did not return an authorization URL.' });
		redirect(303, data.url);
	}
};
