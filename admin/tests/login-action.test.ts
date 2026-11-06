import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { existsSync, readFileSync } from 'node:fs';
import { actions, load } from '../src/routes/login/+page.server';

beforeEach(() => {
	for (const key of ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET', 'PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) vi.stubEnv(key, '');
	vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected database/network request'); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function event(email = 'admin@owltside.com', password = 'owltside-admin-2026') {
	const form = new FormData();
	form.set('email', email);
	form.set('password', password);
	return {
		request: new Request('http://localhost:5174/login?/credentials', { method: 'POST', body: form }),
		url: new URL('http://localhost:5174/login?/credentials'),
		cookies: { set: vi.fn(), get: vi.fn() },
		locals: { admin: null },
		getClientAddress: () => 'login-action-test'
	};
}

describe('database-free login route', () => {
	it('accepts default credentials and sets an HttpOnly cookie before redirecting', async () => {
		const input = event();
		let redirect: unknown;
		try { await actions.credentials(input as never); } catch (thrown) { redirect = thrown; }
		expect(isRedirect(redirect)).toBe(true);
		expect(redirect).toMatchObject({ status: 303, location: '/dashboard' });
		expect(input.cookies.set).toHaveBeenCalledWith('owl_admin_session', expect.any(String), expect.objectContaining({ httpOnly: true, path: '/' }));
		expect(fetch).not.toHaveBeenCalled();
	});

	it('returns a readable failure and no cookie for the wrong password', async () => {
		const input = event('admin@owltside.com', 'wrong-password');
		const result = await actions.credentials(input as never);
		expect(result).toMatchObject({ status: 401, data: { error: expect.stringContaining('Email or security password is incorrect.') } });
		expect(input.cookies.set).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('pre-fills only the email and never includes the password in page data', async () => {
		const result = await load(event() as never);
		expect(result).toMatchObject({ defaultEmail: 'admin@owltside.com' });
		expect(JSON.stringify(result)).not.toContain('owltside-admin-2026');
	});

	it('removes the obsolete login migrations and their combined-schema sections', () => {
		expect(existsSync('../supabase/sql/032_admin_accounts.sql')).toBe(false);
		expect(existsSync('../supabase/sql/033_admin_account_credentials.sql')).toBe(false);
		const sql = readFileSync('../supabase/sql/000_full_schema.sql', 'utf8');
		expect(sql).not.toContain('public.admin_accounts');
		expect(sql).not.toContain('sync_admin_account_credentials');
	});
});
