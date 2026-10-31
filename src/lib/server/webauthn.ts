import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
	createPublicKey,
	createVerify,
	randomBytes,
	timingSafeEqual
} from 'node:crypto';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export interface StoredBiometricCredential {
	credentialId: string;
	publicKey: string; // base64url SPKI DER
	algorithm: number; // -7 (ES256) or -257 (RS256)
	counter: number;
	deviceLabel: string;
	userId: string;
	userName: string;
	userHandle?: string;
	userEmail?: string;
	createdAt: string;
	lastUsedAt?: string;
}

export const BIOMETRIC_VAULT_COOKIE = 'owltside_bio_vault';
export const BIOMETRIC_UNLOCKED_COOKIE = 'owltside_bio_unlocked';
export const BIOMETRIC_JUST_AUTHED_COOKIE = 'owltside_just_authed';

function resolveSecret(): Buffer {
	const raw =
		privateEnv.BIOMETRIC_SECRET ||
		privateEnv.SUPABASE_JWT_SECRET ||
		publicEnv.PUBLIC_SUPABASE_ANON_KEY ||
		privateEnv.SUPABASE_ANON_KEY ||
		'owltside-biometric-webauthn-secret-key-v1';
	return createHash('sha256').update(raw).digest();
}

export function toBase64Url(buf: Buffer | Uint8Array): string {
	return Buffer.from(buf)
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '');
}

export function fromBase64Url(value: string): Buffer {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
	return Buffer.from(normalized + pad, 'base64');
}

export function issueWebAuthnChallenge(
	purpose: 'register' | 'authenticate',
	userId?: string | null
): { challenge: string; challengeToken: string } {
	const challenge = toBase64Url(randomBytes(32));
	const payload = JSON.stringify({
		challenge,
		purpose,
		userId: userId ?? null,
		exp: Date.now() + 5 * 60_000
	});
	const body = toBase64Url(Buffer.from(payload, 'utf8'));
	const sig = toBase64Url(createHmac('sha256', resolveSecret()).update(body).digest());
	return { challenge, challengeToken: `${body}.${sig}` };
}

export function verifyWebAuthnChallengeToken(
	token: string,
	expectedPurpose: 'register' | 'authenticate'
): { challenge: string; userId: string | null } {
	const [body, sig] = String(token ?? '').split('.');
	if (!body || !sig) throw new Error('Invalid biometric challenge token.');
	const expectedSig = createHmac('sha256', resolveSecret()).update(body).digest();
	const actualSig = fromBase64Url(sig);
	if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
		throw new Error('Biometric challenge signature mismatch.');
	}
	const parsed = JSON.parse(fromBase64Url(body).toString('utf8')) as {
		challenge?: string;
		purpose?: string;
		userId?: string | null;
		exp?: number;
	};
	if (!parsed.challenge || parsed.purpose !== expectedPurpose) {
		throw new Error('Biometric challenge purpose mismatch.');
	}
	if (!parsed.exp || Date.now() > parsed.exp) {
		throw new Error('Biometric prompt expired. Please try again.');
	}
	return { challenge: parsed.challenge, userId: parsed.userId ?? null };
}

/**
 * Convert an uncompressed P-256 EC point (0x04 || X[32] || Y[32]) into SubjectPublicKeyInfo DER.
 */
function p256PointToSpkiDer(x: Buffer, y: Buffer): Buffer {
	if (x.length !== 32 || y.length !== 32) {
		throw new Error('Invalid P-256 coordinate length.');
	}
	// ASN.1 SPKI header for id-ecPublicKey + prime256v1 uncompressed 65-byte point
	const prefix = Buffer.from(
		'3059301306072a8648ce3d020106082a8648ce3d03010703420004',
		'hex'
	);
	return Buffer.concat([prefix, x, y]);
}

/**
 * Minimal CBOR decoder sufficient to extract COSE_Key from WebAuthn attestationObject
 * on browsers that do not implement response.getPublicKey().
 */
function decodeCborItem(buf: Buffer, offset = 0): { value: unknown; next: number } {
	if (offset >= buf.length) throw new Error('Unexpected end of CBOR buffer');
	const first = buf[offset];
	const major = first >> 5;
	const info = first & 0x1f;
	let pos = offset + 1;

	function readLength(): number {
		if (info < 24) return info;
		if (info === 24) return buf[pos++];
		if (info === 25) {
			const v = buf.readUInt16BE(pos);
			pos += 2;
			return v;
		}
		if (info === 26) {
			const v = buf.readUInt32BE(pos);
			pos += 4;
			return v;
		}
		if (info === 27) {
			const hi = buf.readUInt32BE(pos);
			const lo = buf.readUInt32BE(pos + 4);
			pos += 8;
			return hi * 0x100000000 + lo;
		}
		throw new Error('Unsupported indefinite CBOR length');
	}

	if (major === 0) return { value: readLength(), next: pos };
	if (major === 1) return { value: -1 - readLength(), next: pos };
	if (major === 2) {
		const len = readLength();
		const slice = buf.subarray(pos, pos + len);
		return { value: slice, next: pos + len };
	}
	if (major === 3) {
		const len = readLength();
		const str = buf.subarray(pos, pos + len).toString('utf8');
		return { value: str, next: pos + len };
	}
	if (major === 4) {
		const len = readLength();
		const arr: unknown[] = [];
		let cur = pos;
		for (let i = 0; i < len; i++) {
			const decoded = decodeCborItem(buf, cur);
			arr.push(decoded.value);
			cur = decoded.next;
		}
		return { value: arr, next: cur };
	}
	if (major === 5) {
		const len = readLength();
		const map = new Map<unknown, unknown>();
		let cur = pos;
		for (let i = 0; i < len; i++) {
			const k = decodeCborItem(buf, cur);
			const v = decodeCborItem(buf, k.next);
			map.set(k.value, v.value);
			cur = v.next;
		}
		return { value: map, next: cur };
	}
	// Booleans / null
	if (major === 7) {
		if (info === 20) return { value: false, next: pos };
		if (info === 21) return { value: true, next: pos };
		if (info === 22) return { value: null, next: pos };
	}
	throw new Error(`Unsupported CBOR major type ${major}`);
}

export function extractSpkiFromAttestation(
	attestationObjectB64: string
): { publicKeySpki: string; algorithm: number; counter: number } {
	const attBuf = fromBase64Url(attestationObjectB64);
	const decoded = decodeCborItem(attBuf).value as Map<unknown, unknown>;
	const authData = decoded.get('authData') as Buffer | undefined;
	if (!authData || authData.length < 55) {
		throw new Error('Invalid WebAuthn authenticator data.');
	}
	const flags = authData[32];
	const hasAttestedCredData = (flags & 0x40) !== 0;
	if (!hasAttestedCredData) {
		throw new Error('Attestation response missing credential public key.');
	}
	const counter = authData.readUInt32BE(33);
	const credIdLen = authData.readUInt16BE(53);
	const coseOffset = 55 + credIdLen;
	const coseMap = decodeCborItem(authData, coseOffset).value as Map<unknown, unknown>;
	const alg = Number(coseMap.get(3) ?? -7);
	const kty = Number(coseMap.get(1) ?? 2);
	if (kty === 2 && alg === -7) {
		const x = coseMap.get(-2) as Buffer;
		const y = coseMap.get(-3) as Buffer;
		const spki = p256PointToSpkiDer(Buffer.from(x), Buffer.from(y));
		return { publicKeySpki: toBase64Url(spki), algorithm: -7, counter };
	}
	if (kty === 3 && alg === -257) {
		const n = Buffer.from(coseMap.get(-1) as Buffer);
		const e = Buffer.from(coseMap.get(-2) as Buffer);
		const jwkKey = createPublicKey({
			key: {
				kty: 'RSA',
				n: toBase64Url(n),
				e: toBase64Url(e)
			},
			format: 'jwk'
		});
		const spki = jwkKey.export({ type: 'spki', format: 'der' });
		return { publicKeySpki: toBase64Url(spki), algorithm: -257, counter };
	}
	throw new Error(`Unsupported passkey key type (${kty}) or algorithm (${alg}).`);
}

export function verifyClientData(
	clientDataJSONB64: string,
	expectedType: 'webauthn.create' | 'webauthn.get',
	expectedChallenge: string,
	expectedOrigin: string
): void {
	const raw = fromBase64Url(clientDataJSONB64).toString('utf8');
	const clientData = JSON.parse(raw) as {
		type?: string;
		challenge?: string;
		origin?: string;
	};
	if (clientData.type !== expectedType) {
		throw new Error('Unexpected WebAuthn ceremony type.');
	}
	// Normalize base64url padding differences if any
	const actualChallenge = toBase64Url(fromBase64Url(clientData.challenge ?? ''));
	const targetChallenge = toBase64Url(fromBase64Url(expectedChallenge));
	if (actualChallenge !== targetChallenge) {
		throw new Error('Biometric challenge mismatch.');
	}
	if (expectedOrigin && clientData.origin) {
		const actualUrl = new URL(clientData.origin);
		const expectedUrl = new URL(expectedOrigin);
		if (actualUrl.hostname !== expectedUrl.hostname) {
			throw new Error('Biometric origin hostname mismatch.');
		}
	}
}

export function verifyWebAuthnAssertion(input: {
	publicKeySpki: string;
	clientDataJSON: string;
	authenticatorData: string;
	signature: string;
	expectedChallenge: string;
	expectedOrigin: string;
}): { counter: number; userVerified: boolean } {
	verifyClientData(
		input.clientDataJSON,
		'webauthn.get',
		input.expectedChallenge,
		input.expectedOrigin
	);

	const authData = fromBase64Url(input.authenticatorData);
	if (authData.length < 37) {
		throw new Error('Invalid authenticatorData length.');
	}
	const flags = authData[32];
	const userPresent = (flags & 0x01) !== 0;
	const userVerified = (flags & 0x04) !== 0;
	if (!userPresent) {
		throw new Error('Biometric presence check failed.');
	}

	const clientDataHash = createHash('sha256')
		.update(fromBase64Url(input.clientDataJSON))
		.digest();
	const signedPayload = Buffer.concat([authData, clientDataHash]);

	const pubKey = createPublicKey({
		key: fromBase64Url(input.publicKeySpki),
		format: 'der',
		type: 'spki'
	});

	const verifier = createVerify('SHA256');
	verifier.update(signedPayload);
	verifier.end();

	const valid = verifier.verify(pubKey, fromBase64Url(input.signature));
	if (!valid) {
		throw new Error('Biometric cryptographic signature invalid.');
	}

	const counter = authData.readUInt32BE(33);
	return { counter, userVerified };
}

export function encryptBiometricVault(credentials: StoredBiometricCredential[]): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', resolveSecret(), iv);
	const plaintext = Buffer.from(JSON.stringify(credentials.slice(0, 5)), 'utf8');
	const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(encrypted)}`;
}

export function decryptBiometricVault(cookieValue: string | undefined): StoredBiometricCredential[] {
	if (!cookieValue) return [];
	try {
		const [ivB64, tagB64, encB64] = cookieValue.split('.');
		if (!ivB64 || !tagB64 || !encB64) return [];
		const decipher = createDecipheriv('aes-256-gcm', resolveSecret(), fromBase64Url(ivB64));
		decipher.setAuthTag(fromBase64Url(tagB64));
		const decrypted = Buffer.concat([
			decipher.update(fromBase64Url(encB64)),
			decipher.final()
		]);
		const parsed = JSON.parse(decrypted.toString('utf8'));
		return Array.isArray(parsed) ? (parsed as StoredBiometricCredential[]) : [];
	} catch {
		return [];
	}
}
