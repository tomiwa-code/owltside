import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabase } from '$lib/server/supabase';
import {
	BIOMETRIC_VAULT_COOKIE,
	BiometricConfigurationError,
	decryptBiometricVault,
	issueWebAuthnChallenge
} from '$lib/server/webauthn';

// Challenges are user-bound, short-lived authentication material. Never cache
// successful responses or failures in the browser, a service worker, or a CDN.
function response(body: Record<string, unknown>, status = 200): Response {
	return json(body, { status, headers: { 'cache-control': 'private, no-store', vary: 'Cookie' } });
}

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!locals.session) {
		return response({ error: 'Your sign-in session has expired. Sign out and use an email code to continue.', code: 'SESSION_REQUIRED' }, 401);
	}

	let body: { purpose?: string } = {};
	try {
		const parsed = await request.json();
		body = parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		body = {};
	}
	const purpose = body.purpose === 'register' ? 'register' : 'authenticate';
	const userId = locals.session.userId;
	let challenge: string;
	let challengeToken: string;
	try {
		({ challenge, challengeToken } = issueWebAuthnChallenge(purpose, userId));
	} catch (err) {
		const configurationError = err instanceof BiometricConfigurationError;
		console.error('[biometric/challenge]', configurationError
			? 'BIOMETRIC_SECRET is missing. Set a private, persistent secret on the public app deployment.'
			: 'Challenge generation failed.');
		return response({
			error: configurationError
				? 'Biometric unlock is not configured on this server. Sign out and use an email code, or contact support.'
				: 'The biometric service is temporarily unavailable. Try again or sign out and use an email code.',
			code: configurationError ? 'BIOMETRIC_NOT_CONFIGURED' : 'BIOMETRIC_UNAVAILABLE'
		}, 503);
	}

	const vault = decryptBiometricVault(cookies.get(BIOMETRIC_VAULT_COOKIE)).filter(
		(cred) => cred.userId === userId
	);
	const credentialIds = new Set<string>(vault.map((cred) => cred.credentialId));

	if (purpose === 'authenticate' && credentialIds.size === 0) {
		try {
			const supabase = createSupabase(cookies);
			if (supabase) {
				const { data: rows, error } = await supabase
					.from('biometric_credentials')
					.select('credential_id')
					.eq('user_id', userId);
				if (error) throw new Error('Credential lookup failed');
				for (const row of rows ?? []) {
					if (row.credential_id) credentialIds.add(row.credential_id);
				}
			}
		} catch {
			console.error('[biometric/challenge] Biometric credential lookup failed. Check database availability and migration 026.');
			return response({
				error: 'Your saved passkeys could not be loaded. Try again or sign out and use an email code.',
				code: 'BIOMETRIC_STORE_UNAVAILABLE'
			}, 503);
		}
	}

	return response({
		challenge,
		challengeToken,
		allowCredentialIds: [...credentialIds],
		user:
			purpose === 'register'
				? {
						id: userId,
						name: locals.session.email || locals.session.handle || 'member@owltside.app',
						displayName: locals.session.name || 'Owltside Member'
					}
				: null
	});
};
