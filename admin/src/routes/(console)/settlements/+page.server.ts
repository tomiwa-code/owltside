import type { PageServerLoad } from './$types';
import { getSettlements, organizerOptions } from '$admin/server/store';

export const load: PageServerLoad = () => {
	const settlements = getSettlements();
	return {
		settlements,
		organizers: organizerOptions(),
		eligible: settlements.rows.filter((row) => row.state === 'settled' || row.state === 'next_batch').length,
		peaks: {
			peakDay: settlements.velocity.reduce((best, day) => (day.grossNgn > best.grossNgn ? day : best), settlements.velocity[0]),
			avgDaily: Math.round(settlements.velocity.reduce((sum, day) => sum + day.grossNgn, 0) / settlements.velocity.length),
			onTimePct: 99.8,
			batchWindow: settlements.range
		}
	};
};
