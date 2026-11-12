import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { queryClient } from '$lib/query/cache';

/**
 * Every test starts with a cold QueryClient. The browser app uses one singleton
 * cache, so without this a response mocked in one case would satisfy the query
 * in the next one (TanStack would correctly skip the fetch, and the test would
 * look broken).
 */
beforeEach(() => {
	queryClient.clearAll();
});
