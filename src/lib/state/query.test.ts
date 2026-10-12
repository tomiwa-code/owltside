import { describe, expect, it, vi } from 'vitest';
import { queryClient } from './query.svelte';

describe('QueryClient cache', () => {
	it('stores and returns entries with timestamps', () => {
		queryClient.set('t:1', { hello: 'world' });
		const entry = queryClient.get<{ hello: string }>('t:1');
		expect(entry?.data.hello).toBe('world');
		expect(entry!.updatedAt).toBeGreaterThan(0);
	});

	it('notifies subscribers on set and invalidate', () => {
		const events: string[] = [];
		const unsub = queryClient.subscribe('t:2', (ev) => events.push(ev));
		queryClient.set('t:2', 1);
		queryClient.invalidate('t:2');
		unsub();
		queryClient.set('t:2', 2);
		expect(events).toEqual(['set', 'invalidate']);
	});

	it('invalidate drops cached data for the prefix', () => {
		queryClient.set('events:a', [1]);
		queryClient.set('events:b', [2]);
		queryClient.set('other', [3]);
		queryClient.invalidate('events:');
		expect(queryClient.get('events:a')).toBeUndefined();
		expect(queryClient.get('events:b')).toBeUndefined();
		expect(queryClient.get('other')).toBeDefined();
	});

	it('dedupes concurrent fetches', async () => {
		const fetcher = vi.fn(async () => 'data');
		const [a, b] = await Promise.all([
			queryClient.fetch('dedupe', fetcher),
			queryClient.fetch('dedupe', fetcher)
		]);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(a).toBe('data');
		expect(b).toBe('data');
	});
});
