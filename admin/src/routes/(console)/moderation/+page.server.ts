import type { PageServerLoad } from './$types';
import type { AdminCase } from '$admin/types';

export const load: PageServerLoad = () => {
	return {
		cases: [] as AdminCase[],
		open: [] as AdminCase[],
		selected: null as AdminCase | null,
		selectedId: null as string | null,
		filters: { q: '', status: 'active', severity: 'high' },
		counts: { open: 0, critical: 0, quarantined: 0, avgResolutionMins: 0, appealSuccessPct: 0 },
		notProvisioned: true as const
	};
};
