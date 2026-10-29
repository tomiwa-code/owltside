import type { PageServerLoad } from './$types';

/**
 * Automated settlement / payout reconciliation is not yet backed by a table or
 * payout rail in the public Supabase schema. The page renders an empty-state
 * explaining that instead of fabricated seed data.
 */
export const load: PageServerLoad = () => {
	return {
		notProvisioned: true as const,
		settlements: null,
		organizers: [],
		eligible: 0,
		peaks: {
			peakDay: null,
			avgDaily: 0,
			onTimePct: 0,
			batchWindow: null
		}
	};
};
