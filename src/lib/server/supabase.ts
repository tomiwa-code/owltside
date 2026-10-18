import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Cookies } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

function resolveSupabaseUrl(): string {
	return (
		publicEnv.PUBLIC_SUPABASE_URL ||
		privateEnv.SUPABASE_URL ||
		privateEnv.VITE_SUPABASE_URL ||
		''
	).trim();
}

function resolveSupabaseAnonKey(): string {
	return (
		publicEnv.PUBLIC_SUPABASE_ANON_KEY ||
		privateEnv.SUPABASE_ANON_KEY ||
		privateEnv.VITE_SUPABASE_ANON_KEY ||
		''
	).trim();
}

export function supabaseConfigured(): boolean {
	return Boolean(resolveSupabaseUrl() && resolveSupabaseAnonKey());
}

const UNDICI_GLOBAL_DISPATCHER = Symbol.for('undici.globalDispatcher.1');
let configuredHttp1Dispatcher = false;

function ensureHttp1Dispatcher(forceReset = false): void {
	try {
		const globalAny = globalThis as Record<symbol, unknown>;
		const current = globalAny[UNDICI_GLOBAL_DISPATCHER] as
			| { constructor?: new (opts: Record<string, unknown>) => unknown }
			| undefined;
		if (!current || typeof current.constructor !== 'function') return;
		if (configuredHttp1Dispatcher && !forceReset) return;
		globalAny[UNDICI_GLOBAL_DISPATCHER] = new current.constructor({
			allowH2: false,
			keepAliveTimeout: 10_000,
			keepAliveMaxTimeout: 30_000
		});
		configuredHttp1Dispatcher = true;
	} catch {
		// Ignore if running in a non-undici runtime
	}
}

function isTransientNetworkError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const err = error as { message?: string; code?: string; cause?: { code?: string; message?: string } };
	const code = `${err.code ?? ''} ${err.cause?.code ?? ''}`;
	const msg = `${err.message ?? ''} ${err.cause?.message ?? ''}`;
	return /ERR_HTTP2_|UND_ERR_|ECONNRESET|ETIMEDOUT|EPIPE|EAI_AGAIN|ENOTFOUND/i.test(code) ||
		/fetch failed|session has been destroyed|GOAWAY|other side closed|socket hang up/i.test(msg);
}

export async function supabaseFetch(
	input: RequestInfo | URL,
	init?: RequestInit
): Promise<Response> {
	ensureHttp1Dispatcher(false);
	let lastError: unknown;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const response = await globalThis.fetch(input, init);
			ensureHttp1Dispatcher(false);
			return response;
		} catch (error) {
			lastError = error;
			if (!isTransientNetworkError(error) || attempt === 2) {
				throw error;
			}
			ensureHttp1Dispatcher(true);
			await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
		}
	}
	throw lastError;
}

/** Server-side Supabase client bound to the request's cookies (auth session). */
export function createSupabase(cookies: Cookies, options: { freshAuth?: boolean } = {}): SupabaseClient | null {
	const url = resolveSupabaseUrl();
	const key = resolveSupabaseAnonKey();
	if (!url || !key) return null;
	// The SSR client's INITIAL_SESSION listener can refresh an expired session even
	// before the explicit code exchange. Hide only that old session while starting
	// or completing a fresh login; retain cookie names so chunk cleanup still works.
	const sessionKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
	const isSessionCookie = (name: string) => name === sessionKey || name.startsWith(`${sessionKey}.`);
	let freshAuth = options.freshAuth ?? false;
	return createServerClient(url, key, {
		global: {
			fetch: supabaseFetch
		},
		cookies: {
			getAll() {
				return cookies.getAll().map((cookie) => freshAuth && isSessionCookie(cookie.name) ? { ...cookie, value: '' } : cookie);
			},
			setAll(toSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
				for (const c of toSet) {
					cookies.set(c.name, c.value, { ...c.options, path: '/' });
					if (isSessionCookie(c.name) && c.value && c.options?.maxAge !== 0) freshAuth = false;
				}
			}
		}
	});
}
