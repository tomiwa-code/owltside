import { safeAuthNext, startGoogleSignIn } from '$lib/server/oauth';
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
		const next = safeAuthNext(String(form.get('next') ?? '') || url.searchParams.get('next'));

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
					emailRedirectTo: `${url.origin}/auth/verify?next=${encodeURIComponent(next)}`
				}
			});
			if (error) return fail(400, { error: error.message, email, name, username });
		}
		redirect(303, `/auth/verify?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&username=${encodeURIComponent(username)}&new=1&next=${encodeURIComponent(next)}`);
	},

	google: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim().replace(/^@/, '').toLowerCase();
		if (username && !validUsername(username)) return fail(400, { error: 'Username must be 3–24 letters, numbers, or underscores' });
		const next = safeAuthNext(String(form.get('next') ?? '') || url.searchParams.get('next'));

		return startGoogleSignIn(cookies, url, username || undefined, next);
	}
};
