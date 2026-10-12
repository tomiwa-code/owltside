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
	}
};
