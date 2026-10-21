import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import type { AdminRole, AdminSession, AdminTier } from '$admin/types';

/**
 * Credential + session layer for the admin workspace.
 *
 * Production deployments must set ADMIN_EMAIL, ADMIN_PASSWORD (16+ chars) and
 * ADMIN_SESSION_SECRET. Sessions are stateless HMAC-signed tokens in an
 * HttpOnly, SameSite=Strict cookie. Hardware-key (WebAuthn) sign-in and SSO
 * can replace `authenticate()` without touching the rest of the app.
 */

export const SESSION_COOKIE = 'owl_admin_session';
const FALLBACK_SECRET = 'owltside-admin-dev-secret-do-not-use-in-production';
const SESSION_HOURS = 2;
const REMEMBER_HOURS = 12;
const MAX_FAILURES = 5;
const WINDOW_MINUTES = 10;

export function isDemoMode(): boolean {
	return !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD;
}

export function sessionSecret(): string {
	return process.env.ADMIN_SESSION_SECRET || FALLBACK_SECRET;
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

function constantTimeEqual(a: string, b: string): boolean {
	const left = createHash('sha256').update(a).digest();
	const right = createHash('sha256').update(b).digest();
	return timingSafeEqual(left, right);
}

const DEMO_EMAIL = 'admin@owltside.com';
const DEMO_ROLE: AdminRole = 'Super Admin';
const DEMO_TIER: AdminTier = 0;

export function adminIdentity() {
	return {
		name: process.env.ADMIN_NAME || 'Tomiwa A.',
		email: process.env.ADMIN_EMAIL || DEMO_EMAIL,
		role: (process.env.ADMIN_ROLE as AdminRole | undefined) || DEMO_ROLE,
		tier: (process.env.ADMIN_TIER ? Number(process.env.ADMIN_TIER) : DEMO_TIER) as AdminTier
	};
}

export function authenticate({ email, password, remember, ip }: LoginInput): LoginResult {
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
	const passwordOk = isDemoMode() ? password.length >= 16 : password.length >= 16 && constantTimeEqual(password, process.env.ADMIN_PASSWORD ?? '');
	const emailOk = constantTimeEqual(email.trim().toLowerCase(), identity.email.toLowerCase());

	if (!passwordOk || !emailOk) {
		registerFailure(ip);
		const remaining = rateLimitRemaining(ip);
		return {
			ok: false,
			status: 401,
			error:
				isDemoMode()
					? `Invalid credentials. Demo passphrase must be at least 16 characters. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
					: `Invalid credentials. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
		};
	}

	clearFailures(ip);
	const hours = remember ? REMEMBER_HOURS : SESSION_HOURS;
	return {
		ok: true,
		expiresAt: new Date(now + hours * 3_600_000),
		session: {
			id: `adm-session-${now.toString(36)}`,
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
			auth: 'password+totp',
			ip,
			demo: isDemoMode()
		}
	};
}

/** Demo-only simulated hardware-key sign in. */
export function authenticateWithKey(remember: boolean, ip: string): { session: Omit<AdminSession, 'issuedAt' | 'expiresAt'>; expiresAt: Date } {
	const identity = adminIdentity();
	const hours = remember ? REMEMBER_HOURS : SESSION_HOURS;
	return {
		session: {
			id: `adm-key-${Date.now().toString(36)}`,
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
			auth: 'webauthn',
			ip,
			demo: true
		},
		expiresAt: new Date(Date.now() + hours * 3_600_000)
	};
}

function b64url(input: Buffer | string): string {
	return Buffer.from(input).toString('base64url');
}

export function signSession(session: AdminSession): string {
	const payload = b64url(JSON.stringify(session));
	const signature = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
	return `${payload}.${signature}`;
}

export function verifySession(token: string | undefined): AdminSession | null {
	if (!token) return null;
	const [payload, signature] = token.split('.');
	if (!payload || !signature) return null;
	const expected = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
	if (expected.length !== signature.length) return null;
	if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
	try {
		const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AdminSession;
		if (!session?.expiresAt || new Date(session.expiresAt).getTime() < Date.now()) return null;
		return session;
	} catch {
		return null;
	}
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
	return verifySession(cookies.get(SESSION_COOKIE));
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
