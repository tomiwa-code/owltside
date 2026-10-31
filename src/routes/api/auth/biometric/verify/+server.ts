import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabase } from '$lib/server/supabase';
import {
	BIOMETRIC_UNLOCKED_COOKIE,
	BIOMETRIC_VAULT_COOKIE,
	decryptBiometricVault,
	encryptBiometricVault,
	verifyWebAuthnAssertion,
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
		authenticatorData?: string;
		signature?: string;
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid biometric verification payload.' }, { status: 400 });
	}

	if (
		!body.challengeToken ||
		!body.credentialId ||
		!body.clientDataJSON ||
		!body.authenticatorData ||
		!body.signature
	) {
		return json({ error: 'Incomplete biometric assertion.' }, { status: 400 });
	}

	let challenge: string;
	let tokenUserId: string | null;
	try {
		({ challenge, userId: tokenUserId } = verifyWebAuthnChallengeToken(
			body.challengeToken,
			'authenticate'
		));
		if (tokenUserId && tokenUserId !== locals.session.userId) {
			return json({ error: 'Biometric challenge user mismatch.' }, { status: 401 });
		}
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Biometric challenge expired.' },
			{ status: 400 }
		);
	}

	const vault = decryptBiometricVault(cookies.get(BIOMETRIC_VAULT_COOKIE));
	let stored: StoredBiometricCredential | undefined = vault.find(
		(item) =>
			item.credentialId === body.credentialId && item.userId === locals.session!.userId
	);

	const supabase = createSupabase(cookies);
	if (!stored && supabase && locals.session.userId && !locals.session.demo) {
		const { data: row } = await supabase
			.from('biometric_credentials')
			.select('credential_id,public_key,algorithm,counter,device_label,user_id,created_at')
			.eq('credential_id', body.credentialId)
			.eq('user_id', locals.session.userId)
			.maybeSingle();
		if (row) {
			stored = {
				credentialId: row.credential_id,
				publicKey: row.public_key,
				algorithm: Number(row.algorithm ?? -7),
				counter: Number(row.counter ?? 0),
				deviceLabel: row.device_label ?? 'Device Biometrics',
				userId: row.user_id,
				userName: locals.session.name,
				userHandle: locals.session.handle,
				userEmail: locals.session.email,
				createdAt: row.created_at
			};
		}
	}

	if (!stored) {
		return json(
			{ error: 'This passkey is not enrolled on this device.' },
			{ status: 404 }
		);
	}

	let assertionResult: { counter: number; userVerified: boolean };
	try {
		assertionResult = verifyWebAuthnAssertion({
			publicKeySpki: stored.publicKey,
			clientDataJSON: body.clientDataJSON,
			authenticatorData: body.authenticatorData,
			signature: body.signature,
			expectedChallenge: challenge,
			expectedOrigin: url.origin
		});
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Biometric verification failed.' },
			{ status: 401 }
		);
	}

	if (assertionResult.counter > 0 && stored.counter > 0 && assertionResult.counter <= stored.counter) {
		return json({ error: 'Biometric replay counter rejected.' }, { status: 401 });
	}

	const verifiedAt = new Date().toISOString();

	if (supabase && locals.session.userId && !locals.session.demo) {
		await supabase
			.from('biometric_credentials')
			.update({
				counter: Math.max(stored.counter, assertionResult.counter),
				last_used_at: verifiedAt
			})
			.eq('credential_id', stored.credentialId)
			.eq('user_id', locals.session.userId)
			.then(() => undefined, () => undefined);
	}

	const isSecure = url.protocol === 'https:';
	const updatedVault = [
		{
			...stored,
			counter: Math.max(stored.counter, assertionResult.counter),
			lastUsedAt: verifiedAt
		},
		...vault.filter((item) => item.credentialId !== stored!.credentialId)
	];
	cookies.set(BIOMETRIC_VAULT_COOKIE, encryptBiometricVault(updatedVault), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: isSecure,
		maxAge: 60 * 60 * 24 * 180
	});
	cookies.set(BIOMETRIC_UNLOCKED_COOKIE, verifiedAt, {
		path: '/',
		httpOnly: false,
		sameSite: 'lax',
		secure: isSecure,
		maxAge: 60 * 60 * 12
	});

	return json({
		ok: true,
		verifiedAt,
		userId: locals.session.userId,
		userName: locals.session.name,
		deviceLabel: stored.deviceLabel
	});
};
