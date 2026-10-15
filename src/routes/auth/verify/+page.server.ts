import { createSupabase } from '$lib/server/supabase';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({
	email: url.searchParams.get('email') ?? '',
	name: url.searchParams.get('name'),
	isNew: url.searchParams.get('new') === '1'
});

export const actions: Actions = {
	verify: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const code = String(form.get('code') ?? '').trim();

		if (!/^\d{6}$/.test(code)) return fail(400, { error: 'Enter the 6-digit code', email });

		const db = createSupabase(cookies);
		if (db) {
			const { error } = await db.auth.verifyOtp({ email, token: code, type: 'email' });
			if (error) return fail(400, { error: error.message, email });
		} else {
			// Demo mode: any 6-digit code is accepted (hint shown in UI).
			cookies.set('owltside_demo_session', '1', {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 60 * 60 * 24 * 30
			});
		}
		redirect(303, '/home');
	},

	resend: async ({ request, cookies, url }) => {
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
		return { resent: true };
	}
};
