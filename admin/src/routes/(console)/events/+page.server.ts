import type { PageServerLoad } from './$types';
import { countEvents, listEvents, organizerOptions } from '$admin/server/store';
import {
	listSubmissions,
	moderationMode,
	type EventSubmission,
	type ModerationMode
} from '$admin/server/moderation';
import type { PlatformStatus } from '$admin/types';
import { adminDataSource, listSupabaseEvents } from '$admin/server/supabase-data';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const status = (url.searchParams.get('status') ?? 'all') as PlatformStatus | 'all';
	const category = url.searchParams.get('category') ?? 'all';
	const organizer = url.searchParams.get('organizer') ?? 'all';
	const sort = (url.searchParams.get('sort') ?? 'date') as 'date' | 'newest' | 'gmv';
	const page = Number(url.searchParams.get('page') ?? '1') || 1;
	const source = adminDataSource();

	if (source === 'supabase') {
		const listed = await listSupabaseEvents({ q, status, category, organizer, sort, page, perPage: 7 });
		// Keep the submission-queue fetch resilient — a broken Supabase credential
		// should surface as a banner, not a crashed screen (same pattern as demo).
		const supabaseMode: ModerationMode = moderationMode();
		let supabaseSubmissions: EventSubmission[] = [];
		let supabaseSubmissionError = '';
		try {
			supabaseSubmissions = await listSubmissions();
		} catch (cause) {
			supabaseSubmissionError =
				cause instanceof Error
					? `The live submission queue could not be loaded: ${cause.message}`
					: 'The live submission queue could not be loaded.';
		}
		return {
			table: { rows: listed.rows, total: listed.total, page: listed.page, pages: listed.pages, perPage: listed.perPage },
			filters: { q, status, category, organizer, sort },
			options: { categories: listed.categories, organizers: listed.organizers, organizerList: listed.organizerList },
			counts: listed.counts,
			pending: [],
			selectedId: listed.rows[0]?.id ?? null,
			submissions: supabaseSubmissions,
			submissionMode: supabaseMode,
			submissionError: supabaseSubmissionError,
			source
		};
	}

	const listed = listEvents({ q, status, category, organizer, sort, page, perPage: 7 });
	const pending = listEvents({ status: 'pending', perPage: 3 }).rows;
	const requested = url.searchParams.get('event');
	const selected = pending.find((event) => event.id === requested) ?? pending[0] ?? listed.rows[0] ?? null;

	// Organizer submissions (live Supabase queue when configured). A broken
	// credential surfaces as a readable banner instead of a crashed console.
	const mode: ModerationMode = moderationMode();
	let submissions: EventSubmission[] = [];
	let submissionError = '';
	try {
		submissions = await listSubmissions();
	} catch (cause) {
		submissionError =
			cause instanceof Error
				? `The live submission queue could not be loaded: ${cause.message}`
				: 'The live submission queue could not be loaded.';
	}

	return {
		table: { rows: listed.rows, total: listed.total, page: listed.page, pages: listed.pages, perPage: listed.perPage },
		filters: { q, status, category, organizer, sort },
		options: { categories: listed.categories, organizers: listed.organizers, organizerList: organizerOptions() },
		counts: countEvents(),
		pending,
		selectedId: selected?.id ?? null,
		submissions,
		submissionMode: mode,
		submissionError
	};
};
