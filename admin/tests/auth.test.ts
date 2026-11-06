import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';

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

const TEST_EMAIL = 'admin@owltside.com';
const TEST_PASSWORD = 'owltside-admin-2026';

function session(overrides: Partial<AdminSession> = {}): AdminSession {
	return {
		id: 'adm-test',
		email: TEST_EMAIL,
		name: 'Tomiwa A.',
		initials: 'TA',
		role: 'Super Admin',
		tier: 0,
		auth: 'password',
		ip: '127.0.0.1',
		demo: false,
		issuedAt: new Date().toISOString(),
		expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
		...overrides
	};
}

describe('admin authentication without a database', () => {
	beforeEach(() => {
		for (const key of ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_NAME', 'ADMIN_SESSION_SECRET', 'PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
			vi.stubEnv(key, '');
		}
		vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Login must not access the network'); }));
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('accepts the exact default credentials without Supabase configuration or network access', async () => {
		const result = await authenticate({ email: TEST_EMAIL, password: TEST_PASSWORD, remember: false, ip: '10.0.0.1' });
		expect(result).toMatchObject({ ok: true, session: { email: TEST_EMAIL, role: 'Super Admin', tier: 0, auth: 'password' } });
		expect(JSON.stringify(result)).not.toContain(TEST_PASSWORD);
		const cookie = signSession({ ...result.session!, issuedAt: new Date().toISOString(), expiresAt: result.expiresAt!.toISOString() });
		expect(await readSession({ get: () => cookie } as unknown as Cookies)).toMatchObject({ email: TEST_EMAIL, tier: 0 });
		expect(fetch).not.toHaveBeenCalled();
	});

	it.each([
		['other@example.com', TEST_PASSWORD], [TEST_EMAIL, 'wrong-password'], [TEST_EMAIL, ''], [TEST_EMAIL, `${TEST_PASSWORD} `]
	])('rejects incorrect credentials (%s)', async (email, password) => {
		const result = await authenticate({ email, password, remember: false, ip: `invalid-${password}-${email}` });
		expect(result).toMatchObject({ ok: false, status: 401 });
		expect(result.session).toBeUndefined();
	});

	it('normalizes the email but preserves exact password matching', async () => {
		expect((await authenticate({ email: ' ADMIN@OWLTSIDE.COM ', password: TEST_PASSWORD, remember: false, ip: '10.0.0.2' })).ok).toBe(true);
	});

	it('locks out after five failures and allows retry after the ten-minute window', async () => {
		vi.useFakeTimers();
		for (let attempt = 0; attempt < 5; attempt++) {
			await authenticate({ email: TEST_EMAIL, password: 'wrong', remember: false, ip: '10.0.0.3' });
		}
		expect((await authenticate({ email: TEST_EMAIL, password: TEST_PASSWORD, remember: false, ip: '10.0.0.3' })).status).toBe(429);
		vi.advanceTimersByTime(10 * 60_000 + 1);
		expect((await authenticate({ email: TEST_EMAIL, password: TEST_PASSWORD, remember: false, ip: '10.0.0.3' })).ok).toBe(true);
	});

	it('issues a 2h session, extended to 12h when remembered', async () => {
		for (const [remember, hours] of [[false, 2], [true, 12]] as const) {
			const result = await authenticate({ email: TEST_EMAIL, password: TEST_PASSWORD, remember, ip: '10.0.0.4' });
			expect((result.expiresAt!.getTime() - Date.now()) / 3_600_000).toBeCloseTo(hours, 1);
		}
	});

	it('supports server-only credential overrides and invalidates old cookies after a change', async () => {
		const token = signSession(session());
		vi.stubEnv('ADMIN_EMAIL', 'owner@example.com');
		vi.stubEnv('ADMIN_PASSWORD', 'a-private-server-password');
		expect(verifySession(token)).toBeNull();
		expect((await authenticate({ email: TEST_EMAIL, password: TEST_PASSWORD, remember: false, ip: '10.0.0.5' })).ok).toBe(false);
		const result = await authenticate({ email: 'owner@example.com', password: 'a-private-server-password', remember: false, ip: '10.0.0.6' });
		expect(result).toMatchObject({ ok: true, session: { email: 'owner@example.com', tier: 0 } });
	});

	it('invalidates cookies when the password or signing secret changes', () => {
		const token = signSession(session());
		vi.stubEnv('ADMIN_PASSWORD', 'changed-password');
		expect(verifySession(token)).toBeNull();
		vi.stubEnv('ADMIN_PASSWORD', '');
		vi.stubEnv('ADMIN_SESSION_SECRET', 'changed-signing-secret');
		expect(verifySession(token)).toBeNull();
	});

	it('rejects legacy session authentication markers', () => {
		for (const auth of ['supabase-password', 'password+totp', 'webauthn']) {
			const token = signSession(session({ auth: auth as AdminSession['auth'] }));
			expect(readSession({ get: () => token } as unknown as Cookies)).toBeNull();
		}
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
