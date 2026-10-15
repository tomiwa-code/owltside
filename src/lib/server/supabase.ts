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
