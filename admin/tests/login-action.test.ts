import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { readFileSync } from 'node:fs';

const { requestAdminOtp, authenticateWithOtp, startAdminGoogleSignIn } = vi.hoisted(() => ({
	requestAdminOtp: vi.fn(),
	authenticateWithOtp: vi.fn(),
	startAdminGoogleSignIn: vi.fn()
}));

vi.mock('$admin/server/auth', async (importOriginal) => {
	const original = await importOriginal<typeof import('../src/lib/server/auth')>();
	return {
		...original,
		requestAdminOtp,
		authenticateWithOtp,
		startAdminGoogleSignIn
	};
});

import { ADMIN_ACCESS_DENIED_MESSAGE } from '$admin/server/auth';
import { actions, load } from '../src/routes/login/+page.server';

beforeEach(() => {
	requestAdminOtp.mockReset();
	authenticateWithOtp.mockReset();
	startAdminGoogleSignIn.mockReset();
});

afterEach(() => {
	vi.unstubAllEnvs();
});

function makeEvent(fields: Record<string, string>, actionName = 'sendCode') {
	const form = new FormData();
	for (const [k, v] of Object.entries(fields)) form.set(k, v);
	return {
		request: new Request(`http://localhost:5174/login?/${actionName}`, { method: 'POST', body: form }),
		url: new URL(`http://localhost:5174/login?/${actionName}`),
		cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
		locals: { admin: null },
		getClientAddress: () => '127.0.0.1'
	};
}

describe('unified OTP + Google admin login route', () => {
	it('does not pre-fill any default email or fixed credentials in page data', async () => {
		const data = await load({
			locals: { admin: null },
			url: new URL('http://localhost:5174/login')
		} as never);
		expect(data).not.toHaveProperty('defaultEmail');
		expect(JSON.stringify(data)).not.toContain('admin@owltside.com');
		expect(JSON.stringify(data)).not.toContain('owltside-admin-2026');
	});

	it('returns 403 when a non-admin email requests a login code', async () => {
		requestAdminOtp.mockResolvedValue({
			ok: false,
			status: 403,
			error: ADMIN_ACCESS_DENIED_MESSAGE
		});
		const res = await actions.sendCode(makeEvent({ email: 'attendee@example.com' }) as never);
		expect(res).toMatchObject({
			status: 403,
			data: { error: ADMIN_ACCESS_DENIED_MESSAGE, email: 'attendee@example.com' }
		});
	});

	it('advances to OTP verification step for an authorized admin and issues session cookie on valid code', async () => {
		requestAdminOtp.mockResolvedValue({ ok: true, email: 'founder@example.com' });
		const step1 = await actions.sendCode(makeEvent({ email: 'founder@example.com' }) as never);
		expect(step1).toEqual({ codeSent: true, resent: false, email: 'founder@example.com' });

		authenticateWithOtp.mockResolvedValue({
			ok: true,
			expiresAt: new Date(Date.now() + 7_200_000),
			session: {
				id: 'sess-1',
				userId: '11111111-2222-4333-8444-555555555555',
				email: 'founder@example.com',
				name: 'Founder',
				initials: 'FO',
				role: 'Super Admin',
				tier: 0,
				auth: 'supabase-otp',
				ip: '127.0.0.1',
				demo: false
			}
		});

		const verifyEvent = makeEvent({ email: 'founder@example.com', code: '123456' }, 'verifyCode');
		let thrown: unknown;
		try {
			await actions.verifyCode(verifyEvent as never);
		} catch (e) {
			thrown = e;
		}
		expect(isRedirect(thrown)).toBe(true);
		expect(thrown).toMatchObject({ status: 303, location: '/dashboard' });
		expect(verifyEvent.cookies.set).toHaveBeenCalledWith(
			'owl_admin_session',
			expect.any(String),
			expect.objectContaining({ httpOnly: true, path: '/' })
		);
	});

	it('starts Google OAuth sign-in and redirects to provider URL', async () => {
		startAdminGoogleSignIn.mockResolvedValue({
			ok: true,
			url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test'
		});
		const googleEvent = makeEvent({ next: '/staff' }, 'google');
		let thrown: unknown;
		try {
			await actions.google(googleEvent as never);
		} catch (e) {
			thrown = e;
		}
		expect(isRedirect(thrown)).toBe(true);
		expect(thrown).toMatchObject({
			status: 303,
			location: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test'
		});
	});

	it('contains zero hardcoded dummy admins or fixed password credentials in store and auth', () => {
		const storeSrc = readFileSync('src/lib/server/store.ts', 'utf8');
		const authSrc = readFileSync('src/lib/server/auth.ts', 'utf8');
		const loginSrc = readFileSync('src/routes/login/+page.svelte', 'utf8');
		for (const forbidden of [
			'owltside-admin-2026',
			'admin@owltside.com',
			'adaeze@owltside.com',
			'chinedu@owltside.com',
			'zainab@owltside.com',
			'samuel@owltside.com',
			'folake@owltside.com',
			'ADMIN_PASSWORD',
			'ADMIN_EMAIL'
		]) {
			expect(storeSrc).not.toContain(forbidden);
			expect(authSrc).not.toContain(forbidden);
			expect(loginSrc).not.toContain(forbidden);
		}
	});
});
