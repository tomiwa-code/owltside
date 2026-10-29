import type { PageServerLoad } from './$types';
import type { AdminUser } from '$admin/types';
import { listSupabaseUsers } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as AdminUser['status'] | 'all';
	const role = url.searchParams.get('role') ?? 'all';
	const kyc = url.searchParams.get('kyc') ?? 'all';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;
	const requested = url.searchParams.get('user');

	const live = await listSupabaseUsers({ q, status, role, kyc, page, perPage: 10 }, requested ?? undefined);
	return {
		table: { rows: live.page.rows, total: live.page.total, page: live.page.page, pages: live.page.pages, perPage: live.page.perPage },
		filters: { q, status, role, kyc },
		counts: live.counts,
		selectedId: live.selected?.id ?? null,
		selected: live.selected,
		related: live.related,
		source: 'supabase' as const
	};
};
