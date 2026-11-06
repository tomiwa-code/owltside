import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import type { AdminSession } from '$admin/types';
import {
	AdminSchemaError,
	findAdminByEmail,
	getAdminAccess,
	lookupAdminByUserId,
	type AdminAccess
} from './admin-access';

if (process.env.NODE_ENV !== 'production') {
	for (const directory of [process.cwd(), resolve(process.cwd(), '..')]) {
		for (const file of [
			`.env.${process.env.NODE_ENV || 'development'}.local`,
			'.env.local',
			`.env.${process.env.NODE_ENV || 'development'}`,
			'.env'
		]) {
			loadDotenv({ path: resolve(directory, file), override: false });
		}
	}
}

export const SESSION_COOKIE = 'owl_admin_session';
export const OAUTH_PKCE_COOKIE = 'owl_admin_oauth_pkce';
export const OAUTH_NEXT_COOKIE = 'owl_admin_oauth_next';
export const ADMIN_ACCESS_DENIED_MESSAGE =
	'Access denied. Only administrators and super administrators can sign in to the Owltside Admin workspace.';

const FALLBACK_SECRET = 'owltside-admin-dev-secret-do-not-use-in-production';
const SESSION_HOURS = 2;
const REMEMBER_HOURS = 12;
const MAX_FAILURES = 5;
const WINDOW_MINUTES = 10;
const OAUTH_MAX_AGE_SECONDS = 10 * 60;

export function sessionSecret(): string {
	return process.env.ADMIN_SESSION_SECRET || FALLBACK_SECRET;
}

function sessionSigningKey(): Buffer {
	return createHmac('sha256', sessionSecret()).update('owltside-admin-session-v2').digest();
}

function resolveSupabaseUrl(): string {
	return (
		process.env.PUBLIC_SUPABASE_URL ||
		process.env.SUPABASE_URL ||
		process.env.VITE_SUPABASE_URL ||
		''
	).trim();
}

function resolveSupabaseAuthKey(): string {
	return (
		process.env.PUBLIC_SUPABASE_ANON_KEY ||
		process.env.SUPABASE_ANON_KEY ||
		process.env.VITE_SUPABASE_ANON_KEY ||
		process.env.SUPABASE_SERVICE_ROLE_KEY ||
		process.env.SUPABASE_SECRET_KEY ||
		''
	).trim();
}

export function createSupabaseOtpClient(): SupabaseClient {
	const url = resolveSupabaseUrl();
	const key = resolveSupabaseAuthKey();
	if (!url || !key) {
		throw new Error(
			'Supabase authentication is not configured. Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
		);
	}
	return createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
}

function readPkceMap(cookies: Cookies): Record<string, string> {
	const raw = cookies.get(OAUTH_PKCE_COOKIE);
	if (!raw) return {};
	try {
		const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as Record<string, string>;
		}
	} catch {
		// Ignore malformed verifier cookie
	}
	return {};
}

function writePkceMap(cookies: Cookies, store: Record<string, string>, https: boolean): void {
	const entries = Object.entries(store);
	if (entries.length === 0) {
		cookies.delete(OAUTH_PKCE_COOKIE, { path: '/' });
		return;
	}
	const production = process.env.NODE_ENV === 'production';
	const secure = production || https;
	const embeddedPreview = secure && !production;
	cookies.set(OAUTH_PKCE_COOKIE, Buffer.from(JSON.stringify(store), 'utf8').toString('base64url'), {
		path: '/',
		httpOnly: true,
		sameSite: embeddedPreview ? 'none' : 'lax',
		secure,
		partitioned: embeddedPreview,
		maxAge: OAUTH_MAX_AGE_SECONDS
	});
}

export function createSupabasePkceClient(
	cookies: Cookies,
	options: { https?: boolean } = {}
): SupabaseClient {
	const url = resolveSupabaseUrl();
	const key = resolveSupabaseAuthKey();
	if (!url || !key) {
		throw new Error(
			'Supabase authentication is not configured. Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
		);
	}
	const https = Boolean(options.https);
	const pkceStore = readPkceMap(cookies);

	return createClient(url, key, {
		auth: {
			flowType: 'pkce',
			persistSession: true,
			autoRefreshToken: false,
			detectSessionInUrl: false,
			storageKey: 'owl_admin_pkce',
			storage: {
				getItem(storageKey: string) {
					return storageKey.includes('code-verifier') ? (pkceStore[storageKey] ?? null) : null;
				},
				setItem(storageKey: string, value: string) {
					if (!storageKey.includes('code-verifier')) return;
					pkceStore[storageKey] = value;
					writePkceMap(cookies, pkceStore, https);
				},
				removeItem(storageKey: string) {
					if (!(storageKey in pkceStore)) return;
					delete pkceStore[storageKey];
					writePkceMap(cookies, pkceStore, https);
				}
			}
		}
	});
}

export function safeAdminNext(raw: string | null | undefined): string {
	if (!raw || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u0020]/.test(raw)) {
		return '/dashboard';
	}
	if (raw === '/' || raw.startsWith('/?') || raw.startsWith('/#')) return '/dashboard';
	if (raw.startsWith('/login') || raw.startsWith('/auth/')) return '/dashboard';
	return raw;
}

function initialsFor(name: string): string {
	const letters = name
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part[0])
		.join('')
		.slice(0, 2)
		.toUpperCase();
	return letters || 'AD';
}

function toSessionPayload(
	access: AdminAccess,
	email: string,
	auth: AdminSession['auth'],
	ip: string
): Omit<AdminSession, 'issuedAt' | 'expiresAt'> {
	return {
		id: randomUUID(),
		userId: access.userId,
		email,
		name: access.name,
		handle: access.handle || undefined,
		initials: initialsFor(access.name),
		role: access.role,
		tier: access.tier,
		auth,
		ip,
		demo: false
	};
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

function lockoutCheck(ip: string, now: number): { locked: true; error: string } | { locked: false } {
	pruneAttempts(now);
	const attempt = attempts.get(ip);
	if (attempt && attempt.count >= MAX_FAILURES) {
		const minutes = Math.max(1, Math.ceil((attempt.resetAt - now) / 60_000));
		return {
			locked: true,
			error: `Too many attempts. This device is locked for ${minutes} minute${minutes === 1 ? '' : 's'}.`
		};
	}
	return { locked: false };
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

export function resetRateLimitForTests(): void {
	attempts.clear();
}

export interface OtpRequestResult {
	ok: boolean;
	email?: string;
	error?: string;
	status?: number;
}

/**
 * Verify that `email` belongs to an active admin or superadmin, then send a
 * 6-digit Supabase OTP code (matching the main Owltside app sign-in).
 * Non-admin accounts are rejected immediately with HTTP 403.
 */
export async function requestAdminOtp(input: {
	email: string;
	ip: string;
	redirectTo?: string;
}): Promise<OtpRequestResult> {
	const now = Date.now();
	const lock = lockoutCheck(input.ip, now);
	if (lock.locked) return { ok: false, status: 429, error: lock.error };

	const email = input.email.trim().toLowerCase();
	if (!/^\S+@\S+\.\S+$/.test(email)) {
		return { ok: false, status: 400, error: 'Enter a valid email address.' };
	}

	try {
		const lookup = await findAdminByEmail(email);
		if (lookup.status === 'disabled') {
			registerFailure(input.ip);
			return { ok: false, status: 403, error: lookup.reason };
		}
		if (lookup.status !== 'ok') {
			registerFailure(input.ip);
			return { ok: false, status: 403, error: ADMIN_ACCESS_DENIED_MESSAGE };
		}

		const { error } = await createSupabaseOtpClient().auth.signInWithOtp({
			email,
			options: {
				shouldCreateUser: false,
				...(input.redirectTo ? { emailRedirectTo: input.redirectTo } : {})
			}
		});

		if (error) {
			if (error.status === 429 || /rate limit/i.test(error.message ?? '')) {
				return {
					ok: false,
					status: 429,
					error: 'Too many verification code requests. Wait a moment and try again.'
				};
			}
			return {
				ok: false,
				status: 400,
				error: error.message || 'Could not send login verification code.'
			};
		}

		return { ok: true, email };
	} catch (cause) {
		if (cause instanceof AdminSchemaError) {
			return { ok: false, status: 503, error: cause.message };
		}
		return {
			ok: false,
			status: 503,
			error:
				cause instanceof Error && /not configured/i.test(cause.message)
					? cause.message
					: 'Admin sign-in is temporarily unavailable. Check Supabase configuration and try again.'
		};
	}
}

export interface LoginResult {
	ok: boolean;
	error?: string;
	session?: Omit<AdminSession, 'issuedAt' | 'expiresAt'>;
	expiresAt?: Date;
	status?: number;
}

/**
 * Verify a 6-digit email OTP code via Supabase Auth and enforce that the
 * authenticated user holds `admin` or `superadmin` role on `public.profiles`.
 */
export async function authenticateWithOtp(input: {
	email: string;
	code: string;
	remember: boolean;
	ip: string;
}): Promise<LoginResult> {
	const now = Date.now();
	const lock = lockoutCheck(input.ip, now);
	if (lock.locked) return { ok: false, status: 429, error: lock.error };

	const email = input.email.trim().toLowerCase();
	const code = input.code.trim();
	if (!/^\S+@\S+\.\S+$/.test(email)) {
		return { ok: false, status: 400, error: 'Enter a valid email address.' };
	}
	if (!/^\d{6}$/.test(code)) {
		return { ok: false, status: 400, error: 'Enter the 6-digit verification code sent to your email.' };
	}

	try {
		const authClient = createSupabaseOtpClient();
		let verifyRes = await authClient.auth.verifyOtp({ email, token: code, type: 'email' });
		if (verifyRes.error) {
			const magicRetry = await authClient.auth.verifyOtp({ email, token: code, type: 'magiclink' });
			if (!magicRetry.error) {
				verifyRes = magicRetry;
			} else {
				const signupRetry = await authClient.auth.verifyOtp({ email, token: code, type: 'signup' });
				if (!signupRetry.error) verifyRes = signupRetry;
			}
		}

		if (verifyRes.error || !verifyRes.data?.user?.id) {
			if (verifyRes.error?.status === 429) {
				return { ok: false, status: 429, error: 'Too many sign-in attempts. Please try again later.' };
			}
			registerFailure(input.ip);
			const remaining = rateLimitRemaining(input.ip);
			return {
				ok: false,
				status: 401,
				error: `Invalid or expired 6-digit verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
			};
		}

		const lookup = await lookupAdminByUserId(verifyRes.data.user.id, verifyRes.data.user.email ?? email);
		if (lookup.status === 'disabled') {
			registerFailure(input.ip);
			return { ok: false, status: 403, error: lookup.reason };
		}
		if (lookup.status !== 'ok') {
			registerFailure(input.ip);
			return { ok: false, status: 403, error: ADMIN_ACCESS_DENIED_MESSAGE };
		}

		clearFailures(input.ip);
		const hours = input.remember ? REMEMBER_HOURS : SESSION_HOURS;
		return {
			ok: true,
			expiresAt: new Date(now + hours * 3_600_000),
			session: toSessionPayload(lookup.access, lookup.email, 'supabase-otp', input.ip)
		};
	} catch (cause) {
		if (cause instanceof AdminSchemaError) {
			return { ok: false, status: 503, error: cause.message };
		}
		return {
			ok: false,
			status: 503,
			error:
				cause instanceof Error && /not configured/i.test(cause.message)
					? cause.message
					: 'Admin sign-in is temporarily unavailable. Check Supabase configuration and try again.'
		};
	}
}

export async function startAdminGoogleSignIn(input: {
	cookies: Cookies;
	url: URL;
	next?: string | null;
	https?: boolean;
}): Promise<{ ok: true; url: string } | { ok: false; status: number; error: string }> {
	try {
		const https = Boolean(input.https);
		const production = process.env.NODE_ENV === 'production';
		const secure = production || https;
		const embeddedPreview = secure && !production;
		const next = safeAdminNext(input.next);

		const client = createSupabasePkceClient(input.cookies, { https });
		const { data, error } = await client.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${input.url.origin}/auth/callback`,
				skipBrowserRedirect: true
			}
		});

		if (error || !data?.url) {
			return {
				ok: false,
				status: 400,
				error: 'Google sign-in could not be started. Please try again or use your email login code.'
			};
		}

		input.cookies.set(OAUTH_NEXT_COOKIE, next, {
			path: '/',
			httpOnly: true,
			sameSite: embeddedPreview ? 'none' : 'lax',
			secure,
			partitioned: embeddedPreview,
			maxAge: OAUTH_MAX_AGE_SECONDS
		});

		return { ok: true, url: data.url };
	} catch (cause) {
		return {
			ok: false,
			status: 503,
			error:
				cause instanceof Error && /not configured/i.test(cause.message)
					? cause.message
					: 'Google sign-in is not configured on this deployment.'
		};
	}
}

export async function completeAdminAuthCallback(input: {
	cookies: Cookies;
	url: URL;
	ip: string;
	https?: boolean;
}): Promise<
	| { ok: true; next: string; session: Omit<AdminSession, 'issuedAt' | 'expiresAt'>; expiresAt: Date }
	| { ok: false; next: string; status: number; error: string }
> {
	const savedNext = input.cookies.get(OAUTH_NEXT_COOKIE);
	if (savedNext) input.cookies.delete(OAUTH_NEXT_COOKIE, { path: '/' });
	const next = safeAdminNext(input.url.searchParams.get('next') ?? savedNext);

	const oauthError = input.url.searchParams.get('error_description') || input.url.searchParams.get('error');
	if (oauthError) {
		input.cookies.delete(OAUTH_PKCE_COOKIE, { path: '/' });
		return { ok: false, next, status: 401, error: oauthError };
	}

	const code = input.url.searchParams.get('code');
	const tokenHash = input.url.searchParams.get('token_hash');
	const otpType = (input.url.searchParams.get('type') as 'email' | 'signup' | 'magiclink' | null) || 'email';
	const flowId = input.url.searchParams.get('pkce_flow_id');

	if (!code && !tokenHash) {
		return {
			ok: false,
			next,
			status: 400,
			error: 'The sign-in callback did not include a verification code. Start sign-in again.'
		};
	}

	try {
		let userId: string | undefined;
		let userEmail: string | null | undefined;

		if (code) {
			const client = createSupabasePkceClient(input.cookies, { https: input.https });
			const { data, error } = await client.auth.exchangeCodeForSession(
				code,
				flowId ? { flowId } : undefined
			);
			input.cookies.delete(OAUTH_PKCE_COOKIE, { path: '/' });
			if (error || !data?.user?.id) {
				return {
					ok: false,
					next,
					status: 401,
					error: 'Your Google sign-in session expired or could not be verified. Start sign-in again.'
				};
			}
			userId = data.user.id;
			userEmail = data.user.email;
		} else if (tokenHash) {
			const client = createSupabaseOtpClient();
			const { data, error } = await client.auth.verifyOtp({
				token_hash: tokenHash,
				type: otpType
			});
			if (error || !data?.user?.id) {
				return {
					ok: false,
					next,
					status: 401,
					error: 'Your sign-in link has expired. Request a new 6-digit login code.'
				};
			}
			userId = data.user.id;
			userEmail = data.user.email;
		}

		if (!userId) {
			return { ok: false, next, status: 401, error: 'Sign-in did not return an authenticated account.' };
		}

		const lookup = await lookupAdminByUserId(userId, userEmail);
		if (lookup.status === 'disabled') {
			return { ok: false, next, status: 403, error: lookup.reason };
		}
		if (lookup.status !== 'ok') {
			return { ok: false, next, status: 403, error: ADMIN_ACCESS_DENIED_MESSAGE };
		}

		clearFailures(input.ip);
		return {
			ok: true,
			next,
			expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000),
			session: toSessionPayload(
				lookup.access,
				lookup.email,
				code ? 'supabase-oauth' : 'supabase-otp',
				input.ip
			)
		};
	} catch (cause) {
		input.cookies.delete(OAUTH_PKCE_COOKIE, { path: '/' });
		if (cause instanceof AdminSchemaError) {
			return { ok: false, next, status: 503, error: cause.message };
		}
		return {
			ok: false,
			next,
			status: 503,
			error: 'Sign-in could not be completed. Check Supabase configuration and try again.'
		};
	}
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
		if (!Number.isFinite(Date.parse(session?.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) {
			return null;
		}
		return session;
	} catch {
		return null;
	}
}

export function isSecureRequest(request: Request, url: URL): boolean {
	if (url.protocol === 'https:') return true;

	const proto = request.headers.get('x-forwarded-proto') ?? '';
	if (proto.split(',').some((part) => part.trim().toLowerCase() === 'https')) return true;

	if ((request.headers.get('x-forwarded-ssl') ?? '').toLowerCase() === 'on') return true;
	if (/proto\s*=\s*"?https/i.test(request.headers.get('forwarded') ?? '')) return true;

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

/**
 * Validate the signed session cookie AND re-verify the user's `profiles.role`
 * on every request so role revocations, demotions, and account disablements
 * take effect immediately.
 */
export async function readSession(cookies: Cookies): Promise<AdminSession | null> {
	const session = verifySession(cookies.get(SESSION_COOKIE));
	if (
		!session?.userId ||
		(session.auth !== 'supabase-otp' && session.auth !== 'supabase-oauth')
	) {
		return null;
	}
	try {
		const access = await getAdminAccess(session.userId);
		if (!access) return null;
		return {
			...session,
			name: access.name,
			handle: access.handle || session.handle,
			initials: initialsFor(access.name),
			role: access.role,
			tier: access.tier
		};
	} catch {
		return null;
	}
}

// ── Authorisation ladder ────────────────────────────────────────────────────

/** Super Admin (tier 0) governs everything; Admin (tier 1) operates & configures. */
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
	if (!canMutate(session)) throw new AuthzError('Read-only accounts cannot change platform state.', 403);
	return session;
}

export function requireConfigure(session: AdminSession | null): AdminSession {
	if (!session) throw new AuthzError('Sign in required.', 401);
	if (!canConfigure(session)) throw new AuthzError('This action requires Admin or Super Admin privileges.', 403);
	return session;
}

export function requireSuper(session: AdminSession | null): AdminSession {
	if (!session) throw new AuthzError('Sign in required.', 401);
	if (!isSuperAdmin(session)) throw new AuthzError('This action requires a Super Admin.', 403);
	return session;
}

export function requireAudit(session: AdminSession | null): AdminSession {
	if (!session) throw new AuthzError('Sign in required.', 401);
	return session;
}
