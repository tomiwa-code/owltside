import type { PageServerLoad } from './$types';
import {
	auditFor,
	countUsers,
	listUsers,
	ordersForEmail,
	ticketsForHandle
} from '$admin/server/store';
import type { AdminUser } from '$admin/types';
import { adminDataSource, listSupabaseUsers } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as AdminUser['status'] | 'all';
	const role = url.searchParams.get('role') ?? 'all';
	const kyc = url.searchParams.get('kyc') ?? 'all';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;
	const requested = url.searchParams.get('user');
	const source = adminDataSource();
	if (source === 'supabase') {
		const live = await listSupabaseUsers({ q, status, role, kyc, page, perPage: 10 }, requested ?? undefined);
		return {
			table: { rows: live.page.rows, total: live.page.total, page: live.page.page, pages: live.page.pages, perPage: live.page.perPage },
			filters: { q, status, role, kyc },
			counts: live.counts,
			selectedId: live.selected?.id ?? null,
			selected: live.selected,
			related: live.related,
			source
		};
	}
	const table = listUsers({ q, status, role, kyc, page, perPage: 10 });
	const selected = table.rows.find((user) => user.id === requested) ?? table.rows[0] ?? null;

	return {
		table: { rows: table.rows, total: table.total, page: table.page, pages: table.pages, perPage: table.perPage },
		filters: { q, status, role, kyc },
		counts: countUsers(),
		selectedId: selected?.id ?? null,
		selected,
		related: selected
			? {
					tickets: ticketsForHandle(selected.handle, 4),
					orders: ordersForEmail(selected.email, 4),
					audit: auditFor(selected.id, 4)
				}
			: { tickets: [], orders: [], audit: [] },
		source
	};
};
