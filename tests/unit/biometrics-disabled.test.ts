import { cleanup, render, screen } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from '$app/state';
import RootLayout from '../../src/routes/+layout.svelte';
import SplashPage from '../../src/routes/+page.svelte';
import SettingsDetails from '$components/SettingsDetails.svelte';
import { POST as challenge } from '../../src/routes/api/auth/biometric/challenge/+server';
import { POST as register, DELETE as remove } from '../../src/routes/api/auth/biometric/register/+server';
import { POST as verify } from '../../src/routes/api/auth/biometric/verify/+server';
import { clearRetiredBiometricStorage } from '$lib/retired-biometrics.client';

const mocks = vi.hoisted(() => ({ goto: vi.fn(), push: vi.fn().mockResolvedValue(null) }));
vi.mock('$app/navigation', async (original) => ({ ...await original<typeof import('$app/navigation')>(), goto: mocks.goto }));
vi.mock('$lib/push.client', () => ({ ensureServiceWorkerRegistration: mocks.push, getPushPermissionState: () => 'default' }));

const session = { userId: 'user-1', name: 'Member', email: 'member@example.com', handle: 'member', role: 'attendee' as const };
const retiredCookies = ['owltside_bio_vault', 'owltside_bio_unlocked', 'owltside_just_authed'];

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	mocks.goto.mockReset();
	page.data.session = null;
	page.url = new URL('https://owltside.example/') as typeof page.url;
	vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); }));
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	page.data.session = null;
	localStorage.clear();
	sessionStorage.clear();
});

describe('biometric endpoints are disabled for new and old clients', () => {
	it.each([
		['challenge', challenge], ['register', register], ['verify', verify], ['delete registration', remove]
	] as const)('%s rejects signed-in and signed-out requests without crypto, database or unlock state', async (_name, handler) => {
		for (const signedIn of [true, false]) {
			const values = new Map([...retiredCookies.map((key): [string, string] => [key, 'old-value']), ['sb-auth-token', 'keep-session']]);
			const cookies = { get: (key: string) => values.get(key), delete: vi.fn((key: string) => values.delete(key)), set: vi.fn() };
			const response = await handler({ cookies, locals: { session: signedIn ? session : null } } as never);
			expect(response.status).toBe(410);
			expect(response.headers.get('cache-control')).toContain('no-store');
			expect(await response.json()).toMatchObject({ code: 'BIOMETRIC_DISABLED', error: expect.stringContaining('email-code') });
			for (const key of retiredCookies) expect(values.has(key)).toBe(false);
			expect(values.get('sb-auth-token')).toBe('keep-session');
			expect(cookies.set).not.toHaveBeenCalled();
		}
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe('no mobile or desktop biometric gate', () => {
	it.each(['iPhone Mobile Safari', 'Macintosh Chrome'])('renders signed-in content without a credential request, including after resume: %s', async (userAgent) => {
		vi.useFakeTimers();
		vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
		const credentials = { get: vi.fn(), create: vi.fn() };
		vi.stubGlobal('PublicKeyCredential', { isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true) });
		Object.defineProperty(navigator, 'credentials', { configurable: true, value: credentials });
		localStorage.setItem('owltside.biometric.v1', JSON.stringify({ credentialId: 'old-passkey', userId: session.userId }));
		localStorage.setItem('owltside.biometric.users.v1', JSON.stringify({ [session.userId]: { credentialId: 'old-passkey' } }));
		sessionStorage.setItem('owltside.biometric.session.v1', session.userId);
		page.data.session = session;
		const children = createRawSnippet(() => ({ render: () => '<p>Tickets are available</p>' }));
		render(RootLayout, { children });
		await tick();
		expect(screen.getByText('Tickets are available')).toBeInTheDocument();
		expect(screen.queryByTestId('splash-biometric-gate')).not.toBeInTheDocument();
		vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
		document.dispatchEvent(new Event('visibilitychange'));
		await vi.advanceTimersByTimeAsync(6 * 60_000);
		vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
		document.dispatchEvent(new Event('visibilitychange'));
		await tick();
		expect(credentials.get).not.toHaveBeenCalled();
		expect(credentials.create).not.toHaveBeenCalled();
		expect(localStorage.getItem('owltside.biometric.v1')).toBeNull();
		expect(localStorage.getItem('owltside.biometric.users.v1')).toBeNull();
		expect(sessionStorage.getItem('owltside.biometric.session.v1')).toBeNull();
		delete (navigator as { credentials?: unknown }).credentials;
	});

	it.each(['/tickets', '//outside.example', '/', '/auth/login'])('sends signed-in splash visitors straight to a safe destination: %s', async (next) => {
		vi.useFakeTimers();
		page.data.session = session;
		page.url = new URL(`https://owltside.example/?next=${encodeURIComponent(next)}`) as typeof page.url;
		render(SplashPage);
		await tick();
		expect(screen.getByRole('progressbar', { name: 'Loading Owltside' })).toHaveAttribute('aria-valuenow', '0');
		await vi.advanceTimersByTimeAsync(180);
		const midNow = Number(screen.getByRole('progressbar', { name: 'Loading Owltside' }).getAttribute('aria-valuenow'));
		expect(midNow).toBeGreaterThan(0);
		await vi.advanceTimersByTimeAsync(4_000);
		expect(screen.getByRole('progressbar', { name: 'Loading Owltside' })).toHaveAttribute('aria-valuenow', '100');
		expect(mocks.goto).toHaveBeenCalledWith(next === '/tickets' ? '/tickets' : '/home', { replaceState: true });
		expect(screen.queryByText(/Face ID|fingerprint/i)).not.toBeInTheDocument();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('still sends signed-out splash visitors to email sign-in', async () => {
		vi.useFakeTimers();
		render(SplashPage);
		await tick();
		await vi.advanceTimersByTimeAsync(4_000);
		expect(mocks.goto).toHaveBeenCalledWith('/auth/login', { replaceState: true });
	});

	it('does not offer biometric controls in security settings', () => {
		render(SettingsDetails, { category: 'security' });
		expect(screen.queryByText(/Face ID|fingerprint|biometric|passkey/i)).not.toBeInTheDocument();
	});

	it('handles blocked browser storage without blocking entry', () => {
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Storage blocked'); });
		expect(() => clearRetiredBiometricStorage()).not.toThrow();
	});
});
