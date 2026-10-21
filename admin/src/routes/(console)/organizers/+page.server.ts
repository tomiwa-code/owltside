import type { PageServerLoad } from './$types';
import { countOrganizers, eventsForOrganizer, getOrganizer, listOrganizers } from '$admin/server/store';
import type { AdminOrganizer } from '$admin/types';

export const load: PageServerLoad = ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as AdminOrganizer['status'] | 'all';
	const tier = url.searchParams.get('tier') ?? 'all';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;
	const table = listOrganizers({ q, status, tier, page, perPage: 9 });
	const requested = url.searchParams.get('org');
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
		)
	};
};
