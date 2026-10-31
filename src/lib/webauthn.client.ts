import { browser } from '$app/environment';

const STORAGE_KEY = 'owltside.biometric.v1';

export interface LocalBiometricMetadata {
	credentialId: string;
	deviceLabel: string;
	createdAt: string;
	lastVerifiedAt?: string;
}

export function bufferToBase64Url(buf: ArrayBuffer | Uint8Array): string {
	const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBuffer(value: string): ArrayBuffer {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
	const binary = atob(normalized + pad);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

export function detectBiometricDeviceLabel(): string {
	if (!browser) return 'Device Biometrics';
	const ua = navigator.userAgent || '';
	if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone Face ID / Touch ID';
	if (/Android/i.test(ua)) return 'Android Fingerprint / Biometrics';
	if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac Touch ID';
	if (/Windows/i.test(ua)) return 'Windows Hello';
	return 'Platform Biometrics';
}

export async function isPlatformBiometricAvailable(): Promise<{
	supported: boolean;
	reason?: string;
}> {
	if (!browser) return { supported: false, reason: 'Browser environment required.' };
	if (!window.isSecureContext) {
		return {
			supported: false,
			reason: 'Biometrics require a secure connection (HTTPS or localhost).'
		};
	}
	if (typeof window.PublicKeyCredential === 'undefined' || !navigator.credentials) {
		return {
			supported: false,
			reason: 'This browser does not support WebAuthn biometric passkeys.'
		};
	}
	try {
		const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
		if (!available) {
			return {
				supported: false,
				reason: 'No fingerprint, Face ID, or screen-lock biometric sensor was detected on this device.'
			};
		}
		return { supported: true };
	} catch {
		return {
			supported: false,
			reason: 'Could not access the biometric sensor on this device.'
		};
	}
}

export function readStoredBiometric(): LocalBiometricMetadata | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as LocalBiometricMetadata;
		return parsed?.credentialId ? parsed : null;
	} catch {
		return null;
	}
}

function writeStoredBiometric(meta: LocalBiometricMetadata | null): void {
	if (!browser) return;
	try {
		if (!meta) localStorage.removeItem(STORAGE_KEY);
		else localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
	} catch {
		// Ignore quota errors
	}
}

function friendlyWebAuthnError(err: unknown, fallback: string): string {
	if (err instanceof DOMException) {
		if (err.name === 'NotAllowedError') {
			return 'Biometric prompt was cancelled or timed out.';
		}
		if (err.name === 'SecurityError') {
			return 'Biometrics require HTTPS or a matching domain.';
		}
		if (err.name === 'InvalidStateError') {
			return 'Biometrics are already registered on this device.';
		}
	}
	return err instanceof Error && err.message ? err.message : fallback;
}

export async function enrollBiometricPasskey(): Promise<LocalBiometricMetadata> {
	const check = await isPlatformBiometricAvailable();
	if (!check.supported) {
		throw new Error(check.reason ?? 'Biometrics are not supported on this device.');
	}

	const challengeRes = await fetch('/api/auth/biometric/challenge', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ purpose: 'register' })
	});
	const challengeData = (await challengeRes.json().catch(() => ({}))) as {
		challenge?: string;
		challengeToken?: string;
		user?: { id: string; name: string; displayName: string };
		error?: string;
	};
	if (!challengeRes.ok || !challengeData.challenge || !challengeData.challengeToken) {
		throw new Error(challengeData.error ?? 'Could not start biometric setup.');
	}

	const userBytes = new TextEncoder().encode(challengeData.user?.id ?? 'owltside-user');
	const deviceLabel = detectBiometricDeviceLabel();

	let credential: PublicKeyCredential | null;
	try {
		credential = (await navigator.credentials.create({
			publicKey: {
				challenge: base64UrlToBuffer(challengeData.challenge),
				rp: {
					name: 'Owltside',
					id: window.location.hostname
				},
				user: {
					id: userBytes,
					name: challengeData.user?.name ?? 'member@owltside.app',
					displayName: challengeData.user?.displayName ?? 'Owltside Member'
				},
				pubKeyCredParams: [
					{ type: 'public-key', alg: -7 }, // ES256 (Face ID, Touch ID, Android BiometricPrompt)
					{ type: 'public-key', alg: -257 } // RS256 (Windows Hello fallback)
				],
				authenticatorSelection: {
					authenticatorAttachment: 'platform',
					userVerification: 'required',
					residentKey: 'preferred'
				},
				timeout: 60_000,
				attestation: 'none'
			}
		})) as PublicKeyCredential | null;
	} catch (err) {
		throw new Error(friendlyWebAuthnError(err, 'Biometric enrollment failed.'));
	}

	if (!credential) {
		throw new Error('No biometric passkey was created.');
	}

	const response = credential.response as AuthenticatorAttestationResponse;
	const publicKeyBuf =
		typeof response.getPublicKey === 'function' ? response.getPublicKey() : null;
	const algorithm =
		typeof response.getPublicKeyAlgorithm === 'function'
			? response.getPublicKeyAlgorithm()
			: -7;

	const registerRes = await fetch('/api/auth/biometric/register', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			challengeToken: challengeData.challengeToken,
			credentialId: bufferToBase64Url(credential.rawId),
			clientDataJSON: bufferToBase64Url(response.clientDataJSON),
			attestationObject: bufferToBase64Url(response.attestationObject),
			publicKeySpki: publicKeyBuf ? bufferToBase64Url(publicKeyBuf) : undefined,
			algorithm,
			deviceLabel
		})
	});
	const registerBody = (await registerRes.json().catch(() => ({}))) as {
		ok?: boolean;
		credentialId?: string;
		deviceLabel?: string;
		createdAt?: string;
		error?: string;
	};
	if (!registerRes.ok || !registerBody.credentialId) {
		throw new Error(registerBody.error ?? 'Could not save your biometric passkey.');
	}

	const metadata: LocalBiometricMetadata = {
		credentialId: registerBody.credentialId,
		deviceLabel: registerBody.deviceLabel ?? deviceLabel,
		createdAt: registerBody.createdAt ?? new Date().toISOString(),
		lastVerifiedAt: registerBody.createdAt ?? new Date().toISOString()
	};
	writeStoredBiometric(metadata);
	return metadata;
}

export async function authenticateWithBiometrics(): Promise<{
	verifiedAt: string;
	sessionRestored: boolean;
	userName?: string;
}> {
	const check = await isPlatformBiometricAvailable();
	if (!check.supported) {
		throw new Error(check.reason ?? 'Biometrics are not supported on this device.');
	}

	const challengeRes = await fetch('/api/auth/biometric/challenge', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ purpose: 'authenticate' })
	});
	const challengeData = (await challengeRes.json().catch(() => ({}))) as {
		challenge?: string;
		challengeToken?: string;
		allowCredentialIds?: string[];
		error?: string;
	};
	if (!challengeRes.ok || !challengeData.challenge || !challengeData.challengeToken) {
		throw new Error(challengeData.error ?? 'Could not initiate biometric check.');
	}

	const stored = readStoredBiometric();
	const candidateIds = new Set<string>(challengeData.allowCredentialIds ?? []);
	if (stored?.credentialId) candidateIds.add(stored.credentialId);

	let assertion: PublicKeyCredential | null;
	try {
		assertion = (await navigator.credentials.get({
			publicKey: {
				challenge: base64UrlToBuffer(challengeData.challenge),
				rpId: window.location.hostname,
				userVerification: 'required',
				allowCredentials:
					candidateIds.size > 0
						? [...candidateIds].map((id) => ({
								type: 'public-key' as const,
								id: base64UrlToBuffer(id),
								transports: ['internal', 'hybrid'] as AuthenticatorTransport[]
							}))
						: undefined,
				timeout: 60_000
			}
		})) as PublicKeyCredential | null;
	} catch (err) {
		throw new Error(friendlyWebAuthnError(err, 'Biometric authentication failed.'));
	}

	if (!assertion) {
		throw new Error('Biometric verification did not return a credential.');
	}

	const response = assertion.response as AuthenticatorAssertionResponse;
	const verifyRes = await fetch('/api/auth/biometric/verify', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			challengeToken: challengeData.challengeToken,
			credentialId: bufferToBase64Url(assertion.rawId),
			clientDataJSON: bufferToBase64Url(response.clientDataJSON),
			authenticatorData: bufferToBase64Url(response.authenticatorData),
			signature: bufferToBase64Url(response.signature)
		})
	});
	const verifyBody = (await verifyRes.json().catch(() => ({}))) as {
		ok?: boolean;
		verifiedAt?: string;
		sessionRestored?: boolean;
		userName?: string;
		error?: string;
	};
	if (!verifyRes.ok || !verifyBody.ok) {
		throw new Error(verifyBody.error ?? 'Biometric signature could not be verified.');
	}

	const verifiedAt = verifyBody.verifiedAt ?? new Date().toISOString();
	if (stored) {
		writeStoredBiometric({ ...stored, lastVerifiedAt: verifiedAt });
	} else {
		writeStoredBiometric({
			credentialId: bufferToBase64Url(assertion.rawId),
			deviceLabel: detectBiometricDeviceLabel(),
			createdAt: verifiedAt,
			lastVerifiedAt: verifiedAt
		});
	}

	return {
		verifiedAt,
		sessionRestored: Boolean(verifyBody.sessionRestored),
		userName: verifyBody.userName
	};
}

export async function disableBiometricPasskey(): Promise<void> {
	writeStoredBiometric(null);
	await fetch('/api/auth/biometric/register', { method: 'DELETE' }).catch(() => undefined);
}
