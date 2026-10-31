import { safeAuthNext, startGoogleSignIn } from '$lib/server/oauth';
import { createSupabase } from '$lib/server/supabase';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	sendCode: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const next = safeAuthNext(String(form.get('next') ?? '') || url.searchParams.get('next'));
		if (!/^\S+@\S+\.\S+$/.test(email)) return fail(400, { error: 'Enter a valid email address', email });

		const db = createSupabase(cookies);
		if (db) {
			const { error } = await db.auth.signInWithOtp({
				email,
				options: { emailRedirectTo: `${url.origin}/auth/verify?next=${encodeURIComponent(next)}` }
			});
			if (error) {
				const friendly = /banned/i.test(error.message ?? '')
					? 'Your account has been disabled by an administrator. Contact support if you believe this is a mistake.'
					: error.message;
				return fail(400, { error: friendly, email });
			}
		}
		redirect(303, `/auth/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
	},
	google: async ({ request, cookies, url }) => {
		const form = await request.formData().catch(() => null);
		const next = safeAuthNext(String(form?.get('next') ?? '') || url.searchParams.get('next'));
		return startGoogleSignIn(cookies, url, undefined, next);
	}
};
