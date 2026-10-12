import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export function supabaseConfigured(): boolean {
	return Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);
}

/** Server-side Supabase client bound to the request's cookies (auth session). */
export function createSupabase(cookies: Cookies): SupabaseClient | null {
	if (!supabaseConfigured()) return null;
	return createServerClient(env.PUBLIC_SUPABASE_URL!, env.PUBLIC_SUPABASE_ANON_KEY!, {
		cookies: {
			getAll() {
				return cookies.getAll();
			},
			setAll(toSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
				for (const c of toSet) {
					try {
						cookies.set(c.name, c.value, { path: '/', ...c.options });
					} catch {
						// called from a load function — cookie set not allowed; ignore
					}
				}
			}
		}
	});
}
