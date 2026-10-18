// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
vi.mock('$env/dynamic/public', () => ({ env: { PUBLIC_SUPABASE_URL: 'https://test-project.supabase.co', PUBLIC_SUPABASE_ANON_KEY: 'test-public-key' } }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));
import { startGoogleSignIn, safeAuthNext, isAuthReturn, readOAuthContext } from '$lib/server/oauth';
import { supabaseFetch } from '$lib/server/supabase';
import { GET } from '../../src/routes/auth/callback/+server';
import { handle } from '../../src/hooks.server';
import { load as splash } from '../../src/routes/+page.server';

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'owl@example.com', aud: 'authenticated', app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Test Owl' }, created_at: '2026-01-01T00:00:00Z' };
function cookieJar() {
	const jar = new Map<string, string>();
	return {
		get: (key: string) => jar.get(key),
		getAll: () => [...jar].map(([name, value]) => ({ name, value })),
		set: (key: string, value: string, options: { maxAge?: number }) => { if (options?.maxAge === 0) jar.delete(key); else jar.set(key, value); },
		delete: (key: string) => { jar.delete(key); },
		serialize: () => ''
	} as Cookies;
}
async function redirected(operation: unknown): Promise<{ status: number; location: string }> {
	try { await operation; } catch (error) { return error as { status: number; location: string }; }
	throw new Error('Expected redirect');
}
const jwt = (expires = Math.floor(Date.now() / 1000) + 3600) => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires, aud: 'authenticated' })).toString('base64url')}.fake-signature`;
let tokenRequests: Record<string, string>[];
let failExchange = false;
beforeEach(() => {
	tokenRequests = []; failExchange = false;
	vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		if (url.includes('/auth/v1/token')) {
			tokenRequests.push(JSON.parse(String(init?.body)));
			if (failExchange) return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'expired' }), { status: 400, headers: { 'content-type': 'application/json' } });
			return Response.json({ access_token: jwt(), refresh_token: 'fake-refresh', expires_in: 3600, token_type: 'bearer', user });
		}
		if (url.endsWith('/auth/v1/user')) return Response.json(user);
		if (url.includes('/rest/v1/profiles')) return Response.json([{ id: user.id, name: 'Test Owl', handle: 'testowl', avatar_url: null }]);
		throw new Error('Unexpected request in isolated auth test');
	}));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Google server-side PKCE flow using the actual Supabase SSR client', () => {
	it('sets a verifier, returns to the exact same-origin callback, exchanges it, and authenticates the next request', async () => {
		const cookies = cookieJar();
		const start = await redirected(startGoogleSignIn(cookies, new URL('https://owltside.example/auth/login')));
		const authorization = new URL(start.location);
		expect(authorization.searchParams.get('redirect_to')).toBe('https://owltside.example/auth/callback');
		expect(cookies.getAll().some((cookie) => cookie.name.endsWith('-code-verifier'))).toBe(true);
		const finish = await redirected(GET({ cookies, url: new URL('https://owltside.example/auth/callback?code=fake-code') } as never));
		expect(finish).toMatchObject({ status: 303, location: '/home' });
		expect(tokenRequests).toHaveLength(1);
		expect(tokenRequests[0].auth_code).toBe('fake-code');
		const challenge = createHash('sha256').update(tokenRequests[0].code_verifier).digest('base64url');
		expect(challenge).toBe(authorization.searchParams.get('code_challenge'));
		expect(cookies.getAll().some((cookie) => cookie.name === 'sb-test-project-auth-token')).toBe(true);
		const event = { cookies, url: new URL('https://owltside.example/home'), locals: {} };
		await handle({ event, resolve: async () => new Response('ok') } as never);
		expect(event.locals).toMatchObject({ session: { userId: user.id, name: 'Test Owl' } });
	});
	it('does not let the hook validate an old session before the callback exchanges the verifier', async () => {
		const cookies = cookieJar();
		const staleSession = 'base64-' + Buffer.from(JSON.stringify({ access_token: jwt(1), refresh_token: 'revoked-old-refresh', expires_at: 1, token_type: 'bearer', user })).toString('base64url');
		cookies.set('sb-test-project-auth-token.0', staleSession.slice(0, 100), { path: '/' });
		cookies.set('sb-test-project-auth-token.1', staleSession.slice(100), { path: '/' });
		await redirected(startGoogleSignIn(cookies, new URL('https://owltside.example/auth/login')));
		const event = { cookies, url: new URL('https://owltside.example/auth/callback?code=fake-code'), locals: {} };
		const response = await handle({ event, resolve: async () => new Response('callback owns the exchange') } as never);
		expect(fetch).not.toHaveBeenCalled();
		expect(cookies.getAll().some((cookie) => cookie.name.endsWith('-code-verifier'))).toBe(true);
		expect(response.headers.get('cache-control')).toContain('no-store');
		expect(response.headers.get('referrer-policy')).toBe('no-referrer');
		const finish = await redirected(GET({ cookies, url: event.url } as never));
		expect(finish).toMatchObject({ status: 303, location: '/home' });
		expect(tokenRequests).toHaveLength(1);
		expect(tokenRequests[0].auth_code).toBe('fake-code');
		expect(cookies.get('sb-test-project-auth-token.0')).toBeUndefined();
		expect(cookies.get('sb-test-project-auth-token.1')).toBeUndefined();
		expect(cookies.get('sb-test-project-auth-token')).toBeTruthy();
	});
	it('preserves signup context without adding query parameters to the allowlisted callback', async () => {
		const cookies = cookieJar();
		const start = await redirected(startGoogleSignIn(cookies, new URL('https://owltside.example/auth/signup'), 'myhandle'));
		expect(new URL(start.location).searchParams.get('redirect_to')).toBe('https://owltside.example/auth/callback');
		expect(JSON.parse(cookies.get('owltside_oauth_context')!).handle).toBe('myhandle');
	});
	it('reports expired or missing verification instead of navigating home as a guest', async () => {
		const cookies = cookieJar();
		failExchange = true;
		const finish = await redirected(GET({ cookies, url: new URL('https://owltside.example/auth/callback?code=expired') } as never));
		expect(finish.location).toMatch(/^\/auth\/login\?error=/);
		expect(finish.location).not.toBe('/home');
	});
	it('reports missing callback codes explicitly', async () => {
		const result = await redirected(GET({ cookies: cookieJar(), url: new URL('https://owltside.example/auth/callback') } as never));
		expect(decodeURIComponent(result.location)).toContain('did not include a code');
	});
	it('recovers a callback that Supabase sent to the root Site URL', async () => {
		const result = await redirected(Promise.resolve().then(() => splash!({ url: new URL('https://owltside.example/?code=fake-code') } as never)));
		expect(result).toMatchObject({ status: 303, location: '/auth/callback?code=fake-code' });
	});
	it('discards stale or malformed signup context and consumes valid context once', () => {
		const cookies = cookieJar();
		for (const value of ['not json', JSON.stringify({ createdAt: Date.now() - 700_000, handle: 'oldname' })]) {
			cookies.set('owltside_oauth_context', value, { path: '/' });
			expect(readOAuthContext(cookies)).toEqual({ next: '/home' });
		}
		cookies.set('owltside_oauth_context', JSON.stringify({ createdAt: Date.now(), next: '//evil.example', handle: 'myhandle' }), { path: '/' });
		expect(readOAuthContext(cookies)).toEqual({ next: '/home', handle: 'myhandle' });
		expect(cookies.get('owltside_oauth_context')).toBeUndefined();
	});
	it('accepts only safe local post-login destinations', () => {
		for (const value of ['//evil.example', '/\\evil.example', '/auth/callback', 'https://evil.example', '/\nevil.example']) expect(safeAuthNext(value)).toBe('/home');
		expect(safeAuthNext('/tickets?tab=upcoming')).toBe('/tickets?tab=upcoming');
		expect(isAuthReturn(new URL('https://owltside.example/?code=fake-code'))).toBe(true);
		expect(isAuthReturn(new URL('https://owltside.example/home'))).toBe(false);
	});
	it('retries transient ERR_HTTP2_INVALID_SESSION fetch failures and succeeds', async () => {
		let attempts = 0;
		vi.stubGlobal('fetch', vi.fn(async () => {
			attempts++;
			if (attempts === 1) {
				const cause = Object.assign(new Error('The session has been destroyed'), { code: 'ERR_HTTP2_INVALID_SESSION' });
				throw new TypeError('fetch failed', { cause });
			}
			return Response.json([{ id: 'e-1', title: 'Pulse Summit' }]);
		}));
		const res = await supabaseFetch('https://test-project.supabase.co/rest/v1/events');
		expect(res.ok).toBe(true);
		expect(attempts).toBe(2);
	});
});
