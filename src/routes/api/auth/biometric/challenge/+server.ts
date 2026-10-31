import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabase } from '$lib/server/supabase';
import {
	BIOMETRIC_VAULT_COOKIE,
	decryptBiometricVault,
	issueWebAuthnChallenge
} from '$lib/server/webauthn';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!locals.session) {
		return json({ error: 'Sign in with your email first.' }, { status: 401 });
	}

	let body: { purpose?: string } = {};
	try {
		body = (await request.json()) as { purpose?: string };
	} catch {
		body = {};
	}
	const purpose = body.purpose === 'register' ? 'register' : 'authenticate';
	const userId = locals.session.userId;
	const { challenge, challengeToken } = issueWebAuthnChallenge(purpose, userId);

	const vault = decryptBiometricVault(cookies.get(BIOMETRIC_VAULT_COOKIE)).filter(
		(cred) => cred.userId === userId
	);
	const credentialIds = new Set<string>(vault.map((cred) => cred.credentialId));

	if (purpose === 'authenticate' && credentialIds.size === 0) {
		const supabase = createSupabase(cookies);
		if (supabase) {
			const { data: rows } = await supabase
				.from('biometric_credentials')
				.select('credential_id')
				.eq('user_id', userId);
			for (const row of rows ?? []) {
				if (row.credential_id) credentialIds.add(row.credential_id);
			}
		}
	}

	return json({
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
