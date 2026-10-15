import { fail, redirect, type Cookies } from '@sveltejs/kit';
import { createSupabase } from './supabase';

const CONTEXT_COOKIE = 'owltside_oauth_context';
const MAX_AGE = 60 * 10;

export function safeAuthNext(value: string | null | undefined): string {
	if (!value || !value.startsWith('/') || /[\\\u0000-\u0020]/.test(value)) return '/home';
	try {
		const base = new URL('https://owltside.invalid');
		const next = new URL(value, base);
		if (next.origin !== base.origin || next.pathname.startsWith('/auth/')) return '/home';
		return `${next.pathname}${next.search}${next.hash}`;
	} catch { return '/home'; }
}

export function readOAuthContext(cookies: Cookies): { next: string; handle?: string } {
	const raw = cookies.get(CONTEXT_COOKIE);
	if (raw) cookies.delete(CONTEXT_COOKIE, { path: '/' });
	try {
		const context = JSON.parse(raw ?? '{}');
		if (!Number.isFinite(context.createdAt) || Date.now() - context.createdAt > MAX_AGE * 1000 || context.createdAt > Date.now()) return { next: '/home' };
		return { next: safeAuthNext(context.next), handle: typeof context.handle === 'string' && /^[a-z0-9_]{3,24}$/.test(context.handle) ? context.handle : undefined };
	} catch { return { next: '/home' }; }
}

/** Keep the provider callback fixed so an exact Supabase redirect allowlist entry works. */
export async function startGoogleSignIn(cookies: Cookies, url: URL, handle?: string) {
	const db = createSupabase(cookies, { freshAuth: true });
	if (!db) return fail(503, { error: 'Google sign-in is not configured. Please contact support or use email sign-in.' });
	let authorizationUrl: string | undefined;
	try {
		const { data, error } = await db.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${url.origin}/auth/callback`, skipBrowserRedirect: true }
		});
		if (error) return fail(400, { error: 'Google sign-in could not be started. Please try again or use email sign-in.' });
		authorizationUrl = data.url;
	} catch {
		return fail(503, { error: 'Google sign-in is temporarily unavailable. Please try again.' });
	}
	if (!authorizationUrl) return fail(502, { error: 'Google sign-in did not return an authorization URL. Please try again.' });
	cookies.set(CONTEXT_COOKIE, JSON.stringify({ next: '/home', handle, createdAt: Date.now() }), {
		path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', maxAge: MAX_AGE
	});
	redirect(303, authorizationUrl);
}

export function isAuthReturn(url: URL): boolean {
	return url.pathname === '/auth/callback' ||
		((url.pathname === '/' || url.pathname === '/auth/verify') &&
			['code', 'token_hash', 'error', 'error_description'].some((key) => url.searchParams.has(key)));
}

export function authFailure(message: string): never {
	redirect(303, `/auth/login?error=${encodeURIComponent(message)}`);
}
