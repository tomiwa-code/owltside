// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '$env/dynamic/private';
import { encryptBiometricVault, verifyWebAuthnChallengeToken } from '$lib/server/webauthn';
import { POST } from '../../src/routes/api/auth/biometric/challenge/+server';

const mocks = vi.hoisted(() => ({ create: vi.fn(), eq: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ createSupabase: mocks.create }));
const originalSecret = env.BIOMETRIC_SECRET;
const session = { userId: 'user-1', name: 'Member', email: 'member@example.com', handle: 'member' };

function event(purpose = 'authenticate', signedIn = true, vault?: string) {
	return {
		request: new Request('https://owltside.example/api/auth/biometric/challenge', {
			method: 'POST', body: JSON.stringify({ purpose })
		}),
		locals: { session: signedIn ? session : null },
		cookies: { get: () => vault }
	};
}

beforeEach(() => {
	vi.stubEnv('NODE_ENV', 'production');
	env.BIOMETRIC_SECRET = 'test-only-private-biometric-secret';
	mocks.create.mockReset().mockReturnValue(null);
	mocks.eq.mockReset();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	if (originalSecret === undefined) delete env.BIOMETRIC_SECRET;
	else env.BIOMETRIC_SECRET = originalSecret;
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe('biometric challenge startup failures', () => {
	it('returns actionable, non-cacheable JSON instead of an unhandled production error when the secret is missing', async () => {
		delete env.BIOMETRIC_SECRET;
		const response = await POST(event() as never);
		expect(response.status).toBe(503);
		expect(response.headers.get('cache-control')).toContain('no-store');
		expect(response.headers.get('content-type')).toContain('application/json');
		const body = await response.json();
		expect(body).toMatchObject({ code: 'BIOMETRIC_NOT_CONFIGURED', error: expect.stringContaining('email code') });
		expect(body).not.toHaveProperty('challengeToken');
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it('issues a real signed, user-bound challenge with a configured secret', async () => {
		const response = await POST(event() as never);
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toContain('no-store');
		expect(verifyWebAuthnChallengeToken(body.challengeToken, 'authenticate'))
			.toEqual({ challenge: body.challenge, userId: session.userId });
		expect(JSON.stringify(body)).not.toContain(env.BIOMETRIC_SECRET);
	});

	it('rejects expired or missing sessions without issuing a challenge', async () => {
		const response = await POST(event('authenticate', false) as never);
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ code: 'SESSION_REQUIRED' });
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it.each(['returned error', 'network exception'])('returns a recoverable error for credential lookup failures: %s', async (failure) => {
		mocks.create.mockReturnValue({ from: () => ({ select: () => ({ eq: mocks.eq }) }) });
		if (failure === 'returned error') mocks.eq.mockResolvedValue({ data: null, error: { message: 'private database details' } });
		else mocks.eq.mockRejectedValue(new Error('private network details'));
		const response = await POST(event() as never);
		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body).toMatchObject({ code: 'BIOMETRIC_STORE_UNAVAILABLE' });
		expect(JSON.stringify(body)).not.toContain('private');
		expect(body).not.toHaveProperty('challengeToken');
	});

	it('looks up credentials only for the signed-in user', async () => {
		mocks.create.mockReturnValue({ from: () => ({ select: () => ({ eq: mocks.eq }) }) });
		mocks.eq.mockResolvedValue({ data: [{ credential_id: 'stored-credential' }], error: null });
		const response = await POST(event() as never);
		expect(mocks.eq).toHaveBeenCalledWith('user_id', session.userId);
		expect(await response.json()).toMatchObject({ allowCredentialIds: ['stored-credential'] });
	});

	it('uses a valid encrypted user vault without querying the database', async () => {
		const vault = encryptBiometricVault([{
			credentialId: 'vault-credential', userId: session.userId, publicKey: 'test-key', algorithm: -7,
			counter: 0, deviceLabel: 'iPhone', userName: 'Member', createdAt: new Date().toISOString()
		}]);
		const response = await POST(event('authenticate', true, vault) as never);
		expect(await response.json()).toMatchObject({ allowCredentialIds: ['vault-credential'] });
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it('supports enrollment using the same signed challenge without a credential lookup', async () => {
		const response = await POST(event('register') as never);
		const body = await response.json();
		expect(verifyWebAuthnChallengeToken(body.challengeToken, 'register').userId).toBe(session.userId);
		expect(body.user.id).toBe(session.userId);
		expect(mocks.create).not.toHaveBeenCalled();
	});
});
