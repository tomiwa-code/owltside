import QueryProbe from '../QueryProbe.svelte';
import { render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { queryClient } from '$lib/query/cache';
import { keyMatchesPrefix, queryKeys } from '$lib/query/keys';
import { readPersistedEntry, writePersisted } from '$lib/query/persist';

describe('TanStack Query cache facade', () => {
	it('stores data with a timestamp and answers via the array key', () => {
		queryClient.set(queryKeys.badges, { unread: 2, inboxUnread: 1, requests: 0 });
		const entry = queryClient.get<{ unread: number }>(queryKeys.badges);
		expect(entry?.data.unread).toBe(2);
		expect(entry!.updatedAt).toBeGreaterThan(0);
	});

	it('marks a fresh entry as fresh and an old one as stale', async () => {
		queryClient.set('freshness', 1);
		expect(queryClient.isFresh('freshness', 60_000)).toBe(true);
		expect(queryClient.isFresh('freshness', -1)).toBe(false);
	});

	it('dedupes concurrent fetches for the same key', async () => {
		const fetcher = vi.fn(async () => 'data');
		const [a, b] = await Promise.all([
			queryClient.ensure('dedupe', fetcher, 0),
			queryClient.ensure('dedupe', fetcher, 0)
		]);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(a).toBe('data');
		expect(b).toBe('data');
	});

	it('invalidates by prefix across the whole family', () => {
		queryClient.set(queryKeys.conversations, []);
		queryClient.set(queryKeys.messages('c1'), []);
		queryClient.set(queryKeys.tickets, []);
		queryClient.invalidate('messages:');
		expect(queryClient.get(queryKeys.messages('c1'))).toBeUndefined();
		expect(queryClient.get(queryKeys.conversations)).toBeDefined();
		expect(queryClient.get(queryKeys.tickets)).toBeDefined();
	});

	it('recognises the string and array key forms when matching prefixes', () => {
		expect(keyMatchesPrefix('conversations:mine', 'conversations:')).toBe(true);
		expect(keyMatchesPrefix(['conversations:mine'], 'conversations:')).toBe(true);
		expect(keyMatchesPrefix(['tickets:mine'], 'conversations:')).toBe(false);
	});
});

describe('persisted catalogue', () => {
	it('round-trips a payload with its timestamp', () => {
		writePersisted('test:persist', { hello: 'world' });
		const entry = readPersistedEntry<{ hello: string }>('test:persist', 60_000);
		expect(entry?.data.hello).toBe('world');
		expect(entry!.at).toBeGreaterThan(0);
	});

	it('ignores a snapshot older than the allowed age', () => {
		writePersisted('test:expired', [1]);
		expect(readPersistedEntry('test:expired', -1)).toBeUndefined();
	});
});

describe('createAppQuery hydration', () => {
	it('moves pending → success and renders fetched data', async () => {
		const fetcher = vi.fn(async () => 'hello from tanstack');
		render(QueryProbe, { fetcher });
		await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('hello from tanstack'));
		expect(screen.getByTestId('status')).toHaveTextContent('success');
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('uses server-rendered initialData without refetching while fresh', async () => {
		const fetcher = vi.fn(async () => 'network');
		render(QueryProbe, { fetcher, initialData: 'from the server', staleTime: 60_000 });
		await tick();
		expect(screen.getByTestId('data')).toHaveTextContent('from the server');
		expect(screen.getByTestId('status')).toHaveTextContent('success');
		// The page load already paid for this data; mounting must not repeat it.
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(fetcher).not.toHaveBeenCalled();
	});
});
