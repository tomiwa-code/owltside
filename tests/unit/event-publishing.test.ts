// @vitest-environment node
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const source = vi.hoisted(() => ({ createEvent: vi.fn(), searchProfiles: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ createSupabase: () => null }));
vi.mock('$lib/server/datasource', () => ({ getSource: () => source }));
import { actions } from '../../src/routes/(app)/organizer/create/+page.server';

let poster: string;
beforeEach(async () => {
	vi.resetAllMocks();
	source.createEvent.mockResolvedValue({ id: 'created-event' });
	poster = `data:image/png;base64,${(await sharp({ create: { width: 640, height: 360, channels: 3, background: '#abcdef' } }).png().toBuffer()).toString('base64')}`;
});
const draft = () => ({ poster, title: 'My real event', category: 'music', date: '2099-11-20', dateEnd: '2099-11-21', venue: 'Actual venue', city: 'Lagos', description: 'An event with an actual description.', tiers: [{ name: 'Regular', price: 1000, capacity: 50 }] });
async function publish(payload: unknown, signedIn = true) {
	const body = new FormData(); body.set('draft', JSON.stringify(payload));
	return actions.create!({ request: new Request('http://localhost/organizer/create', { method: 'POST', body }), cookies: { get: () => 'organizer' }, locals: { session: signedIn ? { userId: 'signed-in-user', role: 'organizer' } : null } } as never);
}
describe('publishing validation and failure UI', () => {
	it('requires sign-in', async () => {
		expect(await publish(draft(), false)).toMatchObject({ status: 401 });
		expect(source.createEvent).not.toHaveBeenCalled();
	});
	it('rejects missing/corrupt posters instead of inventing artwork', async () => {
		for (const value of ['', 'data:image/jpeg;base64,YmFk']) {
			expect(await publish({ ...draft(), poster: value })).toMatchObject({ status: 400 });
		}
		expect(source.createEvent).not.toHaveBeenCalled();
	});
	it('rejects bad dates, descriptions, venues, and tiers', async () => {
		for (const override of [{ date: 'nonsense' }, { date: '2020-01-01' }, { dateEnd: '2099-01-01' }, { description: '' }, { venue: ' ' }, { tiers: [] }, { tiers: [{ name: 'Regular', price: -1, capacity: 0 }] }]) {
			expect(await publish({ ...draft(), ...override })).toMatchObject({ status: 400 });
		}
		expect(source.createEvent).not.toHaveBeenCalled();
	});
	it('stores only supplied event details plus the decoded poster, then redirects', async () => {
		await expect(publish(draft())).rejects.toMatchObject({ status: 303, location: '/organizer/events/created-event' });
		expect(source.createEvent).toHaveBeenCalledWith('signed-in-user', expect.objectContaining({ title: 'My real event', description: draft().description, cover: expect.objectContaining({ src: expect.stringMatching(/^data:image\/jpeg;base64,/) }), startsAt: '2099-11-20T09:00:00+01:00' }));
	});
	it('passes normalized organizer promo codes to the datasource without trusting client use counts', async () => {
		const payload = {
			...draft(),
			promos: [{ code: 'early bird', percent: 15, maxUses: 25, uses: 999 }]
		};

		await expect(publish(payload)).rejects.toMatchObject({ status: 303, location: '/organizer/events/created-event' });
		expect(source.createEvent).toHaveBeenCalledWith('signed-in-user', expect.objectContaining({
			promos: [{ code: 'EARLY-BIRD', percent: 15, maxUses: 25 }]
		}));
	});
	it('rejects duplicate promo codes after normalization', async () => {
		const payload = {
			...draft(),
			promos: [
				{ code: 'early bird', percent: 15, maxUses: 25 },
				{ code: 'EARLY-BIRD', percent: 20, maxUses: 10 }
			]
		};

		expect(await publish(payload)).toMatchObject({ status: 400 });
		expect(source.createEvent).not.toHaveBeenCalled();
	});
	it('uses the invited profile avatar resolved on the server', async () => {
		source.searchProfiles.mockResolvedValue([{
			id: 'speaker-profile', handle: 'guesthost', name: 'Guest Host', avatarColor: '#123456',
			avatarUrl: 'https://cdn.example.test/guest.jpg', followers: 12, following: 4, city: 'Lagos'
		}]);
		const payload = {
			...draft(),
			speakers: [{ id: 'speaker-profile', handle: 'guesthost', name: 'Guest Host', avatarUrl: 'https://untrusted.example.test/avatar.jpg', role: 'Panelist', invited: true }]
		};

		await expect(publish(payload)).rejects.toMatchObject({ status: 303, location: '/organizer/events/created-event' });
		expect(source.createEvent).toHaveBeenCalledWith('signed-in-user', expect.objectContaining({
			speakers: [expect.objectContaining({ avatarUrl: 'https://cdn.example.test/guest.jpg' })]
		}));
	});
	it('returns a recoverable error on DB failure without reporting success', async () => {
		source.createEvent.mockRejectedValue(new Error('private database details'));
		const result = await publish(draft());
		expect(result).toMatchObject({ status: 503, data: { error: expect.stringContaining('draft is still here') } });
		expect(JSON.stringify(result)).not.toContain('private database details');
	});
});
