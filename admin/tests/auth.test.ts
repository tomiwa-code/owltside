import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	AuthzError,
	authenticate,
	authenticateWithKey,
	canConfigure,
	canMutate,
	isDemoMode,
	requireAudit,
	requireConfigure,
	requireMutation,
	requireSuper,
	signSession,
	verifySession
} from '$admin/server/auth';
import type { AdminSession } from '$admin/types';

const ENV_KEYS = ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET'] as const;
const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function session(overrides: Partial<AdminSession> = {}): AdminSession {
	return {
		id: 'adm-test',
		email: 'admin@owltside.com',
		name: 'Tomiwa A.',
		initials: 'TA',
		role: 'Super Admin',
		tier: 0,
		auth: 'password+totp',
		ip: '127.0.0.1',
		demo: true,
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
		delete process.env.ADMIN_EMAIL;
		delete process.env.ADMIN_PASSWORD;
	});

	afterEach(restoreEnv);

	it('runs in demo mode until real credentials are configured', () => {
		expect(isDemoMode()).toBe(true);
		process.env.ADMIN_EMAIL = 'ops@owltside.com';
		expect(isDemoMode()).toBe(true);
		process.env.ADMIN_PASSWORD = 'a-very-long-production-passphrase';
		expect(isDemoMode()).toBe(false);
	});

	it('rejects short demo passphrases and keeps an attempt budget', () => {
		const weak = authenticate({ email: 'admin@owltside.com', password: 'short', remember: false, ip: '10.0.0.1' });
		expect(weak.ok).toBe(false);
		expect(weak.status).toBe(401);

		for (let attempt = 0; attempt < 5; attempt++) {
			authenticate({ email: 'intruder@owltside.com', password: 'owltside-admin-2026', remember: false, ip: '10.0.0.2' });
		}
		const locked = authenticate({ email: 'admin@owltside.com', password: 'owltside-admin-2026', remember: false, ip: '10.0.0.2' });
		expect(locked.ok).toBe(false);
		expect(locked.status).toBe(429);
	});

	it('issues a 2h session, extended to 12h when the device is remembered', () => {
		const short = authenticate({ email: 'admin@owltside.com', password: 'owltside-admin-2026', remember: false, ip: '10.0.0.3' });
		expect(short.ok).toBe(true);
		expect(short.session?.tier).toBe(0);
		const shortHours = (short.expiresAt!.getTime() - Date.now()) / 3_600_000;
		expect(shortHours).toBeGreaterThan(1.9);
		expect(shortHours).toBeLessThan(2.1);

		const remembered = authenticate({ email: 'admin@owltside.com', password: 'owltside-admin-2026', remember: true, ip: '10.0.0.4' });
		const rememberedHours = (remembered.expiresAt!.getTime() - Date.now()) / 3_600_000;
		expect(rememberedHours).toBeGreaterThan(11.9);
		expect(rememberedHours).toBeLessThan(12.1);
	});

	it('issues hardware-key sessions carrying the WebAuthn authenticator marker', () => {
		const { session: keyed, expiresAt } = authenticateWithKey(true, '10.0.0.5');
		expect(keyed.email).toBe('admin@owltside.com');
		expect(keyed.auth).toBe('webauthn');
		expect(keyed.tier).toBe(0);
		const hours = (expiresAt.getTime() - Date.now()) / 3_600_000;
		expect(hours).toBeGreaterThan(11.9);

		process.env.ADMIN_EMAIL = 'ops@owltside.com';
		process.env.ADMIN_PASSWORD = 'a-very-long-production-passphrase';
		expect(isDemoMode()).toBe(false);
	});

	it('round-trips a signed session cookie payload and rejects tampering', () => {
		const token = signSession(session());
		expect(verifySession(token)?.email).toBe('admin@owltside.com');

		const [payload, signature] = token.split('.');
		expect(verifySession(`${payload}.${signature.slice(0, -2)}xx`)).toBeNull();
		expect(verifySession('garbage')).toBeNull();
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
