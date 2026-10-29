import type { PageServerLoad } from './$types';
import { getSupabaseDashboard } from '$admin/server/supabase-data';
import type { AdminDashboard } from '$admin/types';

function emptyDashboard(reason: string): { dashboard: AdminDashboard; error: string; source: 'unavailable' } {
	const today = new Date().toISOString().slice(0, 10);
	return {
		source: 'unavailable',
		error: reason,
		dashboard: {
			rangeLabel: 'Last 30 days',
			grossNgn: 0,
			netNgn: 0,
			grossDelta: 0,
			passes: 0,
			passesDelta: 0,
			liveEvents: 0,
			eventsToday: 0,
			pendingReview: 0,
			activePasses: 0,
			refundsPending: 0,
			moderationOpen: 0,
			series: Array.from({ length: 30 }, (_, i) => {
				const d = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
				return { day: d, grossNgn: 0, passes: 0 };
			}),
			tierMix: [],
			categoryMix: [],
			topEvents: [],
			reviewQueue: [],
			recentOrders: [],
			systemHealth: [
				{ key: 'supabase', label: 'Supabase data', value: 'not connected', ok: false },
				{ key: 'orders', label: '30-day order volume', value: 'unavailable', ok: false },
				{ key: 'refunds', label: '30-day refunded orders', value: 'unavailable', ok: false },
				{ key: 'tickets', label: 'Ticket ledger', value: 'unavailable', ok: false }
			]
		}
	};
}

export const load: PageServerLoad = async () => {
	try {
		const dashboard = await getSupabaseDashboard();
		return { dashboard, error: '', source: 'supabase' as const };
	} catch (cause) {
		const reason = cause instanceof Error ? cause.message : 'The live dashboard could not be loaded.';
		return emptyDashboard(reason);
	}
};
