import type { PageServerLoad } from './$types';

/**
 * The cross-entity command palette previously searched only the in-memory
 * demo store. In Supabase-only mode we return no results until a federated
 * live search is wired up; the UI renders an empty-state accordingly.
 */
export const load: PageServerLoad = ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	return {
		results: {
			query: q,
			scope: { users: 0, events: 0, tickets: 0, orders: 0 },
			elapsedMs: 0,
			users: [],
			events: [],
			tickets: [],
			orders: [],
			organizers: [],
			cases: []
		},
		q,
		notProvisioned: true as const
	};
};
