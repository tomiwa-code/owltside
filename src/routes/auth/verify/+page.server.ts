import { safeAuthNext } from '$lib/server/oauth';
import { createSupabase, supabaseConfigured } from '$lib/server/supabase';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, cookies }) => {
	const db = createSupabase(cookies);
	const pkceCode = url.searchParams.get('code');
	const tokenHash = url.searchParams.get('token_hash');
	const otpType = url.searchParams.get('type') as 'email' | 'signup' | 'magiclink' | null;
	const next = safeAuthNext(url.searchParams.get('next'));

	if (db && pkceCode) {
		const { error } = await db.auth.exchangeCodeForSession(pkceCode);
		if (!error) redirect(303, next);
	} else if (db && tokenHash) {
		const { error } = await db.auth.verifyOtp({
			token_hash: tokenHash,
			type: otpType || 'email'
		});
		if (!error) redirect(303, next);
	}

	return {
		email: url.searchParams.get('email') ?? '',
		name: url.searchParams.get('name'),
		username: url.searchParams.get('username'),
		isNew: url.searchParams.get('new') === '1',
		next,
		demoMode: !supabaseConfigured()
	};
};

export const actions: Actions = {
	verify: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') || url.searchParams.get('email') || '').trim().toLowerCase();
		const code = String(form.get('code') ?? '').trim();
		const next = safeAuthNext(String(form.get('next') ?? '') || url.searchParams.get('next'));

		if (!/^\d{6}$/.test(code)) return fail(400, { error: 'Enter the 6-digit code', email });

		const db = createSupabase(cookies);
		if (db) {
			let { error } = await db.auth.verifyOtp({ email, token: code, type: 'email' });
			if (error) {
				const signupRetry = await db.auth.verifyOtp({ email, token: code, type: 'signup' });
				if (!signupRetry.error) {
					error = null;
				} else {
					const magicRetry = await db.auth.verifyOtp({ email, token: code, type: 'magiclink' });
					if (!magicRetry.error) error = null;
				}
			}
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
		redirect(303, next);
	},

	resend: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') || url.searchParams.get('email') || '').trim().toLowerCase();
		const name = String(form.get('name') || url.searchParams.get('name') || '').trim();
		const username = String(form.get('username') || url.searchParams.get('username') || '').trim().replace(/^@/, '').toLowerCase();
		const next = safeAuthNext(String(form.get('next') ?? '') || url.searchParams.get('next'));
		if (!/^\S+@\S+\.\S+$/.test(email)) return fail(400, { error: 'Enter a valid email address', email });

		const db = createSupabase(cookies);
		if (db) {
			const metadata: Record<string, string> = {};
			if (name) metadata.full_name = name;
			if (username) metadata.handle = username;
			const { error } = await db.auth.signInWithOtp({
				email,
				options: {
					shouldCreateUser: true,
					...(Object.keys(metadata).length ? { data: metadata } : {}),
					emailRedirectTo: `${url.origin}/auth/verify?next=${encodeURIComponent(next)}`
				}
			});
			if (error) return fail(400, { error: error.message, email });
		}
		return { resent: true, email };
	}
};
