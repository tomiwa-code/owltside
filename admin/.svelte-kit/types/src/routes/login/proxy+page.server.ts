// @ts-nocheck
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	adminIdentity,
	authenticate,
	authenticateWithKey,
	isDemoMode,
	writeSessionCookie
} from '$admin/server/auth';
import type { AdminSession } from '$admin/types';

function safeNext(raw: string | null): string {
	if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
	if (raw.startsWith('/login')) return '/dashboard';
	return raw;
}

export const load = ({ locals, url }: Parameters<PageServerLoad>[0]) => {
	if (locals.admin) redirect(303, safeNext(url.searchParams.get('next')));
	const identity = adminIdentity();
	return {
		demo: isDemoMode(),
		defaultEmail: identity.email,
		demoPassphrase: isDemoMode() ? 'owltside-admin-2026' : '',
		next: safeNext(url.searchParams.get('next')),
		year: new Date().getFullYear()
	};
};

function buildSession(
	session: Omit<AdminSession, 'issuedAt' | 'expiresAt'>,
	expiresAt: Date
): AdminSession {
	return { ...session, issuedAt: new Date().toISOString(), expiresAt: expiresAt.toISOString() };
}

export const actions = {
	credentials: async ({ request, cookies, getClientAddress, url }: import('./$types').RequestEvent) => {
		const https = request.headers.get('x-forwarded-proto') === 'https' || url.protocol === 'https:';
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const remember = form.get('remember') === 'on';

		if (!email) return fail(400, { error: 'Enter your work email address.', email });
		if (!password) return fail(400, { error: 'Enter your security passphrase.', email });

		const result = authenticate({ email, password, remember, ip: getClientAddress() });
		if (!result.ok || !result.session || !result.expiresAt) {
			return fail(result.status ?? 401, { error: result.error ?? 'Sign in failed.', email });
		}

		writeSessionCookie(cookies, buildSession(result.session, result.expiresAt), { https });
		redirect(303, safeNext(url.searchParams.get('next')));
	},

	hardware: async ({ request, cookies, getClientAddress, url }: import('./$types').RequestEvent) => {
		const https = request.headers.get('x-forwarded-proto') === 'https' || url.protocol === 'https:';
		if (!isDemoMode()) {
			return fail(400, {
				error: 'Hardware-key sign-in requires a registered WebAuthn credential for this deployment.'
			});
		}
		const { session, expiresAt } = authenticateWithKey(true, getClientAddress());
		writeSessionCookie(cookies, buildSession(session, expiresAt), { https });
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
;null as any as Actions;