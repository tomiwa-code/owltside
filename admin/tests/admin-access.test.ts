import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSession } from '../src/lib/types';

const { mockClient } = vi.hoisted(() => ({
	mockClient: {
		from: vi.fn(),
		auth: {
			admin: {
				listUsers: vi.fn(),
				getUserById: vi.fn(),
				createUser: vi.fn()
			}
		}
	}
}));

vi.mock('../src/lib/server/supabase-data', async (importOriginal) => {
	const original = await importOriginal<typeof import('../src/lib/server/supabase-data')>();
	return {
		...original,
		createAdminClient: () => mockClient
	};
});

import {
	assignAdminRole,
	listAdminRoster,
	parseDbAdminRole,
	updateAdminRoleOrAccess
} from '../src/lib/server/admin-access';
import { POST as assignPost } from '../src/routes/api/staff/invite/+server';
import { POST as statusPost } from '../src/routes/api/staff/[id]/status/+server';

const SUPER_ID = '11111111-2222-4333-8444-555555555555';
const USER_ID = '22222222-3333-4444-8555-666666666666';
const NEW_USER_ID = '33333333-4444-4555-8666-777777777777';

const superActor: AdminSession = {
	id: 'sess-super',
	userId: SUPER_ID,
	email: 'founder@example.com',
	name: 'Founder',
	initials: 'FO',
	role: 'Super Admin',
	tier: 0,
	auth: 'supabase-otp',
	ip: '127.0.0.1',
	demo: false,
	issuedAt: new Date().toISOString(),
	expiresAt: new Date(Date.now() + 3_600_000).toISOString()
};

const adminActor: AdminSession = {
	...superActor,
	userId: USER_ID,
	role: 'Admin',
	tier: 1
};

describe('Roles & Admins directory and role assignment', () => {
	beforeEach(() => {
		mockClient.from.mockReset();
		mockClient.auth.admin.listUsers.mockReset();
		mockClient.auth.admin.getUserById.mockReset();
		mockClient.auth.admin.createUser.mockReset();
	});

	it('normalizes database role strings accurately', () => {
		expect(parseDbAdminRole('superadmin')).toBe('superadmin');
		expect(parseDbAdminRole('super admin')).toBe('superadmin');
		expect(parseDbAdminRole('Super_Admin')).toBe('superadmin');
		expect(parseDbAdminRole('admin')).toBe('admin');
		expect(parseDbAdminRole('Admin')).toBe('admin');
		expect(parseDbAdminRole('user')).toBeNull();
		expect(parseDbAdminRole('')).toBeNull();
		expect(parseDbAdminRole(null)).toBeNull();
	});

	it('lists only real Supabase admins with zero hardcoded dummy accounts', async () => {
		mockClient.from.mockReturnValue({
			select: () => ({
				order: async () => ({
					data: [
						{
							id: SUPER_ID,
							handle: 'founder',
							name: 'Founder',
							role: 'superadmin',
							city: 'Lagos',
							disabled: false,
							created_at: '2026-11-01T00:00:00Z'
						},
						{
							id: USER_ID,
							handle: 'regular',
							name: 'Regular User',
							role: 'user',
							city: 'Abuja',
							disabled: false,
							created_at: '2026-11-02T00:00:00Z'
						}
					],
					error: null
				})
			})
		});
		mockClient.auth.admin.listUsers.mockResolvedValue({
			data: {
				users: [
					{ id: SUPER_ID, email: 'founder@example.com', app_metadata: { providers: ['google', 'email'] } },
					{ id: USER_ID, email: 'regular@example.com', app_metadata: { providers: ['email'] } }
				]
			},
			error: null
		});

		const roster = await listAdminRoster();
		expect(roster.staff).toHaveLength(1);
		expect(roster.staff[0]).toMatchObject({
			id: SUPER_ID,
			email: 'founder@example.com',
			role: 'Super Admin',
			dbRole: 'superadmin',
			tier: 0
		});
		expect(roster.candidates).toEqual([
			{
				id: USER_ID,
				handle: 'regular',
				name: 'Regular User',
				email: 'regular@example.com'
			}
		]);
	});

	it('provisions a brand-new user by email and assigns Admin role for the dashboard', async () => {
		mockClient.auth.admin.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
		mockClient.auth.admin.createUser.mockResolvedValue({
			data: {
				user: {
					id: NEW_USER_ID,
					email: 'newadmin@example.com',
					user_metadata: { full_name: 'New Admin' }
				}
			},
			error: null
		});

		let call = 0;
		mockClient.from.mockImplementation(() => {
			call += 1;
			if (call === 1) {
				// existingProfile lookup -> none yet
				return {
					select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
				};
			}
			if (call === 2) {
				// handle collision check
				return {
					select: () => ({
						eq: () => ({ neq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
					})
				};
			}
			// upsert profile with role = 'admin'
			return {
				upsert: (payload: Record<string, unknown>) => ({
					select: () => ({
						single: async () => ({
							data: {
								id: payload.id,
								handle: payload.handle,
								name: payload.name,
								role: payload.role,
								city: null,
								disabled: false,
								created_at: '2026-11-06T12:00:00Z'
							},
							error: null
						})
					})
				})
			};
		});

		const assigned = await assignAdminRole(
			{ email: 'NewAdmin@example.com', name: 'New Admin', role: 'admin' },
			superActor
		);

		expect(mockClient.auth.admin.createUser).toHaveBeenCalledWith({
			email: 'newadmin@example.com',
			email_confirm: true,
			user_metadata: { full_name: 'New Admin' }
		});
		expect(assigned).toMatchObject({
			id: NEW_USER_ID,
			email: 'newadmin@example.com',
			role: 'Admin',
			dbRole: 'admin',
			tier: 1
		});
	});

	it('prevents a Super Admin from revoking or demoting their own account and blocks non-Super Admins', async () => {
		await expect(
			updateAdminRoleOrAccess(SUPER_ID, { role: 'user' }, superActor)
		).rejects.toMatchObject({ status: 409 });

		await expect(
			assignPost({
				locals: { admin: adminActor },
				request: new Request('http://admin.test/api/staff/invite', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email: 'someone@example.com', role: 'admin' })
				})
			} as never)
		).rejects.toMatchObject({ status: 403 });

		await expect(
			statusPost({
				params: { id: SUPER_ID },
				locals: { admin: adminActor },
				request: new Request(`http://admin.test/api/staff/${SUPER_ID}/status`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ role: 'user' })
				})
			} as never)
		).rejects.toMatchObject({ status: 403 });
	});
});
