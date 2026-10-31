import {
	createCipheriv,
	createECDH,
	createHmac,
	createPrivateKey,
	randomBytes,
	sign
} from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export interface PushSubscriptionRecord {
	endpoint: string;
	p256dh: string;
	auth: string;
}

export interface WebPushPayload {
	title: string;
	body: string;
	url?: string;
	tag?: string;
	silent?: boolean;
}

// In-process fallback subscription cache for single-instance/demo environments
// when SUPABASE_SERVICE_ROLE_KEY is not configured in the public web app.
const memorySubscriptions = new Map<string, Map<string, PushSubscriptionRecord>>();

export function rememberPushSubscription(userId: string, sub: PushSubscriptionRecord): void {
	if (!userId || !sub.endpoint || !sub.p256dh || !sub.auth) return;
	let byEndpoint = memorySubscriptions.get(userId);
	if (!byEndpoint) {
		byEndpoint = new Map();
		memorySubscriptions.set(userId, byEndpoint);
	}
	byEndpoint.set(sub.endpoint, sub);
}

export function forgetPushSubscription(userId: string, endpoint?: string): void {
	if (!userId) return;
	if (!endpoint) {
		memorySubscriptions.delete(userId);
		return;
	}
	memorySubscriptions.get(userId)?.delete(endpoint);
}

export function toBase64Url(buf: Uint8Array | Buffer): string {
	return Buffer.from(buf)
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '');
}

export function fromBase64Url(input: string): Buffer {
	const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
	const pad = (4 - (normalized.length % 4)) % 4;
	return Buffer.from(normalized + '='.repeat(pad), 'base64');
}

const P256_ORDER = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');

/**
 * Resolve VAPID P-256 keypair: uses explicit PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 * when provided, otherwise deterministically derives a valid P-256 keypair from server
 * secrets so W3C PushManager subscriptions work out of the box across serverless instances.
 */
export function resolveVapidKeys(): { publicKey: string; privateKey: string; subject: string } {
	const explicitPublic = (
		publicEnv.PUBLIC_VAPID_PUBLIC_KEY ||
		privateEnv.VAPID_PUBLIC_KEY ||
		''
	).trim();
	const explicitPrivate = (privateEnv.VAPID_PRIVATE_KEY || '').trim();
	const subject = (privateEnv.VAPID_SUBJECT || 'mailto:support@owltside.com').trim();

	if (explicitPublic && explicitPrivate) {
		return { publicKey: explicitPublic, privateKey: explicitPrivate, subject };
	}

	const seed =
		privateEnv.BIOMETRIC_VAULT_SECRET ||
		privateEnv.SUPABASE_SERVICE_ROLE_KEY ||
		publicEnv.PUBLIC_SUPABASE_ANON_KEY ||
		'owltside-vapid-default-seed-v1';

	let counter = 0;
	while (counter < 16) {
		const candidate = createHmac('sha256', seed)
			.update(`owltside-vapid-p256-v1:${counter}`)
			.digest();
		const scalar = BigInt(`0x${candidate.toString('hex')}`);
		if (scalar > 0n && scalar < P256_ORDER) {
			const ecdh = createECDH('prime256v1');
			ecdh.setPrivateKey(candidate);
			const pub = ecdh.getPublicKey(); // 65-byte uncompressed 0x04 || X || Y
			return {
				publicKey: toBase64Url(pub),
				privateKey: toBase64Url(candidate),
				subject
			};
		}
		counter++;
	}
	throw new Error('Failed to derive VAPID keypair.');
}

export function createVapidAuthorizationHeader(
	endpoint: string,
	vapid = resolveVapidKeys()
): string {
	const aud = new URL(endpoint).origin;
	const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

	const jwtHeader = toBase64Url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' }), 'utf8'));
	const jwtPayload = toBase64Url(
		Buffer.from(JSON.stringify({ aud, exp, sub: vapid.subject }), 'utf8')
	);
	const unsignedToken = `${jwtHeader}.${jwtPayload}`;

	const rawPriv = fromBase64Url(vapid.privateKey);
	const rawPub = fromBase64Url(vapid.publicKey);
	if (rawPub.length !== 65 || rawPub[0] !== 0x04 || rawPriv.length !== 32) {
		throw new Error('Invalid VAPID P-256 key lengths.');
	}
	const keyObj = createPrivateKey({
		key: {
			kty: 'EC',
			crv: 'P-256',
			x: toBase64Url(rawPub.subarray(1, 33)),
			y: toBase64Url(rawPub.subarray(33, 65)),
			d: toBase64Url(rawPriv)
		},
		format: 'jwk'
	});

	const signature = sign('sha256', Buffer.from(unsignedToken, 'utf8'), {
		key: keyObj,
		dsaEncoding: 'ieee-p1363'
	});

	return `vapid t=${unsignedToken}.${toBase64Url(signature)}, k=${vapid.publicKey}`;
}

function hkdfExtract(salt: Buffer, ikm: Buffer): Buffer {
	return createHmac('sha256', salt).update(ikm).digest();
}

function hkdfExpand(prk: Buffer, info: Buffer, length: number): Buffer {
	const okm = createHmac('sha256', prk)
		.update(Buffer.concat([info, Buffer.from([0x01])]))
		.digest();
	return okm.subarray(0, length);
}

/**
 * Encrypt a UTF-8 JSON payload per RFC 8291 (`aes128gcm` Content-Encoding for Web Push).
 */
export function encryptWebPushPayload(
	plaintextUtf8: string,
	clientP256dhB64: string,
	clientAuthB64: string
): Buffer {
	const uaPublic = fromBase64Url(clientP256dhB64);
	const authSecret = fromBase64Url(clientAuthB64);
	if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
		throw new Error('Invalid subscriber p256dh public key.');
	}
	if (authSecret.length < 16) {
		throw new Error('Invalid subscriber auth secret.');
	}

	const asEcdh = createECDH('prime256v1');
	asEcdh.generateKeys();
	const asPublic = asEcdh.getPublicKey(); // 65 bytes
	const sharedSecret = asEcdh.computeSecret(uaPublic); // 32 bytes
	const salt = randomBytes(16);

	const prkKey = hkdfExtract(authSecret, sharedSecret);
	const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublic, asPublic]);
	const ikm = hkdfExpand(prkKey, keyInfo, 32);

	const prk = hkdfExtract(salt, ikm);
	const cek = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
	const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);

	const record = Buffer.concat([Buffer.from(plaintextUtf8, 'utf8'), Buffer.from([0x02])]);
	const cipher = createCipheriv('aes-128-gcm', cek, nonce);
	const encrypted = Buffer.concat([cipher.update(record), cipher.final()]);
	const tag = cipher.getAuthTag();

	const rsBuf = Buffer.alloc(4);
	rsBuf.writeUInt32BE(4096, 0);
	const header = Buffer.concat([salt, rsBuf, Buffer.from([asPublic.length]), asPublic]);

	return Buffer.concat([header, encrypted, tag]);
}

let cachedServiceClient: SupabaseClient | null | undefined;

function getServiceClient(): SupabaseClient | null {
	if (cachedServiceClient !== undefined) return cachedServiceClient;
	const url = (publicEnv.PUBLIC_SUPABASE_URL || privateEnv.SUPABASE_URL || '').trim();
	const serviceKey = (privateEnv.SUPABASE_SERVICE_ROLE_KEY || '').trim();
	if (!url || !serviceKey) {
		cachedServiceClient = null;
		return null;
	}
	cachedServiceClient = createClient(url, serviceKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	return cachedServiceClient;
}

async function listSubscriptionsForUser(userId: string): Promise<PushSubscriptionRecord[]> {
	const merged = new Map<string, PushSubscriptionRecord>();
	const mem = memorySubscriptions.get(userId);
	if (mem) {
		for (const [ep, rec] of mem) merged.set(ep, rec);
	}

	const adminDb = getServiceClient();
	if (adminDb) {
		const { data, error } = await adminDb
			.from('push_subscriptions')
			.select('endpoint,p256dh,auth')
			.eq('user_id', userId)
			.limit(10);
		if (!error && Array.isArray(data)) {
			for (const row of data) {
				if (row?.endpoint && row?.p256dh && row?.auth) {
					merged.set(String(row.endpoint), {
						endpoint: String(row.endpoint),
						p256dh: String(row.p256dh),
						auth: String(row.auth)
					});
				}
			}
		}
	}

	return [...merged.values()];
}

export async function sendWebPushToUser(
	recipientUserId: string,
	payload: WebPushPayload
): Promise<number> {
	if (!recipientUserId) return 0;
	let subs: PushSubscriptionRecord[] = [];
	try {
		subs = await listSubscriptionsForUser(recipientUserId);
	} catch {
		return 0;
	}
	if (subs.length === 0) return 0;

	const vapid = resolveVapidKeys();
	const jsonPayload = JSON.stringify({
		title: payload.title,
		body: payload.body,
		url: payload.url ?? '/inbox',
		tag: payload.tag ?? `owltside-${Date.now()}`,
		silent: Boolean(payload.silent ?? false),
		renotify: true
	});

	let delivered = 0;
	const adminDb = getServiceClient();

	await Promise.allSettled(
		subs.map(async (sub) => {
			const body = encryptWebPushPayload(jsonPayload, sub.p256dh, sub.auth);
			const authorization = createVapidAuthorizationHeader(sub.endpoint, vapid);
			const response = await fetch(sub.endpoint, {
				method: 'POST',
				headers: {
					Authorization: authorization,
					'Content-Encoding': 'aes128gcm',
					'Content-Type': 'application/octet-stream',
					'Content-Length': String(body.byteLength),
					TTL: '86400',
					Urgency: 'high'
				},
				body: new Uint8Array(body)
			});
			if (response.ok) {
				delivered += 1;
			} else if (response.status === 404 || response.status === 410) {
				forgetPushSubscription(recipientUserId, sub.endpoint);
				if (adminDb) {
					await adminDb
						.from('push_subscriptions')
						.delete()
						.eq('user_id', recipientUserId)
						.eq('endpoint', sub.endpoint)
						.then(
							() => undefined,
							() => undefined
						);
				}
			}
		})
	);

	return delivered;
}
