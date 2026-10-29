import type { PageServerLoad } from './$types';

/**
 * Automated moderation (incident / case management) is not yet backed by a
 * table in the public Supabase schema. The console exposes the page but shows
 * that the feature is not provisioned rather than fabricating seeded demo
 * cases.
 */
export const load: PageServerLoad = () => {
	return {
		cases: [],
		open: [],
		selected: null,
		selectedId: null,
		filters: { q: '', status: 'active', severity: 'high' },
		counts: { open: 0, critical: 0, quarantined: 0, avgResolutionMins: 0, appealSuccessPct: 0 },
		notProvisioned: true as const
	};
};
