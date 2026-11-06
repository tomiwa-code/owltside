import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
import { createAccessClient, getAdminAccess, ROLE_TIERS } from '$admin/server/admin-access';

beforeEach(() => {
	vi.stubEnv('PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
	vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'server-only-key');
	mocks.createClient.mockReturnValue({ from: mocks.from });
	mocks.from.mockReturnValue({ select: mocks.select });
	mocks.select.mockReturnValue({ eq: mocks.eq });
	mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
});

afterEach(() => vi.unstubAllEnvs());

describe('trusted database admin access', () => {
	it('creates isolated server clients without persisting Supabase sessions', () => {
		createAccessClient();
		expect(mocks.createClient).toHaveBeenCalledWith('https://test.supabase.co', 'server-only-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
		});
	});

	it('fails closed when required configuration is missing', () => {
		vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
		expect(() => createAccessClient()).toThrow(/configuration/);
	});

	it.each(Object.entries(ROLE_TIERS))('reads the trusted user ID and validates %s tier %s', async (role, tier) => {
		const row = { user_id: 'auth-user-1', name: 'Admin', role, tier, is_active: true, work_email: 'admin@owltside.com', session_version: 1 };
		mocks.maybeSingle.mockResolvedValue({ data: row, error: null });
		expect(await getAdminAccess('auth-user-1')).toEqual(row);
		expect(mocks.from).toHaveBeenCalledWith('admin_accounts');
		expect(mocks.select).toHaveBeenCalledWith('user_id, name, role, tier, is_active, work_email, session_version');
		expect(mocks.eq).toHaveBeenCalledWith('user_id', 'auth-user-1');
	});

	it.each([
		null,
		{ name: 'Admin', role: 'Super Admin', tier: 0, is_active: false },
		{ name: 'Admin', role: 'Read-only Auditor', tier: 0, is_active: true, work_email: 'admin@owltside.com', session_version: 1 },
		{ name: 'Admin', role: 'invented', tier: 0, is_active: true, work_email: 'admin@owltside.com', session_version: 1 },
		{ name: ' ', role: 'Super Admin', tier: 0, is_active: true, work_email: 'admin@owltside.com', session_version: 1 }
	])('rejects missing, inactive, or malformed access: %j', async (data) => {
		mocks.maybeSingle.mockResolvedValue({ data, error: null });
		expect(await getAdminAccess('auth-user-1')).toBeNull();
	});

	it.each([0, -1, undefined, 1.5])('rejects invalid credential session versions: %s', async (session_version) => {
		mocks.maybeSingle.mockResolvedValue({ data: { user_id: 'auth-user-1', name: 'Admin', role: 'Super Admin', tier: 0,
			is_active: true, work_email: 'admin@owltside.com', session_version }, error: null });
		expect(await getAdminAccess('auth-user-1')).toBeNull();
	});

	it('throws on lookup errors rather than returning any fallback admin', async () => {
		mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'private database details' } });
		await expect(getAdminAccess('auth-user-1')).rejects.toThrow('Admin access lookup failed.');
	});
});
