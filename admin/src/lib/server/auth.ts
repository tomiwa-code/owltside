import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import type { AdminSession } from '$admin/types';

// Load server-only local configuration independently of any database client.
if (process.env.NODE_ENV !== 'production') {
	for (const directory of [process.cwd(), resolve(process.cwd(), '..')]) {
		for (const file of [`.env.${process.env.NODE_ENV || 'development'}.local`, '.env.local', `.env.${process.env.NODE_ENV || 'development'}`, '.env']) {
			loadDotenv({ path: resolve(directory, file), override: false });
		}
	}
}

/** Single server-configured admin login. No Auth provider or database required.
 * Defaults are intentionally shared; override them for a production deployment.
 */
export const SESSION_COOKIE = 'owl_admin_session';
const FALLBACK_SECRET = 'owltside-admin-dev-secret-do-not-use-in-production';
const SESSION_HOURS = 2;
const REMEMBER_HOURS = 12;
const MAX_FAILURES = 5;
const WINDOW_MINUTES = 10;

export function sessionSecret(): string {
	return process.env.ADMIN_SESSION_SECRET || FALLBACK_SECRET;
}

export function adminIdentity() {
	return {
		email: (process.env.ADMIN_EMAIL?.trim() || 'admin@owltside.com').toLowerCase(),
		name: process.env.ADMIN_NAME?.trim() || 'Owltside Admin',
		role: 'Super Admin' as const,
		tier: 0 as const
	};
}

function adminPassword(): string {
	return process.env.ADMIN_PASSWORD || 'owltside-admin-2026';
}

function constantTimeEqual(a: string, b: string): boolean {
	return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

// Credential rotation invalidates old cookies without putting a password or a
// password verifier in the browser. The production signing secret is required.
function sessionSigningKey(): Buffer {
	return createHmac('sha256', sessionSecret())
		.update(JSON.stringify([adminIdentity().email, adminPassword()])).digest();
}

interface LoginInput {
	email: string;
	password: string;
	remember: boolean;
	ip: string;
}

interface LoginResult {
	ok: boolean;
	error?: string;
	session?: Omit<AdminSession, 'issuedAt' | 'expiresAt'>;
	expiresAt?: Date;
	status?: number;
}

interface Attempt {
	count: number;
	resetAt: number;
}

const attempts = new Map<string, Attempt>();

function pruneAttempts(now: number) {
	for (const [ip, attempt] of attempts) {
		if (attempt.resetAt < now) attempts.delete(ip);
	}
}

export function rateLimitRemaining(ip: string): number {
	const now = Date.now();
	pruneAttempts(now);
	const attempt = attempts.get(ip);
	if (!attempt) return MAX_FAILURES;
	return Math.max(0, MAX_FAILURES - attempt.count);
}

function registerFailure(ip: string) {
	const now = Date.now();
	const existing = attempts.get(ip);
	if (!existing || existing.resetAt < now) {
		attempts.set(ip, { count: 1, resetAt: now + WINDOW_MINUTES * 60_000 });
		return;
	}
	existing.count += 1;
}

function clearFailures(ip: string) {
	attempts.delete(ip);
}

export async function authenticate({ email, password, remember, ip }: LoginInput): Promise<LoginResult> {
	const now = Date.now();
	pruneAttempts(now);
	const attempt = attempts.get(ip);
	if (attempt && attempt.count >= MAX_FAILURES) {
		const minutes = Math.max(1, Math.ceil((attempt.resetAt - now) / 60_000));
		return {
			ok: false,
			status: 429,
			error: `Too many attempts. This device is locked for ${minutes} minute${minutes === 1 ? '' : 's'}.`
		};
	}

	const identity = adminIdentity();
	const emailOk = constantTimeEqual(email.trim().toLowerCase(), identity.email);
	const passwordOk = constantTimeEqual(password, adminPassword());
	if (!emailOk || !passwordOk) {
		registerFailure(ip);
		const remaining = rateLimitRemaining(ip);
		return {
			ok: false,
			status: 401,
			error: `Email or security password is incorrect. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
		};
	}

	clearFailures(ip);
	const hours = remember ? REMEMBER_HOURS : SESSION_HOURS;
	return {
		ok: true,
		expiresAt: new Date(now + hours * 3_600_000),
		session: {
			id: randomUUID(),
			email: identity.email,
			name: identity.name,
			initials: identity.name
				.split(/\s+/)
				.map((part) => part[0])
				.join('')
				.slice(0, 2)
				.toUpperCase(),
			role: identity.role,
			tier: identity.tier,
			auth: 'password',
			ip,
			demo: false
		}
	};
}

function b64url(input: Buffer | string): string {
	return Buffer.from(input).toString('base64url');
}

export function signSession(session: AdminSession): string {
	const payload = b64url(JSON.stringify(session));
	const signature = createHmac('sha256', sessionSigningKey()).update(payload).digest('base64url');
	return `${payload}.${signature}`;
}

export function verifySession(token: string | undefined): AdminSession | null {
	if (!token) return null;
	const [payload, signature, extra] = token.split('.');
	if (extra !== undefined) return null;
	if (!payload || !signature) return null;
	const expected = createHmac('sha256', sessionSigningKey()).update(payload).digest('base64url');
	const signatureBytes = Buffer.from(signature);
	const expectedBytes = Buffer.from(expected);
	if (expectedBytes.length !== signatureBytes.length) return null;
	if (!timingSafeEqual(expectedBytes, signatureBytes)) return null;
	try {
		const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AdminSession;
		if (!Number.isFinite(Date.parse(session?.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) return null;
		return session;
	} catch {
		return null;
	}
}

/**
 * Whether the browser is on HTTPS.
 *
 * The dev server is routinely viewed through an HTTPS preview proxy that may
 * append to (`https,http`), rewrite, or strip the forwarded headers entirely.
 * Any affirmative signal wins; absence of a signal means plain HTTP, which is
 * only correct for loopback/LAN development. Getting this wrong is expensive:
 * a `SameSite=Lax` cookie is dropped inside an embedded cross-site preview
 * iframe, so sign-in appears to succeed and then silently bounce back.
 */
export function isSecureRequest(request: Request, url: URL): boolean {
	if (url.protocol === 'https:') return true;

	const proto = request.headers.get('x-forwarded-proto') ?? '';
	if (proto.split(',').some((part) => part.trim().toLowerCase() === 'https')) return true;

	if ((request.headers.get('x-forwarded-ssl') ?? '').toLowerCase() === 'on') return true;
	if (/proto\s*=\s*"?https/i.test(request.headers.get('forwarded') ?? '')) return true;

	// The browser's own view of the page, when the proxy forwards it.
	for (const header of ['origin', 'referer']) {
		const value = request.headers.get(header);
		if (value && value.toLowerCase().startsWith('https://')) return true;
	}

	return false;
}

export function writeSessionCookie(
	cookies: Cookies,
	session: AdminSession,
	options: { https?: boolean } = {}
): void {
	const production = process.env.NODE_ENV === 'production';
	const https = production || options.https === true;
	// Production is a strict, first-party admin console. Dev servers are often
	// viewed inside an embedded HTTPS preview iframe, where SameSite=Strict (and
	// unpartitioned) cookies are dropped as third-party — a partitioned cookie
	// keeps the session scoped to that top-level site without relaxing prod.
	const embeddedPreview = https && !production;
	cookies.set(SESSION_COOKIE, signSession(session), {
		path: '/',
		httpOnly: true,
		sameSite: embeddedPreview ? 'none' : production ? 'strict' : 'lax',
		secure: https,
		partitioned: embeddedPreview,
		maxAge: Math.max(60, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000))
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function readSession(cookies: Cookies): AdminSession | null {
	const session = verifySession(cookies.get(SESSION_COOKIE));
	// Database-backed and earlier legacy sessions must sign in again.
	if (!session || session.auth !== 'password') return null;
	const identity = adminIdentity();
	if (session.email !== identity.email) return null;
	return { ...session, ...identity,
		initials: identity.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() };
}

// ── Authorisation ladder ────────────────────────────────────────────────────

/** Tier 3 is read-only; tier 2 can operate; tier 1 configures; tier 0 governs. */
export function canMutate(session: AdminSession): boolean {
	return session.tier <= 2;
}
export function canConfigure(session: AdminSession): boolean {
	return session.tier <= 1;
}
export function isSuperAdmin(session: AdminSession): boolean {
	return session.tier === 0;
}

export class AuthzError extends Error {
	status: number;
	constructor(message: string, status = 403) {
		super(message);
		this.status = status;
	}
}

export function requireMutation(session: AdminSession | null): AdminSession {
	if (!session) throw new AuthzError('Sign in required.', 401);
	if (!canMutate(session)) throw new AuthzError('Read-only auditors cannot change platform state.', 403);
	return session;
}

export function requireConfigure(session: AdminSession | null): AdminSession {
	if (!session) throw new AuthzError('Sign in required.', 401);
	if (!canConfigure(session)) throw new AuthzError('This action requires Tier 1 (Finance & Treasury) privileges.', 403);
	return session;
}

export function requireSuper(session: AdminSession | null): AdminSession {
	if (!session) throw new AuthzError('Sign in required.', 401);
	if (!isSuperAdmin(session)) throw new AuthzError('This action requires a Tier 0 Super Admin.', 403);
	return session;
}

/** Every authenticated administrator (including Tier 3 auditors) may read and export. */
export function requireAudit(session: AdminSession | null): AdminSession {
	if (!session) throw new AuthzError('Sign in required.', 401);
	return session;
}
