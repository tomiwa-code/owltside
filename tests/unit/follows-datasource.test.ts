import { demoSource, supabaseSource } from '$lib/server/datasource';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

describe('follow persistence datasource', () => {
	it('demo follows are idempotent and lists/counts describe the same relationships', async () => {
		const profiles = await demoSource.searchProfiles('amina');
		const target = profiles[0];
		expect(target).toBeDefined();
		await demoSource.setFollow('u-ada', target.id, true);
		await demoSource.setFollow('u-ada', target.id, true);
		expect(await demoSource.getFollowingIds('u-ada')).toEqual([target.id]);
		expect((await demoSource.getConnections('u-ada', 'following')).map((p) => p.id)).toEqual([target.id]);
		expect((await demoSource.getProfile(target.handle))?.followers).toBe(1);
		await demoSource.setFollow('u-ada', target.id, false);
		expect(await demoSource.getFollowingIds('u-ada')).toEqual([]);
		expect((await demoSource.getProfile(target.handle))?.followers).toBe(0);
	});
	it('Supabase writes authenticated ids and does not store counts in the browser', async () => {
		const chain = { upsert: vi.fn().mockResolvedValue({ error: null }), delete: vi.fn(), eq: vi.fn(), then: (fn: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(fn) };
		chain.delete.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
		const from = vi.fn().mockReturnValue(chain);
		const source = supabaseSource({ from } as unknown as SupabaseClient);
		await source.setFollow('me', 'them', true);
		expect(from).toHaveBeenCalledWith('profile_follows');
		expect(chain.upsert).toHaveBeenCalledWith({ follower_id: 'me', following_id: 'them' }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true });
		await source.setFollow('me', 'them', false);
		expect(chain.eq.mock.calls).toEqual([['follower_id', 'me'], ['following_id', 'them']]);
		await expect(source.setFollow('me', 'me', true)).rejects.toThrow('yourself');
	});
	it('finds profiles by name as well as handle and events by venue', async () => {
		expect((await demoSource.searchProfiles('Amina')).length).toBeGreaterThan(0);
		const events = await demoSource.listEvents();
		const venue = events[0].venue;
		expect((await demoSource.listEvents({ query: venue })).some((e) => e.id === events[0].id)).toBe(true);
	});
});
