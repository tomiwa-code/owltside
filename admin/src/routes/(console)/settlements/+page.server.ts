import type { PageServerLoad } from './$types';
import type { SettlementsData } from '$admin/types';

/**
 * Automated settlement / payout reconciliation is not yet backed by a table or
 * payout rail in the public Supabase schema. The page renders a zero-filled
 * placeholder plus an explanatory banner instead of fabricated seed data.
 */
function emptySettlements(): SettlementsData {
	const today = new Date();
	const days: { day: string; grossNgn; payoutNgn: number }[] = [];
	for (let i = 29; i >= 0; i -= 1) {
		const d = new Date(today.getTime() - i * 86_400_000);
		days.push({ day: d.toISOString().slice(0, 10), grossNgn: 0, payoutNgn: 0 });
	}
	return {
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
		totalSubaccounts: 0
	};
}

export const load: PageServerLoad = () => {
	return {
		notProvisioned: true as const,
		notice: 'Settlement rail not yet provisioned — no payout/settlement table exists in the public Supabase schema. The panel below shows zero placeholders; wire a settlements table and Paystack subaccount webhooks to populate real data.',
		settlements: emptySettlements(),
		organizers: [] as { id: string; name: string; subaccount: string; clearedNgn: number }[],
		eligible: 0,
		peaks: {
			peakDay: { day: new Date().toISOString().slice(0, 10), grossNgn: 0, payoutNgn: 0 },
			avgDaily: 0,
			onTimePct: 0,
			batchWindow: 'T+1 · 02:00 UTC'
		}
	};
};
