// @ts-nocheck
import type { PageServerLoad } from './$types';
import { countEvents, listEvents, organizerOptions } from '$admin/server/store';
import { adminDataSource, listSupabaseEvents } from '$admin/server/supabase-data';
import type { PlatformStatus } from '$admin/types';

export const load = async ({ url }: Parameters<PageServerLoad>[0]) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as PlatformStatus | 'all';
	const category = url.searchParams.get('category') ?? 'all';
	const organizer = url.searchParams.get('organizer') ?? 'all';
	const sort = (url.searchParams.get('sort') ?? 'date') as 'date' | 'newest' | 'gmv';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;
	const source = adminDataSource();

	if (source === 'supabase') {
		const listed = await listSupabaseEvents({ q, status, category, organizer, sort, page, perPage: 7 });
		return {
			table: { rows: listed.rows, total: listed.total, page: listed.page, pages: listed.pages, perPage: listed.perPage },
			filters: { q, status, category, organizer, sort },
			options: { categories: listed.categories, organizers: listed.organizers, organizerList: listed.organizerList },
			counts: listed.counts,
			pending: [],
			selectedId: listed.rows[0]?.id ?? null,
			source
		};
	}

	const listed = listEvents({ q, status, category, organizer, sort, page, perPage: 7 });
	const pending = listEvents({ status: 'pending', perPage: 3 }).rows;
	const requested = url.searchParams.get('event');
	const selected = pending.find((event) => event.id === requested) ?? pending[0] ?? listed.rows[0] ?? null;
	return {
		table: { rows: listed.rows, total: listed.total, page: listed.page, pages: listed.pages, perPage: listed.perPage },
		filters: { q, status, category, organizer, sort },
		options: { categories: listed.categories, organizers: listed.organizers, organizerList: organizerOptions() },
		counts: countEvents(),
		pending,
		selectedId: selected?.id ?? null,
		source
	};
};
