import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), access: vi.fn() }));
vi.mock('$admin/server/admin-access', () => ({
	createAccessClient: () => ({ auth: { signInWithPassword: mocks.signIn } }),
	getAdminAccess: mocks.access
}));
import {
	AuthzError,
	authenticate,
	readSession,
	canConfigure,
	canMutate,
	isSecureRequest,
	requireAudit,
	requireConfigure,
	requireMutation,
	requireSuper,
	signSession,
	verifySession
} from '$admin/server/auth';
import type { AdminSession } from '$admin/types';

const ENV_KEYS = ['ADMIN_SESSION_SECRET'] as const;
const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const TEST_EMAIL = 'admin@owltside.com';
const TEST_PASSWORD = 'owltside-admin-2026-long-passphrase';

function session(overrides: Partial<AdminSession> = {}): AdminSession {
	return {
		id: 'adm-test',
		email: TEST_EMAIL,
		name: 'Tomiwa A.',
		initials: 'TA',
		role: 'Super Admin',
		tier: 0,
		auth: 'supabase-password',
		userId: 'auth-user-1',
		ip: '127.0.0.1',
		demo: false,
		issuedAt: new Date().toISOString(),
		expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
		...overrides
	};
}

function restoreEnv() {
	for (const key of ENV_KEYS) {
		if (original[key] === undefined) delete process.env[key];
		else process.env[key] = original[key];
	}
}

describe('admin authentication', () => {
	beforeEach(() => {
		restoreEnv();
		mocks.signIn.mockReset().mockResolvedValue({ data: { user: { id: 'auth-user-1', email: TEST_EMAIL, email_confirmed_at: '2026-11-01' } }, error: null });
		mocks.access.mockReset().mockResolvedValue({ user_id: 'auth-user-1', name: 'Review Admin', role: 'Super Admin', tier: 0, is_active: true });
	});

	afterEach(restoreEnv);

	it('rejects invalid Supabase credentials and keeps an attempt budget', async () => {
		mocks.signIn.mockResolvedValue({ data: { user: null }, error: { status: 400 } });
		const weak = await authenticate({ email: TEST_EMAIL, password: 'short', remember: false, ip: '10.0.0.1' });
		expect(weak.ok).toBe(false);
		expect(weak.status).toBe(401);

		for (let attempt = 0; attempt < 5; attempt++) {
			await authenticate({ email: 'intruder@owltside.com', password: 'wrong-passphrase-1234567', remember: false, ip: '10.0.0.2' });
		}
		const locked = await authenticate({ email: TEST_EMAIL, password: TEST_PASSWORD, remember: false, ip: '10.0.0.2' });
		expect(locked.ok).toBe(false);
		expect(locked.status).toBe(429);
	});

	it('issues a 2h session, extended to 12h when the device is remembered', async () => {
		const short = await authenticate({ email: TEST_EMAIL, password: TEST_PASSWORD, remember: false, ip: '10.0.0.3' });
		expect(short.ok).toBe(true);
		expect(short.session?.tier).toBe(0);
		const shortHours = (short.expiresAt!.getTime() - Date.now()) / 3_600_000;
		expect(shortHours).toBeGreaterThan(1.9);
		expect(shortHours).toBeLessThan(2.1);

		const remembered = await authenticate({ email: TEST_EMAIL, password: TEST_PASSWORD, remember: true, ip: '10.0.0.4' });
		const rememberedHours = (remembered.expiresAt!.getTime() - Date.now()) / 3_600_000;
		expect(rememberedHours).toBeGreaterThan(11.9);
		expect(rememberedHours).toBeLessThan(12.1);
	});

	it('normalizes email and uses the Auth user ID for access lookup, not metadata', async () => {
		const result = await authenticate({ email: ' ADMIN@OWLTSIDE.COM ', password: TEST_PASSWORD, remember: false, ip: '10.1.0.1' });
		expect(mocks.signIn).toHaveBeenCalledWith({ email: TEST_EMAIL, password: TEST_PASSWORD });
		expect(mocks.access).toHaveBeenCalledWith('auth-user-1');
		expect(result.session).toMatchObject({ userId: 'auth-user-1', auth: 'supabase-password', tier: 0 });
		expect(JSON.stringify(result)).not.toContain(TEST_PASSWORD);
	});

	it('does not grant admin access to an ordinary authenticated customer', async () => {
		mocks.access.mockResolvedValue(null);
		const result = await authenticate({ email: TEST_EMAIL, password: TEST_PASSWORD, remember: false, ip: '10.1.0.2' });
		expect(result).toMatchObject({ ok: false, status: 401 });
		expect(result.session).toBeUndefined();
	});

	it('rejects unconfirmed emails before checking admin access', async () => {
		mocks.signIn.mockResolvedValue({ data: { user: { id: 'auth-user-1', email: TEST_EMAIL } }, error: null });
		expect((await authenticate({ email: TEST_EMAIL, password: TEST_PASSWORD, remember: false, ip: '10.1.0.3' })).status).toBe(401);
		expect(mocks.access).not.toHaveBeenCalled();
	});

	it('fails closed on unavailable Auth or access lookup without leaking details', async () => {
		mocks.access.mockRejectedValue(new Error('private database details'));
		const result = await authenticate({ email: TEST_EMAIL, password: TEST_PASSWORD, remember: false, ip: '10.1.0.4' });
		expect(result).toMatchObject({ ok: false, status: 503 });
		expect(result.error).not.toContain('private');
		mocks.signIn.mockRejectedValue(new Error('network'));
		expect((await authenticate({ email: TEST_EMAIL, password: TEST_PASSWORD, remember: false, ip: '10.1.0.5' })).status).toBe(503);
	});

	it('honors Supabase rate limits without issuing a session', async () => {
		mocks.signIn.mockResolvedValue({ data: { user: null }, error: { status: 429 } });
		expect((await authenticate({ email: TEST_EMAIL, password: TEST_PASSWORD, remember: false, ip: '10.1.0.6' })).status).toBe(429);
	});

	it('refreshes role changes and denies removed/suspended access on existing sessions', async () => {
		const cookies = { get: () => signSession(session()) } as unknown as Cookies;
		mocks.access.mockResolvedValue({ user_id: 'auth-user-1', name: 'Audit Admin', role: 'Read-only Auditor', tier: 3, is_active: true });
		expect(await readSession(cookies)).toMatchObject({ tier: 3, role: 'Read-only Auditor', initials: 'AA' });
		mocks.access.mockResolvedValue(null);
		expect(await readSession(cookies)).toBeNull();
		mocks.access.mockRejectedValue(new Error('outage'));
		expect(await readSession(cookies)).toBeNull();
	});

	it('never upgrades an old environment-based session', async () => {
		const cookies = { get: () => signSession(session({ userId: undefined, auth: 'password+totp' })) } as unknown as Cookies;
		expect(await readSession(cookies)).toBeNull();
		expect(mocks.access).not.toHaveBeenCalled();
	});

	it('round-trips a signed session cookie payload and rejects tampering', () => {
		const token = signSession(session());
		expect(verifySession(token)?.email).toBe(TEST_EMAIL);

		const [payload, signature] = token.split('.');
		expect(verifySession(`${payload}.${signature.slice(0, -2)}xx`)).toBeNull();
		expect(verifySession('garbage')).toBeNull();
		expect(verifySession(`${token}.extra`)).toBeNull();
		expect(verifySession(signSession(session({ expiresAt: 'invalid' })))).toBeNull();
		expect(verifySession(undefined)).toBeNull();
	});

	it('rejects expired sessions even with a valid signature', () => {
		const expired = session({ expiresAt: new Date(Date.now() - 1000).toISOString() });
		expect(verifySession(signSession(expired))).toBeNull();
	});

	it('enforces the tier ladder for mutations', () => {
		const superAdmin = session();
		const auditor = session({ role: 'Read-only Auditor', tier: 3 });
		const finance = session({ role: 'Finance & Treasury', tier: 1 });

		expect(canMutate(superAdmin)).toBe(true);
		expect(canMutate(auditor)).toBe(false);
		expect(canConfigure(finance)).toBe(true);

		expect(requireSuper(superAdmin).tier).toBe(0);
		expect(() => requireSuper(auditor)).toThrow(AuthzError);
		expect(() => requireMutation(auditor)).toThrow(/Read-only auditors/);
		expect(() => requireConfigure(auditor)).toThrow(AuthzError);
		expect(requireAudit(auditor).tier).toBe(3);
		expect(() => requireAudit(null)).toThrow(AuthzError);
		expect(() => requireMutation(null)).toThrow(/Sign in required/);
	});
});

describe('HTTPS detection for session cookies', () => {
	const url = (value: string) => new URL(value);

	it('treats a direct https request as secure', () => {
		expect(isSecureRequest(new Request('https://admin.example.com/login'), url('https://admin.example.com/login'))).toBe(true);
	});

	it('treats loopback and LAN http as insecure so dev cookies still stick', () => {
		expect(isSecureRequest(new Request('http://localhost:5174/login'), url('http://localhost:5174/login'))).toBe(false);
		expect(isSecureRequest(new Request('http://192.168.1.20:5174/login'), url('http://192.168.1.20:5174/login'))).toBe(false);
	});

	it('honours a forwarded https proto even when the proxy appends to it', () => {
		const request = new Request('http://localhost:5174/login', { headers: { 'x-forwarded-proto': 'https,http' } });
		expect(isSecureRequest(request, url('http://localhost:5174/login'))).toBe(true);
	});

	it('falls back to browser-facing headers when the proxy strips forwarded protos', () => {
		const viaOrigin = new Request('http://localhost:5174/login', {
			headers: { origin: 'https://5174-abc.e2b.app', host: '5174-abc.e2b.app' }
		});
		expect(isSecureRequest(viaOrigin, url('http://localhost:5174/login'))).toBe(true);

		const viaReferer = new Request('http://localhost:5174/login', {
			headers: { referer: 'https://5174-abc.e2b.app/login' }
		});
		expect(isSecureRequest(viaReferer, url('http://localhost:5174/login'))).toBe(true);
	});

	it('reads the standard Forwarded and X-Forwarded-Ssl headers', () => {
		expect(
			isSecureRequest(
				new Request('http://localhost:5174/login', { headers: { forwarded: 'for=1.2.3.4;proto=https' } }),
				url('http://localhost:5174/login')
			)
		).toBe(true);
		expect(
			isSecureRequest(
				new Request('http://localhost:5174/login', { headers: { 'x-forwarded-ssl': 'on' } }),
				url('http://localhost:5174/login')
			)
		).toBe(true);
	});
});
