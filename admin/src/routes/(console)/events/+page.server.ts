import type { PageServerLoad } from './$types';
import type { PlatformStatus } from '$admin/types';
import { listSupabaseEvents } from '$admin/server/supabase-data';
import { listSubmissions } from '$admin/server/moderation';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as PlatformStatus | 'all';
	const category = url.searchParams.get('category') ?? 'all';
	const organizer = url.searchParams.get('organizer') ?? 'all';
	const sort = (url.searchParams.get('sort') ?? 'date') as 'date' | 'newest' | 'gmv';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;

	let submissions: Awaited<ReturnType<typeof listSubmissions>> = [];
	let submissionError = '';
	try {
		submissions = await listSubmissions();
	} catch (cause) {
		submissionError =
			cause instanceof Error
				? `The live submission queue could not be loaded: ${cause.message}`
				: 'The live submission queue could not be loaded.';
	}

	const listed = await listSupabaseEvents({ q, status, category, organizer, sort, page, perPage: 7 });

	return {
		table: { rows: listed.rows, total: listed.total, page: listed.page, pages: listed.pages, perPage: listed.perPage },
		filters: { q, status, category, organizer, sort },
		options: { categories: listed.categories, organizers: listed.organizers, organizerList: listed.organizerList },
		counts: listed.counts,
		pending: [],
		selectedId: listed.rows[0]?.id ?? null,
		submissions,
		submissionError,
		source: 'supabase' as const
	};
};
