import type { PageServerLoad } from './$types';
import type { AdminOrganizer } from '$admin/types';
import { listSupabaseOrganizers } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as AdminOrganizer['status'] | 'all';
	const tier = url.searchParams.get('tier') ?? 'all';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;
	const requested = url.searchParams.get('org');

	const live = await listSupabaseOrganizers({ q, status, tier, page, perPage: 9 }, requested ?? undefined);
	return {
		table: { rows: live.page.rows, total: live.page.total, page: live.page.page, pages: live.page.pages, perPage: live.page.perPage },
		filters: { q, status, tier },
		counts: live.counts,
		selectedId: live.selected?.id ?? null,
		selected: live.selected,
		pipelines: live.pipelines,
		source: 'supabase' as const
	};
};
