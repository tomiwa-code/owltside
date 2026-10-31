import { browser } from '$app/environment';

const STORAGE_KEY = 'owltside.biometric.v1';
const BY_USER_STORAGE_KEY = 'owltside.biometric.users.v1';
export const BIOMETRIC_SESSION_STORAGE_KEY = 'owltside.biometric.session.v1';
export const BIOMETRIC_JUST_AUTHED_COOKIE = 'owltside_just_authed';

export interface LocalBiometricMetadata {
	userId?: string;
	credentialId: string;
	deviceLabel: string;
	createdAt: string;
	lastVerifiedAt?: string;
}

class PasskeyNotEnrolledError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PasskeyNotEnrolledError';
	}
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

function readByUserMap(): Record<string, LocalBiometricMetadata> {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(BY_USER_STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Record<string, LocalBiometricMetadata>;
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

export function readStoredBiometric(expectedUserId?: string): LocalBiometricMetadata | null {
	if (!browser) return null;
	try {
		if (expectedUserId) {
			const map = readByUserMap();
			const byUser = map[expectedUserId];
			if (byUser?.credentialId) return byUser;
		}
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as LocalBiometricMetadata;
		if (!parsed?.credentialId) return null;
		if (expectedUserId && parsed.userId && parsed.userId !== expectedUserId) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

function writeStoredBiometric(meta: LocalBiometricMetadata | null, userId?: string): void {
	if (!browser) return;
	try {
		if (!meta) {
			localStorage.removeItem(STORAGE_KEY);
			if (userId) {
				const map = readByUserMap();
				delete map[userId];
				localStorage.setItem(BY_USER_STORAGE_KEY, JSON.stringify(map));
			}
		} else {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
			const uid = meta.userId ?? userId;
			if (uid) {
				const map = readByUserMap();
				map[uid] = { ...meta, userId: uid };
				localStorage.setItem(BY_USER_STORAGE_KEY, JSON.stringify(map));
			}
		}
	} catch {
		// Ignore quota errors
	}
}

export function isBiometricSessionUnlocked(userId: string): boolean {
	if (!browser || !userId) return false;
	try {
		return sessionStorage.getItem(BIOMETRIC_SESSION_STORAGE_KEY) === userId;
	} catch {
		return false;
	}
}

export function markBiometricSessionUnlocked(userId: string): void {
	if (!browser || !userId) return;
	try {
		sessionStorage.setItem(BIOMETRIC_SESSION_STORAGE_KEY, userId);
	} catch {
		// Ignore storage errors
	}
}

export function clearBiometricSessionUnlocked(): void {
	if (!browser) return;
	try {
		sessionStorage.removeItem(BIOMETRIC_SESSION_STORAGE_KEY);
	} catch {
		// Ignore storage errors
	}
}

export function consumeJustAuthenticatedCookie(userId: string): boolean {
	if (!browser || !userId || typeof document === 'undefined') return false;
	try {
		const hasCookie = document.cookie
			.split(';')
			.some((part) => part.trim().startsWith(`${BIOMETRIC_JUST_AUTHED_COOKIE}=`));
		if (!hasCookie) return false;
		document.cookie = `${BIOMETRIC_JUST_AUTHED_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
		markBiometricSessionUnlocked(userId);
		return true;
	} catch {
		return false;
	}
}

export function isBiometricUserCancelledError(err: unknown): boolean {
	if (err instanceof DOMException && err.name === 'NotAllowedError') return true;
	if (err instanceof Error && /cancelled or timed out/i.test(err.message)) return true;
	return false;
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

export async function enrollBiometricPasskey(
	expectedUserId?: string
): Promise<LocalBiometricMetadata> {
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

	const resolvedUserId = challengeData.user?.id ?? expectedUserId;
	const userBytes = new TextEncoder().encode(resolvedUserId ?? 'owltside-user');
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
		userId?: string;
		credentialId?: string;
		deviceLabel?: string;
		createdAt?: string;
		error?: string;
	};
	if (!registerRes.ok || !registerBody.credentialId) {
		throw new Error(registerBody.error ?? 'Could not save your biometric passkey.');
	}

	const finalUserId = registerBody.userId ?? resolvedUserId;
	const metadata: LocalBiometricMetadata = {
		userId: finalUserId,
		credentialId: registerBody.credentialId,
		deviceLabel: registerBody.deviceLabel ?? deviceLabel,
		createdAt: registerBody.createdAt ?? new Date().toISOString(),
		lastVerifiedAt: registerBody.createdAt ?? new Date().toISOString()
	};
	writeStoredBiometric(metadata, finalUserId);
	if (finalUserId) markBiometricSessionUnlocked(finalUserId);
	return metadata;
}

export async function authenticateWithBiometrics(expectedUserId?: string): Promise<{
	verifiedAt: string;
	userId?: string;
	userName?: string;
	deviceLabel?: string;
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

	const stored = readStoredBiometric(expectedUserId);
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
		userId?: string;
		userName?: string;
		deviceLabel?: string;
		error?: string;
	};
	if (verifyRes.status === 404) {
		throw new PasskeyNotEnrolledError(
			verifyBody.error ?? 'This passkey is not enrolled on this device.'
		);
	}
	if (!verifyRes.ok || !verifyBody.ok) {
		throw new Error(verifyBody.error ?? 'Biometric signature could not be verified.');
	}

	const verifiedAt = verifyBody.verifiedAt ?? new Date().toISOString();
	const resolvedUserId = verifyBody.userId ?? expectedUserId ?? stored?.userId;
	const deviceLabel = verifyBody.deviceLabel ?? stored?.deviceLabel ?? detectBiometricDeviceLabel();

	writeStoredBiometric(
		{
			userId: resolvedUserId,
			credentialId: stored?.credentialId ?? bufferToBase64Url(assertion.rawId),
			deviceLabel,
			createdAt: stored?.createdAt ?? verifiedAt,
			lastVerifiedAt: verifiedAt
		},
		resolvedUserId
	);
	if (resolvedUserId) markBiometricSessionUnlocked(resolvedUserId);

	return {
		verifiedAt,
		userId: resolvedUserId,
		userName: verifyBody.userName,
		deviceLabel
	};
}

export async function verifyOrEnrollBiometrics(userId: string): Promise<{
	verifiedAt: string;
	deviceLabel: string;
	enrolledNow: boolean;
}> {
	const existing = readStoredBiometric(userId);
	if (existing?.credentialId) {
		try {
			const verified = await authenticateWithBiometrics(userId);
			markBiometricSessionUnlocked(userId);
			return {
				verifiedAt: verified.verifiedAt,
				deviceLabel: verified.deviceLabel ?? existing.deviceLabel,
				enrolledNow: false
			};
		} catch (err) {
			if (!(err instanceof PasskeyNotEnrolledError)) {
				throw err;
			}
			// Stale local passkey reference — clear and enroll cleanly on this device.
			writeStoredBiometric(null, userId);
		}
	}

	const enrolled = await enrollBiometricPasskey(userId);
	markBiometricSessionUnlocked(userId);
	return {
		verifiedAt: enrolled.lastVerifiedAt ?? enrolled.createdAt,
		deviceLabel: enrolled.deviceLabel,
		enrolledNow: true
	};
}

export async function disableBiometricPasskey(userId?: string): Promise<void> {
	writeStoredBiometric(null, userId);
	clearBiometricSessionUnlocked();
	await fetch('/api/auth/biometric/register', { method: 'DELETE' }).catch(() => undefined);
}
