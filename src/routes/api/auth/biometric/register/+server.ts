import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabase } from '$lib/server/supabase';
import {
	BIOMETRIC_UNLOCKED_COOKIE,
	BIOMETRIC_VAULT_COOKIE,
	decryptBiometricVault,
	encryptBiometricVault,
	extractSpkiFromAttestation,
	verifyClientData,
	verifyWebAuthnChallengeToken,
	type StoredBiometricCredential
} from '$lib/server/webauthn';

export const POST: RequestHandler = async ({ request, locals, cookies, url }) => {
	if (!locals.session) {
		return json({ error: 'Sign in with your email first.' }, { status: 401 });
	}

	let body: {
		challengeToken?: string;
		credentialId?: string;
		clientDataJSON?: string;
		attestationObject?: string;
		publicKeySpki?: string;
		algorithm?: number;
		deviceLabel?: string;
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid biometric registration payload.' }, { status: 400 });
	}

	if (!body.challengeToken || !body.credentialId || !body.clientDataJSON) {
		return json({ error: 'Incomplete biometric credential response.' }, { status: 400 });
	}

	let challenge: string;
	let tokenUserId: string | null;
	try {
		({ challenge, userId: tokenUserId } = verifyWebAuthnChallengeToken(
			body.challengeToken,
			'register'
		));
		if (tokenUserId && tokenUserId !== locals.session.userId) {
			return json({ error: 'Biometric challenge user mismatch.' }, { status: 401 });
		}
		verifyClientData(body.clientDataJSON, 'webauthn.create', challenge, url.origin);
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Could not verify biometric challenge.' },
			{ status: 400 }
		);
	}

	let publicKeySpki = (body.publicKeySpki ?? '').trim();
	let algorithm = typeof body.algorithm === 'number' ? body.algorithm : -7;
	let counter = 0;

	if (!publicKeySpki) {
		if (!body.attestationObject) {
			return json({ error: 'Missing passkey public key attestation.' }, { status: 400 });
		}
		try {
			const extracted = extractSpkiFromAttestation(body.attestationObject);
			publicKeySpki = extracted.publicKeySpki;
			algorithm = extracted.algorithm;
			counter = extracted.counter;
		} catch (err) {
			return json(
				{ error: err instanceof Error ? err.message : 'Unsupported biometric passkey format.' },
				{ status: 400 }
			);
		}
	}

	const supabase = createSupabase(cookies);
	if (supabase && locals.session.userId && !locals.session.demo) {
		await supabase
			.from('biometric_credentials')
			.upsert(
				{
					user_id: locals.session.userId,
					credential_id: body.credentialId,
					public_key: publicKeySpki,
					algorithm,
					counter,
					device_label: (body.deviceLabel ?? 'Phone Biometrics').slice(0, 80)
				},
				{ onConflict: 'credential_id' }
			)
			.then(() => undefined, () => undefined);
	}

	const now = new Date().toISOString();
	const newCred: StoredBiometricCredential = {
		credentialId: body.credentialId,
		publicKey: publicKeySpki,
		algorithm,
		counter,
		deviceLabel: (body.deviceLabel ?? 'Device Biometrics').slice(0, 80),
		userId: locals.session.userId,
		userName: locals.session.name || 'Owltside Member',
		userHandle: locals.session.handle,
		userEmail: locals.session.email,
		createdAt: now,
		lastUsedAt: now
	};

	const existing = decryptBiometricVault(cookies.get(BIOMETRIC_VAULT_COOKIE)).filter(
		(item) => item.credentialId !== newCred.credentialId
	);
	const isSecure = url.protocol === 'https:';
	cookies.set(BIOMETRIC_VAULT_COOKIE, encryptBiometricVault([newCred, ...existing]), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: isSecure,
		maxAge: 60 * 60 * 24 * 180
	});
	cookies.set(BIOMETRIC_UNLOCKED_COOKIE, now, {
		path: '/',
		httpOnly: false,
		sameSite: 'lax',
		secure: isSecure,
		maxAge: 60 * 60 * 12
	});

	return json({
		ok: true,
		userId: newCred.userId,
		credentialId: newCred.credentialId,
		deviceLabel: newCred.deviceLabel,
		createdAt: now
	});
};

export const DELETE: RequestHandler = async ({ locals, cookies, url }) => {
	const supabase = createSupabase(cookies);
	if (supabase && locals.session?.userId && !locals.session.demo) {
		await supabase
			.from('biometric_credentials')
			.delete()
			.eq('user_id', locals.session.userId)
			.then(() => undefined, () => undefined);
	}
	const isSecure = url.protocol === 'https:';
	cookies.delete(BIOMETRIC_VAULT_COOKIE, { path: '/', secure: isSecure });
	cookies.delete(BIOMETRIC_UNLOCKED_COOKIE, { path: '/', secure: isSecure });
	return json({ ok: true });
};
