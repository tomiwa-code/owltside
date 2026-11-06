import { dev } from '$app/environment';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { supabaseConfigured } from './supabase';

/**
 * Demo mode is an explicit, development-only affordance: it accepts any login
 * code and seeds a local dataset. It used to switch on implicitly whenever the
 * Supabase env vars were missing, which meant a misconfigured production
 * deploy silently became an unauthenticated sandbox. Production now requires
 * an explicit `DEMO_MODE=true` opt-in (and no Supabase configuration), and the
 * app refuses to boot without a database otherwise.
 */
export function demoModeEnabled(): boolean {
	if (supabaseConfigured()) return false;
	const flag = String(privateEnv.DEMO_MODE ?? publicEnv.PUBLIC_DEMO_MODE ?? '')
		.trim()
		.toLowerCase();
	if (flag === 'false') return false;
	if (flag === 'true') return true;
	return dev;
}
