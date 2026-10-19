import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('$lib/server/supabase', () => ({ createSupabase: () => state.db }));
import { actions } from '../../src/routes/(app)/settings/+page.server';
import { hasOrganizerIdentity } from '$lib/server/organizer-access';

beforeEach(() => {
	state.db = {
		auth: { updateUser: vi.fn().mockResolvedValue({ error: null }) },
		from: vi.fn(() => ({
			update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))
		}))
	};
});
async function switchRole(identity: string, options: { demo?: boolean; guest?: boolean; returnTo?: string } = {}) {
	const form = new FormData(); form.set('identity', identity); if (options.returnTo) form.set('returnTo', options.returnTo);
	const set = vi.fn();
	const event = { request: new Request('http://localhost/settings?/setIdentity', { method: 'POST', body: form }), cookies: { set }, locals: { session: options.guest ? null : { userId: 'me', demo: options.demo } } };
	try { return { result: await actions.setIdentity!(event as never), set }; }
	catch (result) { return { result, set }; }
}
describe('account role switching', () => {
	it('persists each supported mode to the authenticated account and returns to the profile', async () => {
		for (const identity of ['organizer', 'attendee', 'guest']) {
			const { result, set } = await switchRole(identity, { returnTo: '/profile' });
			expect(state.db.auth.updateUser).toHaveBeenLastCalledWith({ data: { operating_identity: identity } });
			expect(set).toHaveBeenCalledWith('owltside_operating_identity', identity, expect.objectContaining({ httpOnly: true, path: '/' }));
			expect(result).toMatchObject({ status: 303, location: '/profile' });
		}
	});
	it('mirrors the chosen identity onto the public profile so chat peers can see it', async () => {
		const eq = vi.fn().mockResolvedValue({ error: null });
		const update = vi.fn(() => ({ eq }));
		state.db.from = vi.fn(() => ({ update }));
		await switchRole('organizer');
		expect(state.db.from).toHaveBeenCalledWith('profiles');
		expect(update).toHaveBeenCalledWith({ operating_identity: 'organizer' });
		expect(eq).toHaveBeenCalledWith('id', 'me');
	});
	it('still switches when the public profile mirror is unavailable (un-migrated database)', async () => {
		state.db.from = vi.fn(() => { throw new Error('column does not exist'); });
		const { result, set } = await switchRole('organizer');
		expect(result).toMatchObject({ status: 303 });
		expect(set).toHaveBeenCalled();
	});
	it('does not grant a role to unauthenticated users or accept unknown roles', async () => {
		expect((await switchRole('organizer', { guest: true })).result).toMatchObject({ status: 401 });
		expect((await switchRole('admin')).result).toMatchObject({ status: 400 });
		expect(state.db.auth.updateUser).not.toHaveBeenCalled();
	});
	it('keeps the existing cookie/mode when saving fails', async () => {
		state.db.auth.updateUser.mockResolvedValue({ error: new Error('DB error') });
		const { result, set } = await switchRole('organizer');
		expect(result).toMatchObject({ status: 503 }); expect(set).not.toHaveBeenCalled();
	});
	it('handles network failures without reporting success', async () => {
		state.db.auth.updateUser.mockRejectedValue(new Error('offline'));
		const { result, set } = await switchRole('organizer');
		expect(result).toMatchObject({ status: 503 }); expect(set).not.toHaveBeenCalled();
	});
	it('demo switches persist in the cookie without requiring Supabase', async () => {
		state.db = null;
		const { result, set } = await switchRole('organizer', { demo: true });
		expect(result).toMatchObject({ status: 303, location: '/organizer' }); expect(set).toHaveBeenCalled();
	});
	it('rejects external return URLs', async () => {
		expect((await switchRole('organizer', { returnTo: 'https://evil.example' })).result).toMatchObject({ location: '/organizer' });
	});
	it('organizer mode checks use the authenticated session, not an arbitrary cookie', () => {
		expect(hasOrganizerIdentity(null)).toBe(false);
		expect(hasOrganizerIdentity({ role: 'attendee' } as never)).toBe(false);
		expect(hasOrganizerIdentity({ role: 'organizer' } as never)).toBe(true);
	});
});
