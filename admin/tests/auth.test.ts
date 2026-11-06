import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';

const {
	signInWithOtp,
	verifyOtp,
	signInWithOAuth,
	exchangeCodeForSession,
	findAdminByEmail,
	lookupAdminByUserId,
	getAdminAccess
} = vi.hoisted(() => ({
	signInWithOtp: vi.fn(),
	verifyOtp: vi.fn(),
	signInWithOAuth: vi.fn(),
	exchangeCodeForSession: vi.fn(),
	findAdminByEmail: vi.fn(),
	lookupAdminByUserId: vi.fn(),
	getAdminAccess: vi.fn()
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => ({
		auth: {
			signInWithOtp,
			verifyOtp,
			signInWithOAuth,
			exchangeCodeForSession
		}
	}))
}));

vi.mock('../src/lib/server/admin-access', async (importOriginal) => {
	const original = await importOriginal<typeof import('../src/lib/server/admin-access')>();
	return {
		...original,
		findAdminByEmail,
		lookupAdminByUserId,
		getAdminAccess
	};
});

import {
	ADMIN_ACCESS_DENIED_MESSAGE,
	AuthzError,
	authenticateWithOtp,
	canConfigure,
	canMutate,
	completeAdminAuthCallback,
	isSecureRequest,
	readSession,
	requestAdminOtp,
	requireAudit,
	requireConfigure,
	requireMutation,
	requireSuper,
	resetRateLimitForTests,
	signSession,
	verifySession
} from '$admin/server/auth';
import type { AdminSession } from '$admin/types';

const SUPER_USER_ID = '11111111-2222-4333-8444-555555555555';
const ADMIN_USER_ID = '22222222-3333-4444-8555-666666666666';
const REGULAR_USER_ID = '33333333-4444-4555-8666-777777777777';

function makeSession(overrides: Partial<AdminSession> = {}): AdminSession {
	return {
		id: 'sess-1',
		userId: SUPER_USER_ID,
		email: 'founder@example.com',
		name: 'Founder',
		handle: 'founder',
		initials: 'FO',
		role: 'Super Admin',
		tier: 0,
		auth: 'supabase-otp',
		ip: '127.0.0.1',
		demo: false,
		issuedAt: new Date().toISOString(),
		expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
		...overrides
	};
}

describe('unified Supabase role-gated admin authentication', () => {
	beforeEach(() => {
		resetRateLimitForTests();
		signInWithOtp.mockReset();
		verifyOtp.mockReset();
		signInWithOAuth.mockReset();
		exchangeCodeForSession.mockReset();
		findAdminByEmail.mockReset();
		lookupAdminByUserId.mockReset();
		getAdminAccess.mockReset();

		vi.stubEnv('PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
		vi.stubEnv('PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
		vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
		vi.stubEnv('ADMIN_SESSION_SECRET', 'test-session-secret-32-bytes-minimum');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.useRealTimers();
	});

	it('sends a 6-digit OTP when the email belongs to an active superadmin or admin', async () => {
		findAdminByEmail.mockResolvedValue({
			status: 'ok',
			email: 'founder@example.com',
			access: {
				userId: SUPER_USER_ID,
				handle: 'founder',
				name: 'Founder',
				dbRole: 'superadmin',
				role: 'Super Admin',
				tier: 0
			}
		});
		signInWithOtp.mockResolvedValue({ data: {}, error: null });

		const res = await requestAdminOtp({
			email: ' FOUNDER@EXAMPLE.COM ',
			ip: '10.0.0.1',
			redirectTo: 'http://localhost:5174/auth/callback'
		});

		expect(res).toEqual({ ok: true, email: 'founder@example.com' });
		expect(signInWithOtp).toHaveBeenCalledWith({
			email: 'founder@example.com',
			options: {
				shouldCreateUser: false,
				emailRedirectTo: 'http://localhost:5174/auth/callback'
			}
		});
	});

	it('rejects non-admin users immediately with 403 and never dispatches an OTP email', async () => {
		findAdminByEmail.mockResolvedValue({ status: 'denied' });

		const res = await requestAdminOtp({ email: 'attendee@example.com', ip: '10.0.0.2' });
		expect(res).toEqual({
			ok: false,
			status: 403,
			error: ADMIN_ACCESS_DENIED_MESSAGE
		});
		expect(signInWithOtp).not.toHaveBeenCalled();
	});

	it('allows an active Admin (tier 1) and Super Admin (tier 0) after OTP verification', async () => {
		verifyOtp.mockResolvedValue({
			data: { user: { id: ADMIN_USER_ID, email: 'ops@example.com' } },
			error: null
		});
		lookupAdminByUserId.mockResolvedValue({
			status: 'ok',
			email: 'ops@example.com',
			access: {
				userId: ADMIN_USER_ID,
				handle: 'opslead',
				name: 'Ops Admin',
				dbRole: 'admin',
				role: 'Admin',
				tier: 1
			}
		});

		const res = await authenticateWithOtp({
			email: 'ops@example.com',
			code: '123456',
			remember: false,
			ip: '10.0.0.3'
		});

		expect(res.ok).toBe(true);
		expect(res.session).toMatchObject({
			userId: ADMIN_USER_ID,
			email: 'ops@example.com',
			role: 'Admin',
			tier: 1,
			auth: 'supabase-otp'
		});
	});

	it('throws 403 error if a regular user attempts to complete OTP or Google OAuth sign-in', async () => {
		verifyOtp.mockResolvedValue({
			data: { user: { id: REGULAR_USER_ID, email: 'guest@example.com' } },
			error: null
		});
		lookupAdminByUserId.mockResolvedValue({ status: 'denied' });

		const otpRes = await authenticateWithOtp({
			email: 'guest@example.com',
			code: '654321',
			remember: false,
			ip: '10.0.0.4'
		});
		expect(otpRes).toEqual({
			ok: false,
			status: 403,
			error: ADMIN_ACCESS_DENIED_MESSAGE
		});

		exchangeCodeForSession.mockResolvedValue({
			data: { user: { id: REGULAR_USER_ID, email: 'guest@example.com' }, session: {} },
			error: null
		});
		const cookies = {
			get: vi.fn(() => undefined),
			set: vi.fn(),
			delete: vi.fn()
		} as unknown as Cookies;

		const oauthRes = await completeAdminAuthCallback({
			cookies,
			url: new URL('http://localhost:5174/auth/callback?code=oauth-code-1'),
			ip: '10.0.0.4'
		});
		expect(oauthRes).toEqual({
			ok: false,
			next: '/dashboard',
			status: 403,
			error: ADMIN_ACCESS_DENIED_MESSAGE
		});
	});

	it('locks out after five failed attempts and unlocks after ten minutes', async () => {
		vi.useFakeTimers();
		verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid OTP' } });

		for (let i = 0; i < 5; i++) {
			await authenticateWithOtp({
				email: 'founder@example.com',
				code: '000000',
				remember: false,
				ip: '10.0.0.9'
			});
		}

		const locked = await authenticateWithOtp({
			email: 'founder@example.com',
			code: '123456',
			remember: false,
			ip: '10.0.0.9'
		});
		expect(locked.status).toBe(429);

		vi.advanceTimersByTime(10 * 60_000 + 1);
		verifyOtp.mockResolvedValue({
			data: { user: { id: SUPER_USER_ID, email: 'founder@example.com' } },
			error: null
		});
		lookupAdminByUserId.mockResolvedValue({
			status: 'ok',
			email: 'founder@example.com',
			access: {
				userId: SUPER_USER_ID,
				handle: 'founder',
				name: 'Founder',
				dbRole: 'superadmin',
				role: 'Super Admin',
				tier: 0
			}
		});

		const unlocked = await authenticateWithOtp({
			email: 'founder@example.com',
			code: '123456',
			remember: true,
			ip: '10.0.0.9'
		});
		expect(unlocked.ok).toBe(true);
		expect((unlocked.expiresAt!.getTime() - Date.now()) / 3_600_000).toBeCloseTo(12, 1);
	});

	it('revalidates role on every request and immediately revokes removed or legacy sessions', async () => {
		const token = signSession(makeSession({ role: 'Admin', tier: 1 }));

		// Promoted to Super Admin in Supabase -> reflected immediately on next request
		getAdminAccess.mockResolvedValueOnce({
			userId: SUPER_USER_ID,
			handle: 'founder',
			name: 'Founder',
			dbRole: 'superadmin',
			role: 'Super Admin',
			tier: 0
		});
		const refreshed = await readSession({ get: () => token } as unknown as Cookies);
		expect(refreshed).toMatchObject({ role: 'Super Admin', tier: 0 });

		// Role changed to 'user' -> revoked immediately
		getAdminAccess.mockResolvedValueOnce(null);
		expect(await readSession({ get: () => token } as unknown as Cookies)).toBeNull();

		// Legacy password/webauthn cookies rejected
		for (const legacyAuth of ['password', 'password+totp', 'webauthn']) {
			const legacyToken = signSession(makeSession({ auth: legacyAuth as AdminSession['auth'] }));
			expect(await readSession({ get: () => legacyToken } as unknown as Cookies)).toBeNull();
		}

		// Rotating ADMIN_SESSION_SECRET invalidates existing cookies
		vi.stubEnv('ADMIN_SESSION_SECRET', 'rotated-secret-value');
		expect(verifySession(token)).toBeNull();
	});

	it('enforces Super Admin vs Admin tier guards', () => {
		const superAdmin = makeSession({ role: 'Super Admin', tier: 0 });
		const regularAdmin = makeSession({ role: 'Admin', tier: 1 });

		expect(canMutate(superAdmin)).toBe(true);
		expect(canMutate(regularAdmin)).toBe(true);
		expect(canConfigure(regularAdmin)).toBe(true);

		expect(requireSuper(superAdmin).tier).toBe(0);
		expect(() => requireSuper(regularAdmin)).toThrow(AuthzError);
		expect(requireConfigure(regularAdmin).tier).toBe(1);
		expect(requireMutation(regularAdmin).tier).toBe(1);
		expect(requireAudit(regularAdmin).tier).toBe(1);
		expect(() => requireAudit(null)).toThrow(AuthzError);
	});
});

describe('HTTPS detection for session cookies', () => {
	const url = (value: string) => new URL(value);

	it('treats direct https and forwarded https headers as secure', () => {
		expect(isSecureRequest(new Request('https://admin.example.com/login'), url('https://admin.example.com/login'))).toBe(true);
		expect(
			isSecureRequest(
				new Request('http://localhost:5174/login', { headers: { 'x-forwarded-proto': 'https,http' } }),
				url('http://localhost:5174/login')
			)
		).toBe(true);
		expect(isSecureRequest(new Request('http://localhost:5174/login'), url('http://localhost:5174/login'))).toBe(false);
	});
});
