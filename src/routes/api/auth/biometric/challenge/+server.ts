import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	BIOMETRIC_VAULT_COOKIE,
	decryptBiometricVault,
	issueWebAuthnChallenge
} from '$lib/server/webauthn';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	let body: { purpose?: string } = {};
	try {
		body = (await request.json()) as { purpose?: string };
	} catch {
		body = {};
	}
	const purpose = body.purpose === 'register' ? 'register' : 'authenticate';
	if (purpose === 'register' && !locals.session && !locals.demoMode) {
		return json({ error: 'Sign in first to enroll fingerprint or Face ID.' }, { status: 401 });
	}
	const userId = locals.session?.userId ?? (locals.demoMode ? 'demo' : null);
	const { challenge, challengeToken } = issueWebAuthnChallenge(purpose, userId);
	const vault = decryptBiometricVault(cookies.get(BIOMETRIC_VAULT_COOKIE));
	const allowCredentialIds = vault.map((cred) => cred.credentialId);

	return json({
		challenge,
		challengeToken,
		allowCredentialIds,
		user:
			purpose === 'register'
				? {
						id: userId ?? 'demo',
						name: locals.session?.email ?? locals.session?.handle ?? 'member@owltside.app',
						displayName: locals.session?.name ?? 'Owltside Member'
					}
				: null
	});
};
