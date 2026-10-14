import { createSupabase } from '$lib/server/supabase';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

const validUsername = (value: string) => /^[a-z0-9_]{3,24}$/.test(value);

export const actions: Actions = {
	create: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const name = String(form.get('name') ?? '').trim();
		const username = String(form.get('username') ?? '').trim().replace(/^@/, '').toLowerCase();
		const termsAccepted = form.get('terms') === 'accepted';
		const ageConfirmed = form.get('ageConfirmed') === 'confirmed';

		if (!name) return fail(400, { error: 'Tell us your name', email, name, username });
		if (!validUsername(username)) return fail(400, { error: 'Username must be 3–24 letters, numbers, or underscores', email, name, username });
		if (!/^\S+@\S+\.\S+$/.test(email)) return fail(400, { error: 'Enter a valid email address', email, name, username });
		if (!termsAccepted) return fail(400, { error: 'Please agree to the Terms and Privacy Policy', email, name, username });
		if (!ageConfirmed) return fail(400, { error: 'You must confirm that you are 18 or older', email, name, username });

		const db = createSupabase(cookies);
		if (db) {
			const { error } = await db.auth.signInWithOtp({
				email,
				options: {
					data: { full_name: name, handle: username },
					emailRedirectTo: `${url.origin}/auth/verify`
				}
			});
			if (error) return fail(400, { error: error.message, email, name, username });
		}
		redirect(303, `/auth/verify?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&username=${encodeURIComponent(username)}&new=1`);
	},

	google: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const termsAccepted = form.get('terms') === 'accepted';
		const ageConfirmed = form.get('ageConfirmed') === 'confirmed';
		const username = String(form.get('username') ?? '').trim().replace(/^@/, '').toLowerCase();
		if (!termsAccepted) return fail(400, { error: 'Please agree to the Terms and Privacy Policy' });
		if (!ageConfirmed) return fail(400, { error: 'You must confirm that you are 18 or older' });
		if (username && !validUsername(username)) return fail(400, { error: 'Username must be 3–24 letters, numbers, or underscores' });

		const db = createSupabase(cookies);
		if (!db) return fail(503, { error: 'Google sign-in is unavailable until the Google provider is configured.' });
		const next = `/auth/callback?next=${encodeURIComponent('/home')}${username ? `&handle=${encodeURIComponent(username)}` : ''}`;
		const { data, error } = await db.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${url.origin}${next}` }
		});
		if (error) return fail(400, { error: error.message });
		if (!data.url) return fail(502, { error: 'Google sign-in did not return an authorization URL.' });
		redirect(303, data.url);
	}
};
