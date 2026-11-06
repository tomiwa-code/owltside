import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	authenticateWithOtp,
	isSecureRequest,
	requestAdminOtp,
	safeAdminNext,
	startAdminGoogleSignIn,
	writeSessionCookie
} from '$admin/server/auth';
import type { AdminSession } from '$admin/types';

export const load: PageServerLoad = ({ locals, url }) => {
	const next = safeAdminNext(url.searchParams.get('next'));
	if (locals.admin) redirect(303, next);
	const urlError = url.searchParams.get('error')?.trim() || null;
	return {
		next,
		urlError,
		year: new Date().getFullYear()
	};
};

function buildSession(
	session: Omit<AdminSession, 'issuedAt' | 'expiresAt'>,
	expiresAt: Date
): AdminSession {
	return { ...session, issuedAt: new Date().toISOString(), expiresAt: expiresAt.toISOString() };
}

export const actions: Actions = {
	sendCode: async ({ request, getClientAddress, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const resend = form.get('resend') === '1';
		const next = safeAdminNext(String(form.get('next') ?? '') || url.searchParams.get('next'));

		if (!email) return fail(400, { error: 'Enter your Owltside email address.', email });

		const result = await requestAdminOtp({
			email,
			ip: getClientAddress(),
			redirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent(next)}`
		});

		if (!result.ok) {
			return fail(result.status ?? 403, {
				error: result.error ?? 'Sign in failed.',
				email
			});
		}

		return { codeSent: true, resent: resend, email: result.email ?? email };
	},

	verifyCode: async ({ request, cookies, getClientAddress, url }) => {
		const https = isSecureRequest(request, url);
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const code = String(form.get('code') ?? '').trim();
		const remember = form.get('remember') === 'on';
		const next = safeAdminNext(String(form.get('next') ?? '') || url.searchParams.get('next'));

		if (!email) return fail(400, { error: 'Enter your Owltside email address.', email, codeSent: true });
		if (!code) return fail(400, { error: 'Enter the 6-digit verification code.', email, codeSent: true });

		const result = await authenticateWithOtp({
			email,
			code,
			remember,
			ip: getClientAddress()
		});

		if (!result.ok || !result.session || !result.expiresAt) {
			return fail(result.status ?? 401, {
				error: result.error ?? 'Sign in failed.',
				email,
				codeSent: result.status === 401 || result.status === 400
			});
		}

		writeSessionCookie(cookies, buildSession(result.session, result.expiresAt), { https });
		redirect(303, next);
	},

	google: async ({ request, cookies, url }) => {
		const https = isSecureRequest(request, url);
		const form = await request.formData().catch(() => null);
		const next = safeAdminNext(String(form?.get('next') ?? '') || url.searchParams.get('next'));
		const result = await startAdminGoogleSignIn({ cookies, url, next, https });
		if (!result.ok) {
			return fail(result.status, { error: result.error });
		}
		redirect(303, result.url);
	}
};
