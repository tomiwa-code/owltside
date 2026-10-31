import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabase } from '$lib/server/supabase';
import { OPERATING_IDENTITY_COOKIE } from '$lib/constants/operating-identity';
import {
	BIOMETRIC_JUST_AUTHED_COOKIE,
	BIOMETRIC_UNLOCKED_COOKIE
} from '$lib/server/webauthn';

export const POST: RequestHandler = async ({ cookies }) => {
	const db = createSupabase(cookies);
	if (db) {
		await db.auth.signOut().catch(() => undefined);
	}
	cookies.delete('owltside_demo_session', { path: '/' });
	cookies.delete(OPERATING_IDENTITY_COOKIE, { path: '/' });
	cookies.delete(BIOMETRIC_UNLOCKED_COOKIE, { path: '/' });
	cookies.delete(BIOMETRIC_JUST_AUTHED_COOKIE, { path: '/' });
	return json({ ok: true });
};
