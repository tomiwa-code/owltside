import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	authenticateWithBiometrics, enrollBiometricPasskey, verifyOrEnrollBiometrics,
	isBiometricSessionUnlocked, readStoredBiometric
} from '$lib/webauthn.client';

const get = vi.fn();
const create = vi.fn();
const fetchMock = vi.fn();

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone Mobile Safari' });
	Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
	Object.defineProperty(navigator, 'credentials', { configurable: true, value: { get, create } });
	vi.stubGlobal('PublicKeyCredential', { isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true) });
	vi.stubGlobal('fetch', fetchMock);
	fetchMock.mockReset();
	get.mockReset();
	create.mockReset();
});
afterEach(() => {
	vi.unstubAllGlobals();
	delete (navigator as { userAgent?: string }).userAgent;
	delete (navigator as { credentials?: unknown }).credentials;
	delete (window as { isSecureContext?: boolean }).isSecureContext;
	localStorage.clear();
	sessionStorage.clear();
});

describe('biometric challenge errors on iPhone', () => {
	it('shows the server configuration error without opening Face ID or marking the gate unlocked', async () => {
		fetchMock.mockResolvedValue(Response.json({ error: 'Biometric unlock is not configured on this server.', code: 'BIOMETRIC_NOT_CONFIGURED' }, { status: 503 }));
		await expect(authenticateWithBiometrics('user-1')).rejects.toThrow('not configured');
		expect(get).not.toHaveBeenCalled();
		expect(isBiometricSessionUnlocked('user-1')).toBe(false);
		expect(fetchMock).toHaveBeenCalledWith('/api/auth/biometric/challenge', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }));
	});

	it.each([500, 502, 503])('turns a non-JSON HTTP %s response into a readable recovery message', async (status) => {
		fetchMock.mockResolvedValue(new Response('<html>Server error</html>', { status }));
		await expect(authenticateWithBiometrics('user-1')).rejects.toThrow(`HTTP ${status}`);
		expect(get).not.toHaveBeenCalled();
	});

	it('explains session expiry rather than suggesting Face ID hardware failed', async () => {
		fetchMock.mockResolvedValue(new Response('', { status: 401 }));
		await expect(authenticateWithBiometrics('user-1')).rejects.toThrow('session has expired');
	});

	it('handles a network failure and keeps the gate locked', async () => {
		fetchMock.mockRejectedValue(new TypeError('fetch failed'));
		await expect(authenticateWithBiometrics('user-1')).rejects.toThrow('Check your connection');
		expect(isBiometricSessionUnlocked('user-1')).toBe(false);
	});

	it('handles invalid successful responses without attempting a platform credential operation', async () => {
		fetchMock.mockResolvedValue(Response.json({ challenge: 123, challengeToken: 'test-token' }));
		await expect(authenticateWithBiometrics('user-1')).rejects.toThrow('invalid challenge');
		expect(get).not.toHaveBeenCalled();
	});

	it('uses the same recoverable handling for enrollment', async () => {
		fetchMock.mockResolvedValue(new Response('', { status: 503 }));
		await expect(enrollBiometricPasskey('user-1')).rejects.toThrow('email code');
		expect(create).not.toHaveBeenCalled();
	});

	it('does not delete or re-enroll a saved passkey when the server is unavailable', async () => {
		localStorage.setItem('owltside.biometric.v1', JSON.stringify({ userId: 'user-1', credentialId: 'AQIDBA', deviceLabel: 'iPhone', createdAt: '2026-11-07' }));
		fetchMock.mockResolvedValue(Response.json({ error: 'Temporary service failure' }, { status: 503 }));
		await expect(verifyOrEnrollBiometrics('user-1')).rejects.toThrow('Temporary service failure');
		expect(readStoredBiometric('user-1')?.credentialId).toBe('AQIDBA');
		expect(create).not.toHaveBeenCalled();
		expect(isBiometricSessionUnlocked('user-1')).toBe(false);
	});
});
