import type { PageServerLoad } from './$types';
import { getSupabaseSettlements } from '$admin/server/supabase-data';

function placeholder(msg: string) {
	const today = new Date();
	const days: { day: string; grossNgn: number; payoutNgn: number }[] = [];
	for (let i = 29; i >= 0; i -= 1) {
		const d = new Date(today.getTime() - i * 86_400_000);
		days.push({ day: d.toISOString().slice(0, 10), grossNgn: 0, payoutNgn: 0 });
	}
	return {
		notice: msg,
		range: { from: days[0].day, to: days[days.length - 1].day },
		grossNgn: 0,
		grossDelta: 0,
		settledNgn: 0,
		settledPct: 0,
		commissionNgn: 0,
		commissionRate: 0,
		escrowNgn: 0,
		escrowEvents: 0,
		refundedNgn: 0,
		refundedPct: 0,
		velocity: days,
		rows: [],
		totalProfiles: 0,
		totalSubaccounts: 0,
		peakDay: { day: today.toISOString().slice(0, 10), grossNgn: 0, payoutNgn: 0 },
		avgDaily: 0,
		onTimePct: 0,
		batchWindow: 'T+1 · 02:00 UTC'
	};
}

export const load: PageServerLoad = async () => {
	try {
		const settlements = await getSupabaseSettlements();
		return {
			notice: '',
			settlements,
			organizers: settlements.rows.map((r) => ({
				id: r.organizerId,
				name: r.name,
				subaccount: r.bank,
				clearedNgn: r.payoutNgn
			})),
			eligible: settlements.rows.filter((r) => r.state === 'next_batch').length,
			peaks: {
				peakDay: settlements.peakDay,
				avgDaily: settlements.avgDaily,
				onTimePct: settlements.onTimePct,
				batchWindow: settlements.batchWindow
			}
		};
	} catch (cause) {
		const msg = cause instanceof Error ? cause.message : 'Financial analytics could not be loaded.';
		const s = placeholder(msg);
		return {
			notice: s.notice,
			settlements: s,
			organizers: [],
			eligible: 0,
			peaks: { peakDay: s.peakDay, avgDaily: s.avgDaily, onTimePct: s.onTimePct, batchWindow: s.batchWindow }
		};
	}
};
