import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/supabase', () => ({ createSupabase: () => null, supabaseConfigured: () => false }));
vi.mock('$lib/server/datasource', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/datasource')>();
	return { ...actual, getSource: () => ({ listApprovals: async () => [] }) };
});

import { actions } from '../../src/routes/(app)/settings/+page.server';

const session = {
	userId: '11111111-1111-4111-8111-111111111111',
	email: 'ada@owltside.app',
	handle: 'ada',
	name: 'Ada Obi',
	role: 'attendee' as const,
	avatarUrl: null,
	demo: true
};

const formRequest = (confirmation: string) => {
	const body = new FormData();
	body.set('confirmation', confirmation);
	return new Request('http://localhost/settings?/deleteAccount', { method: 'POST', body });
};

const deleteAccount = actions.deleteAccount as unknown as (event: unknown) => Promise<unknown>;

const context = (confirmation: string, locals: Record<string, unknown> = { session, demoMode: true }) => {
	const cookies = { delete: vi.fn(), get: () => undefined, getAll: () => [], set: vi.fn() };
	return { request: formRequest(confirmation), cookies, locals } as never;
};

describe('delete account action', () => {
	it('asks for sign-in when there is no session', async () => {
		const result = (await deleteAccount(context('delete', { session: null, demoMode: true }))) as {
			status: number;
		};
		expect(result.status).toBe(401);
	});

	it('refuses to delete without the typed confirmation', async () => {
		const result = (await deleteAccount(context('nope'))) as { status: number; data: { error: string } };
		expect(result.status).toBe(400);
		expect(result.data.error).toMatch(/confirm/i);
	});

	it('accepts the account email and clears every session cookie', async () => {
		const event = context('ada@owltside.app') as unknown as {
			cookies: { delete: ReturnType<typeof vi.fn> };
		};
		await expect(deleteAccount(event)).rejects.toMatchObject({ status: 303, location: '/' });
		const removed = event.cookies.delete.mock.calls.map((call) => call[0]);
		expect(removed).toContain('owltside_demo_session');
		expect(removed).toContain('owltside_operating_identity');
	});

	it('accepts the DELETE keyword as a confirmation', async () => {
		await expect(deleteAccount(context('delete'))).rejects.toMatchObject({
			status: 303,
			location: '/'
		});
	});
});
