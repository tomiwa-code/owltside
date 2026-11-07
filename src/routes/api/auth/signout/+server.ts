import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabase } from '$lib/server/supabase';
import { OPERATING_IDENTITY_COOKIE } from '$lib/constants/operating-identity';
import { clearRetiredBiometricCookies } from '$lib/server/biometrics-disabled';

export const POST: RequestHandler = async ({ cookies }) => {
	const db = createSupabase(cookies);
	if (db) {
		await db.auth.signOut().catch(() => undefined);
	}
	cookies.delete('owltside_demo_session', { path: '/' });
	cookies.delete(OPERATING_IDENTITY_COOKIE, { path: '/' });
	clearRetiredBiometricCookies(cookies);
	return json({ ok: true });
};
