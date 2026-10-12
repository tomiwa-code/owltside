import QueryProbe from '../QueryProbe.svelte';
import { render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

describe('useQuery (component integration)', () => {
	it('moves pending → success and renders fetched data', async () => {
		const fetcher = vi.fn(async () => 'hello from cache-layer');
		render(QueryProbe, { fetcher });
		await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('hello from cache-layer'));
		expect(screen.getByTestId('status')).toHaveTextContent('success');
		expect(fetcher).toHaveBeenCalled();
	});
});
