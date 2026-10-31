import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from '$app/state';

const gotoMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('$app/navigation', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$app/navigation')>();
	return { ...actual, goto: gotoMock };
});

vi.mock('$lib/server/supabase', () => ({
	createSupabase: () => null,
	supabaseConfigured: () => false
}));

import LoginPage from '../../src/routes/auth/login/+page.svelte';
import SignupPage from '../../src/routes/auth/signup/+page.svelte';
import SplashPage from '../../src/routes/+page.svelte';
import { POST as biometricChallenge } from '../../src/routes/api/auth/biometric/challenge/+server';
import { POST as biometricRegister } from '../../src/routes/api/auth/biometric/register/+server';
import { POST as biometricVerify } from '../../src/routes/api/auth/biometric/verify/+server';
import { POST as authSignout } from '../../src/routes/api/auth/signout/+server';
import {
	BIOMETRIC_JUST_AUTHED_COOKIE,
	clearBiometricSessionUnlocked,
	consumeJustAuthenticatedCookie,
	isBiometricSessionUnlocked,
	readStoredBiometric
} from '$lib/webauthn.client';

const signedInSession = {
	userId: 'user-ada-001',
	email: 'ada@owltside.app',
	handle: 'adaobi',
	name: 'Ada Obi',
	role: 'attendee' as const,
	avatarUrl: null,
	demo: true
};

function installWebAuthnMock(options?: {
	rejectAutomaticOnce?: boolean;
}) {
	let rejectOnce = Boolean(options?.rejectAutomaticOnce);
	const rawCredId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
	const dummyBytes = new Uint8Array([10, 20, 30, 40]).buffer;

	Object.defineProperty(window, 'isSecureContext', {
		configurable: true,
		value: true
	});
	vi.stubGlobal('PublicKeyCredential', {
		isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true)
	});

	const createSpy = vi.fn().mockImplementation(async () => {
		if (rejectOnce) {
			rejectOnce = false;
			throw new DOMException('User gesture required', 'NotAllowedError');
		}
		return {
			id: 'AQIDBAUGBwg',
			rawId: rawCredId,
			type: 'public-key',
			response: {
				clientDataJSON: dummyBytes,
				attestationObject: dummyBytes,
				getPublicKey: () => dummyBytes,
				getPublicKeyAlgorithm: () => -7
			}
		};
	});

	const getSpy = vi.fn().mockImplementation(async () => {
		if (rejectOnce) {
			rejectOnce = false;
			throw new DOMException('User gesture required', 'NotAllowedError');
		}
		return {
			id: 'AQIDBAUGBwg',
			rawId: rawCredId,
			type: 'public-key',
			response: {
				clientDataJSON: dummyBytes,
				authenticatorData: dummyBytes,
				signature: dummyBytes
			}
		};
	});

	Object.defineProperty(navigator, 'credentials', {
		configurable: true,
		value: { create: createSpy, get: getSpy }
	});

	const fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url.endsWith('/api/auth/biometric/challenge')) {
			return Response.json({
				challenge: 'Y2hhbGxlbmdlLTEyMzQ1Njc4OTA',
				challengeToken: 'tok.sig',
				allowCredentialIds: ['AQIDBAUGBwg'],
				user: {
					id: signedInSession.userId,
					name: signedInSession.email,
					displayName: signedInSession.name
				}
			});
		}
		if (url.endsWith('/api/auth/biometric/register')) {
			return Response.json({
				ok: true,
				userId: signedInSession.userId,
				credentialId: 'AQIDBAUGBwg',
				deviceLabel: 'iPhone Face ID / Touch ID',
				createdAt: '2026-10-31T10:00:00.000Z'
			});
		}
		if (url.endsWith('/api/auth/biometric/verify')) {
			return Response.json({
				ok: true,
				verifiedAt: '2026-10-31T10:05:00.000Z',
				userId: signedInSession.userId,
				userName: signedInSession.name,
				deviceLabel: 'iPhone Face ID / Touch ID'
			});
		}
		if (url.endsWith('/api/auth/signout')) {
			return Response.json({ ok: true });
		}
		return Response.json({});
	});
	vi.stubGlobal('fetch', fetchSpy);

	return { createSpy, getSpy, fetchSpy };
}

function setPageUrl(href: string) {
	(page as unknown as { url: URL }).url = new URL(href);
}

describe('Login, Sign-up, and Post-Splash Biometric Unlock', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		sessionStorage.clear();
		document.cookie = `${BIOMETRIC_JUST_AUTHED_COOKIE}=; Path=/; Max-Age=0`;
		setPageUrl('http://localhost/');
		Object.assign(page.data, { session: null });
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		localStorage.clear();
		sessionStorage.clear();
	});

	it('removes all biometric options from /auth/login and /auth/signup and keeps email + 6-digit token as default', async () => {
		installWebAuthnMock();
		localStorage.setItem(
			'owltside.biometric.v1',
			JSON.stringify({
				userId: signedInSession.userId,
				credentialId: 'AQIDBAUGBwg',
				deviceLabel: 'iPhone Face ID / Touch ID',
				createdAt: '2026-10-31T00:00:00.000Z'
			})
		);

		setPageUrl('http://localhost/auth/login');
		const loginView = render(LoginPage, { props: { form: null } });
		await tick();

		expect(loginView.container.textContent).not.toMatch(/Fingerprint|Face ID|biometric/i);
		expect(screen.getAllByText(/Send Login Code/i).length).toBeGreaterThan(0);
		expect(
			screen.getAllByText(/6-digit login verification code to your email/i).length
		).toBeGreaterThan(0);
		cleanup();

		setPageUrl('http://localhost/auth/signup');
		const signupView = render(SignupPage, { props: { form: null } });
		await tick();

		expect(signupView.container.textContent).not.toMatch(/Fingerprint|Face ID|biometric/i);
		expect(screen.getAllByText(/Create Account/i).length).toBeGreaterThan(0);
		expect(signupView.container.textContent).toMatch(/6-digit code|verification code/i);
	});

	it('goes straight from the splash screen to /auth/login without biometrics when signed out', async () => {
		vi.useFakeTimers();
		const { createSpy, getSpy } = installWebAuthnMock();

		setPageUrl('http://localhost/');
		Object.assign(page.data, { session: null });
		render(SplashPage);

		expect(screen.getByText('Everything happening around you.')).toBeInTheDocument();

		await vi.advanceTimersByTimeAsync(2_500);
		await tick();

		expect(gotoMock).toHaveBeenCalledWith('/auth/login', { replaceState: true });
		expect(createSpy).not.toHaveBeenCalled();
		expect(getSpy).not.toHaveBeenCalled();
	});

	it('always asks for biometrics right after the splash screen while signed in, including after closing and reopening the web app', async () => {
		vi.useFakeTimers();
		// Simulate browser requiring user tap on initial launch so we can inspect the post-splash biometric screen
		const { createSpy, getSpy } = installWebAuthnMock({ rejectAutomaticOnce: true });

		setPageUrl('http://localhost/');
		Object.assign(page.data, { session: signedInSession });
		render(SplashPage);

		// Phase 1: Splash screen renders first
		const gate = screen.getByTestId('splash-biometric-gate');
		expect(gate.getAttribute('data-gate-phase')).toBe('splash');
		expect(screen.getByText('Everything happening around you.')).toBeInTheDocument();
		expect(gotoMock).not.toHaveBeenCalled();

		// Advance timers until splash finishes (100% + 350ms)
		await vi.advanceTimersByTimeAsync(2_500);
		await tick();

		// Phase 2: Right after splash screen, asks for biometrics before entering /home
		expect(gate.getAttribute('data-gate-phase')).toBe('biometric');
		expect(screen.getByText(/Welcome back, Ada Obi/i)).toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: /Unlock with Fingerprint \/ Face ID/i })
		).toBeInTheDocument();
		expect(gotoMock).not.toHaveBeenCalled();

		// User verifies biometrics -> enrolls hardware passkey on first launch & enters /home
		vi.useRealTimers();
		await fireEvent.click(
			screen.getByRole('button', { name: /Unlock with Fingerprint \/ Face ID/i })
		);
		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/home', { replaceState: true });
		});
		expect(createSpy).toHaveBeenCalledTimes(2); // 1 auto attempt + 1 user tap
		expect(isBiometricSessionUnlocked(signedInSession.userId)).toBe(true);
		expect(readStoredBiometric(signedInSession.userId)?.credentialId).toBe('AQIDBAUGBwg');

		cleanup();
		gotoMock.mockClear();

		// Simulate closing the web app (wiping sessionStorage) while still signed in, then reopening '/'
		clearBiometricSessionUnlocked();
		expect(isBiometricSessionUnlocked(signedInSession.userId)).toBe(false);

		vi.useFakeTimers();
		setPageUrl('http://localhost/');
		Object.assign(page.data, { session: signedInSession });
		render(SplashPage);

		// Starts on splash screen again
		expect(screen.getByTestId('splash-biometric-gate').getAttribute('data-gate-phase')).toBe(
			'splash'
		);
		expect(gotoMock).not.toHaveBeenCalled();

		// Right after splash finishes, automatically prompts enrolled biometrics (credentials.get) and unlocks!
		await vi.advanceTimersByTimeAsync(2_500);
		vi.useRealTimers();
		await vi.waitFor(() => {
			expect(getSpy).toHaveBeenCalledTimes(1);
			expect(gotoMock).toHaveBeenCalledWith('/home', { replaceState: true });
		});
		expect(isBiometricSessionUnlocked(signedInSession.userId)).toBe(true);
	});

	it('consumes just-authenticated email OTP cookie once and requires biometrics again after closing the app', () => {
		document.cookie = `${BIOMETRIC_JUST_AUTHED_COOKIE}=1; Path=/`;
		expect(consumeJustAuthenticatedCookie(signedInSession.userId)).toBe(true);
		expect(isBiometricSessionUnlocked(signedInSession.userId)).toBe(true);
		// Cookie was consumed and cleared
		expect(consumeJustAuthenticatedCookie(signedInSession.userId)).toBe(false);

		// Closing the web app clears sessionStorage, requiring biometrics on next reopen
		sessionStorage.clear();
		expect(isBiometricSessionUnlocked(signedInSession.userId)).toBe(false);
	});

	it('rejects signed-out requests on all biometric API routes and clears unlock state on signout', async () => {
		const cookies = {
			get: () => undefined,
			getAll: () => [],
			set: vi.fn(),
			delete: vi.fn()
		};

		const challengeRes = await biometricChallenge({
			request: new Request('http://localhost/api/auth/biometric/challenge', {
				method: 'POST',
				body: JSON.stringify({ purpose: 'authenticate' })
			}),
			locals: { session: null, demoMode: true },
			cookies
		} as never);
		expect(challengeRes.status).toBe(401);

		const registerRes = await biometricRegister({
			request: new Request('http://localhost/api/auth/biometric/register', {
				method: 'POST',
				body: JSON.stringify({})
			}),
			locals: { session: null, demoMode: true },
			cookies,
			url: new URL('http://localhost/api/auth/biometric/register')
		} as never);
		expect(registerRes.status).toBe(401);

		const verifyRes = await biometricVerify({
			request: new Request('http://localhost/api/auth/biometric/verify', {
				method: 'POST',
				body: JSON.stringify({})
			}),
			locals: { session: null, demoMode: true },
			cookies,
			url: new URL('http://localhost/api/auth/biometric/verify')
		} as never);
		expect(verifyRes.status).toBe(401);

		const signoutRes = await authSignout({ cookies } as never);
		expect(signoutRes.status).toBe(200);
		expect(cookies.delete).toHaveBeenCalledWith('owltside_demo_session', { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith('owltside_bio_unlocked', { path: '/' });
		expect(cookies.delete).toHaveBeenCalledWith(BIOMETRIC_JUST_AUTHED_COOKIE, { path: '/' });
	});
});
