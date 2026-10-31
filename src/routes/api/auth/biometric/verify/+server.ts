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
	try {
		({ challenge } = verifyWebAuthnChallengeToken(body.challengeToken, 'authenticate'));
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Biometric challenge expired.' },
			{ status: 400 }
		);
	}

	const vault = decryptBiometricVault(cookies.get(BIOMETRIC_VAULT_COOKIE));
	let stored: StoredBiometricCredential | undefined = vault.find(
		(item) => item.credentialId === body.credentialId
	);

	const supabase = createSupabase(cookies);
	if (!stored && supabase && locals.session?.userId) {
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
			{ error: 'This passkey is not enrolled on this device. Re-enable Biometric Unlock in Settings.' },
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
	let nextRefreshToken = stored.refreshToken;
	let sessionRestored = Boolean(locals.session);

	// If signing in from /auth/login while logged out, restore the Supabase or demo session!
	if (!locals.session) {
		if (supabase && stored.refreshToken) {
			const { data: refreshed, error } = await supabase.auth.refreshSession({
				refresh_token: stored.refreshToken
			});
			if (error || !refreshed.session || !refreshed.user) {
				const banned = /banned/i.test(error?.message ?? '');
				return json(
					{
						error: banned
							? 'Your account has been disabled by an administrator.'
							: 'Your saved session expired. Sign in once with email to refresh biometric login.'
					},
					{ status: banned ? 403 : 401 }
				);
			}
			const bannedUntil = (refreshed.user as { banned_until?: string | null }).banned_until;
			if (
				(bannedUntil && Date.parse(bannedUntil) > Date.now()) ||
				refreshed.user.user_metadata?.account_disabled === true
			) {
				await supabase.auth.signOut();
				return json(
					{ error: 'Your account has been disabled by an administrator.' },
					{ status: 403 }
				);
			}
			nextRefreshToken = refreshed.session.refresh_token;
			sessionRestored = true;
		} else if (locals.demoMode) {
			cookies.set('owltside_demo_session', '1', {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 60 * 60 * 24 * 30
			});
			sessionRestored = true;
		}
	}

	if (supabase && locals.session?.userId) {
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
			refreshToken: nextRefreshToken,
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
		sessionRestored,
		userName: stored.userName
	});
};
