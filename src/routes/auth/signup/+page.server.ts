import { createSupabase } from '$lib/server/supabase';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	create: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Tell us your name', email });
		if (!/^\S+@\S+\.\S+$/.test(email)) return fail(400, { error: 'Enter a valid email address', email, name });

		const db = createSupabase(cookies);
		if (db) {
			const { error } = await db.auth.signInWithOtp({
				email,
				options: {
					data: { full_name: name },
					emailRedirectTo: `${url.origin}/auth/verify`
				}
			});
			if (error) return fail(400, { error: error.message, email, name });
		}
		redirect(303, `/auth/verify?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&new=1`);
	}
};
