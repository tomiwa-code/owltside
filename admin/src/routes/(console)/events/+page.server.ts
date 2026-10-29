import type { PageServerLoad } from './$types';
import type { PlatformStatus } from '$admin/types';
import { listSupabaseEvents } from '$admin/server/supabase-data';
import { listSubmissions } from '$admin/server/moderation';

const emptyListed = {
	rows: [],
	total: 0,
	page: 1,
	pages: 1,
	perPage: 7,
	categories: [] as string[],
	organizers: [] as string[],
	organizerList: [] as { id: string; name: string }[],
	counts: { total: 0, published: 0, pending: 0, draft: 0, suspended: 0 }
};

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

	let listed: typeof emptyListed = emptyListed;
	let eventsError = '';
	try {
		listed = await listSupabaseEvents({ q, status, category, organizer, sort, page, perPage: 7 });
	} catch (cause) {
		eventsError = cause instanceof Error ? cause.message : 'The event catalog could not be loaded.';
	}

	const error = [eventsError, submissionError].filter(Boolean).join(' ');

	return {
		table: { rows: listed.rows, total: listed.total, page: listed.page, pages: listed.pages, perPage: listed.perPage },
		filters: { q, status, category, organizer, sort },
		options: { categories: listed.categories, organizers: listed.organizers, organizerList: listed.organizerList },
		counts: listed.counts,
		pending: [],
		selectedId: listed.rows[0]?.id ?? null,
		submissions,
		submissionError,
		error,
		source: eventsError ? ('unavailable' as const) : ('supabase' as const)
	};
};
