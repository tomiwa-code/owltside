import type { PageServerLoad } from './$types';
import type { AdminOrganizer } from '$admin/types';
import { listSupabaseOrganizers } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as AdminOrganizer['status'] | 'all';
	const tier = url.searchParams.get('tier') ?? 'all';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;
	const requested = url.searchParams.get('org');

	try {
		const live = await listSupabaseOrganizers({ q, status, tier, page, perPage: 9 }, requested ?? undefined);
		return {
			table: { rows: live.page.rows, total: live.page.total, page: live.page.page, pages: live.page.pages, perPage: live.page.perPage },
			filters: { q, status, tier },
			counts: live.counts,
			selectedId: live.selected?.id ?? null,
			selected: live.selected,
			pipelines: live.pipelines,
			error: '',
			source: 'supabase' as const
		};
	} catch (cause) {
		const error = cause instanceof Error ? cause.message : 'The organizer directory could not be loaded.';
		return {
			table: { rows: [] as AdminOrganizer[], total: 0, page: 1, pages: 1, perPage: 9 },
			filters: { q, status, tier },
			counts: { total: 0, pending: 0, verified: 0, flagged: 0, tier1: 0, payoutVolumeNgn: 0 },
			selectedId: null as string | null,
			selected: null as AdminOrganizer | null,
			pipelines: {} as Record<string, { id: string; title: string; sold: number }[]>,
			error,
			source: 'unavailable' as const
		};
	}
};
