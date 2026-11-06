import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

/**
 * Environment resolution shared by the server-only modules. Kept in its own
 * module so configuration answers never depend on the (frequently mocked)
 * Supabase client module.
 */
export function resolveSupabaseUrl(): string {
	return (
		publicEnv.PUBLIC_SUPABASE_URL ||
		privateEnv.SUPABASE_URL ||
		privateEnv.VITE_SUPABASE_URL ||
		''
	).trim();
}

export function resolveSupabaseAnonKey(): string {
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
