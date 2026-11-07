import { json, type Cookies } from '@sveltejs/kit';

const RETIRED_COOKIES = ['owltside_bio_vault', 'owltside_bio_unlocked', 'owltside_just_authed'];

/** Remove stale gate/vault cookies without disturbing the real Auth session. */
export function clearRetiredBiometricCookies(cookies: Pick<Cookies, 'get' | 'delete'>): void {
	for (const name of RETIRED_COOKIES) {
		if (cookies.get(name)) cookies.delete(name, { path: '/' });
	}
}

/** Explicitly disable old clients as well as the current UI. No crypto or DB calls. */
export function biometricDisabledResponse(cookies: Pick<Cookies, 'get' | 'delete'>): Response {
	clearRetiredBiometricCookies(cookies);
	return json({
		error: 'Biometric sign-in is temporarily disabled. Please use email-code sign-in.',
		code: 'BIOMETRIC_DISABLED'
	}, { status: 410, headers: { 'cache-control': 'private, no-store' } });
}
