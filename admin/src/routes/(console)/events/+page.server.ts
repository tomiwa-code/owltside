import type { PageServerLoad } from './$types';
import { countEvents, listEvents, organizerOptions } from '$admin/server/store';
import {
	listSubmissions,
	moderationMode,
	type EventSubmission,
	type ModerationMode
} from '$admin/server/moderation';
import { adminDataSource, listSupabaseEvents, liveFailure } from '$admin/server/supabase-data';
import type { PlatformStatus } from '$admin/types';

function submissionError(cause: unknown): string {
	return cause instanceof Error
		? `The live submission queue could not be loaded: ${cause.message}`
		: 'The live submission queue could not be loaded.';
}

/** Live queue failures are a banner, not a page-level 500. */
async function loadSubmissions(): Promise<{ rows: EventSubmission[]; error: string }> {
	try {
		return { rows: await listSubmissions(), error: '' };
	} catch (cause) {
		return { rows: [], error: submissionError(cause) };
	}
}

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as PlatformStatus | 'all';
	const category = url.searchParams.get('category') ?? 'all';
	const organizer = url.searchParams.get('organizer') ?? 'all';
	const sort = (url.searchParams.get('sort') ?? 'date') as 'date' | 'newest' | 'gmv';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;
	const source = adminDataSource();
	const mode: ModerationMode = moderationMode();
	const submissions = await loadSubmissions();

	if (source === 'supabase') {
		let listed: Awaited<ReturnType<typeof listSupabaseEvents>>;
		try {
			listed = await listSupabaseEvents({ q, status, category, organizer, sort, page, perPage: 7 });
		} catch (cause) {
			liveFailure('events', cause);
		}
		return {
			table: { rows: listed.rows, total: listed.total, page: listed.page, pages: listed.pages, perPage: listed.perPage },
			filters: { q, status, category, organizer, sort },
			options: { categories: listed.categories, organizers: listed.organizers, organizerList: listed.organizerList },
			counts: listed.counts,
			pending: [],
			selectedId: listed.rows[0]?.id ?? null,
			// The queue renders in both modes: these keys are what the page reads.
			submissions: submissions.rows,
			submissionMode: mode,
			submissionError: submissions.error,
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
		submissions: submissions.rows,
		submissionMode: mode,
		submissionError: submissions.error,
		source
	};
};
