import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { AdminOrder } from '$admin/types';
import { getSupabaseOrganizer, listSupabaseOrders } from '$admin/server/supabase-data';
import { auditFor } from '$admin/server/store';

export const load: PageServerLoad = async ({ params }) => {
	const live = await getSupabaseOrganizer(params.id);
	if (!live) error(404, 'Organizer profile not found.');

	const eventIds = new Set(live.events.map((ev) => ev.id));
	let orders: AdminOrder[] = [];
	if (eventIds.size > 0) {
		const ordersRes = await listSupabaseOrders({ page: 1, perPage: 50 }).catch(() => ({
			page: { rows: [] as AdminOrder[] }
		}));
		orders = ordersRes.page.rows.filter((o) => eventIds.has(o.eventId)).slice(0, 10);
	}

	return {
		organizer: live.organizer,
		events: live.events,
		orders,
		audit: auditFor(live.organizer.id, 10),
		source: 'supabase' as const
	};
};
