/**
 * A tiny clock for "the server data changed".
 *
 * Cache-aware route loads compare their entry's `dataUpdatedAt` with this
 * clock: an entry written before the last successful form action is treated as
 * stale, so the load that SvelteKit re-runs after `update()`/a redirect
 * fetches instead of serving the value the action just replaced. This keeps
 * the cache-first navigation model honest without invalidating everything on
 * every route transition.
 */
let lastDataChange = 0;

export function markDataChanged(): void {
	lastDataChange = Date.now();
}

/** True when data cached at `at` predates the most recent mutation. */
export function dataChangedSince(at: number): boolean {
	return at > 0 && at < lastDataChange;
}

export function resetDataChangeClock(): void {
	lastDataChange = 0;
}
