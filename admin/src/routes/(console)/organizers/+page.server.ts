import type { PageServerLoad } from './$types';
import { countOrganizers, eventsForOrganizer, getOrganizer, listOrganizers } from '$admin/server/store';
import type { AdminOrganizer } from '$admin/types';
import { adminDataSource, listSupabaseOrganizers } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as AdminOrganizer['status'] | 'all';
	const tier = url.searchParams.get('tier') ?? 'all';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;
	const source = adminDataSource();
	const requested = url.searchParams.get('org');
	if (source === 'supabase') {
		const live = await listSupabaseOrganizers({ q, status, tier, page, perPage: 9 }, requested ?? undefined);
		return {
			table: { rows: live.page.rows, total: live.page.total, page: live.page.page, pages: live.page.pages, perPage: live.page.perPage },
			filters: { q, status, tier },
			counts: live.counts,
			selectedId: live.selected?.id ?? null,
			selected: live.selected,
			pipelines: live.pipelines,
			source
		};
	}
	const table = listOrganizers({ q, status, tier, page, perPage: 9 });
	const selected =
		getOrganizer(requested ?? '') ??
		table.rows.find((org) => org.status === 'flagged') ??
		table.rows.find((org) => org.status === 'pending') ??
		table.rows[0] ??
		null;

	return {
		table: { rows: table.rows, total: table.total, page: table.page, pages: table.pages, perPage: table.perPage },
		filters: { q, status, tier },
		counts: countOrganizers(),
		selectedId: selected?.id ?? null,
		selected: selected ?? null,
		pipelines: Object.fromEntries(
			[...new Set([...table.rows.map((org) => org.id), selected?.id].filter(Boolean) as string[])].map((id) => [
				id,
				eventsForOrganizer(id)
					.slice(0, 3)
					.map((event) => ({ id: event.id, title: event.title, sold: event.sold }))
			])
		),
		source
	};
};
