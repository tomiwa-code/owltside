import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEvent, listEvents, setEventStatus } from './store';

/**
 * Organizer submission queue.
 *
 * Two drivers behind one API:
 *  - `supabase` — the real moderation path. Uses the service-role key because
 *    RLS deliberately stops an organizer (and every other client) from writing
 *    `status = 'published'`. Approving here is what makes the event appear in
 *    the public app's home and explore feeds on the next request.
 *  - `demo` — with no Supabase credentials configured the console moderates its
 *    deterministic in-memory dataset, so the workflow stays demonstrable.
 */

export type EventSubmissionStatus = 'pending' | 'published' | 'rejected';

export interface EventSubmission {
	/** Event UUID in Supabase (or the seeded store id in demo mode). */
	id: string;
	title: string;
	slug: string;
	category: string;
	description: string;
	organizerName: string;
	organizerHandle: string | null;
	startsAt: string;
	endsAt: string | null;
	submittedAt: string;
	venue: string;
	city: string;
	capacity: number;
	tierSummary: string;
	coverFrom: string;
	coverTo: string;
	coverIcon: string;
	status: EventSubmissionStatus;
}

export type ModerationMode = 'supabase' | 'demo';

function supabaseUrl(): string {
	return (
		process.env.SUPABASE_URL ??
		process.env.PUBLIC_SUPABASE_URL ??
		''
	).trim();
}

function serviceRoleKey(): string {
	return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
}

/** Live moderation needs a URL plus the service-role key (never the anon key). */
export function moderationMode(): ModerationMode {
	return supabaseUrl() && serviceRoleKey() ? 'supabase' : 'demo';
}

let cached: { key: string; client: SupabaseClient } | null = null;

function liveClient(): SupabaseClient {
	const url = supabaseUrl();
	const key = serviceRoleKey();
	if (!url || !key) throw new Error('Supabase moderation is not configured.');
	const cacheKey = `${url}:${key.slice(-8)}`;
	if (!cached || cached.key !== cacheKey) {
		cached = {
			key: cacheKey,
			client: createClient(url, key, {
				auth: { persistSession: false, autoRefreshToken: false }
			})
		};
	}
	return cached.client;
}

type Row = Record<string, any>;

const liveEventStatus = (id: string) => getEvent(id)?.status;

const asText = (value: unknown, fallback = ''): string =>
	typeof value === 'string' ? value : fallback;

const coverOf = (value: unknown): { from: string; to: string; icon: string } => {
	const raw = (value ?? {}) as Row;
	return {
		from: asText(raw.from, '#1b2a4a'),
		to: asText(raw.to, '#14131f'),
		icon: asText(raw.icon, 'sparkles')
	};
};

function tierSummaryOf(tiers: unknown): string {
	if (!Array.isArray(tiers) || tiers.length === 0) return 'No tiers configured';
	const parts = tiers.slice(0, 3).map((tier: Row) => {
		const price = Number(tier?.price ?? 0);
		const label = price === 0 ? 'Free' : `₦${price.toLocaleString('en-NG')}`;
		return `${asText(tier?.name, 'Tier')} · ${label}`;
	});
	if (tiers.length > 3) parts.push(`+${tiers.length - 3} more`);
	return parts.join('  ·  ');
}

function capacityOf(tiers: unknown): number {
	if (!Array.isArray(tiers)) return 0;
	return tiers.reduce((sum, tier: Row) => sum + Number(tier?.capacity ?? 0), 0);
}

function mapLiveRow(row: Row): EventSubmission {
	const organizer = (row.organizer ?? {}) as Row;
	const cover = coverOf(row.cover);
	return {
		id: String(row.id),
		title: asText(row.title, 'Untitled event'),
		slug: asText(row.slug),
		category: asText(row.category, 'Uncategorised'),
		description: asText(row.description),
		organizerName: asText(organizer.name, 'Unknown organizer'),
		organizerHandle: asText(organizer.handle) || null,
		startsAt: asText(row.starts_at, new Date().toISOString()),
		endsAt: asText(row.ends_at) || null,
		submittedAt: asText(row.submitted_at) || asText(row.created_at, new Date().toISOString()),
		venue: asText(row.venue),
		city: asText(row.city),
		capacity: capacityOf(row.tiers),
		tierSummary: tierSummaryOf(row.tiers),
		coverFrom: cover.from,
		coverTo: cover.to,
		coverIcon: cover.icon,
		status: 'pending'
	};
}

/** Pending organizer submissions, oldest first so the queue is FIFO. */
export async function listSubmissions(): Promise<EventSubmission[]> {
	if (moderationMode() === 'demo') {
		return listEvents({ status: 'pending', perPage: 100 }).rows.map((event) => ({
			id: event.id,
			title: event.title,
			slug: event.slug,
			category: event.category,
			description: '',
			organizerName: event.organizerName,
			organizerHandle: null,
			startsAt: event.startsAt,
			endsAt: event.endsAt ?? null,
			submittedAt: event.submittedAt ?? event.startsAt,
			venue: event.venue,
			city: event.city,
			capacity: event.capacity,
			tierSummary: tierSummaryOf(event.tiers.map((tier) => ({ ...tier, price: tier.priceNgn }))),
			coverFrom: event.coverFrom,
			coverTo: event.coverTo,
			coverIcon: event.coverIcon,
			status: 'pending'
		}));
	}

	const { data, error } = await liveClient()
		.from('events')
		.select(
			'id,slug,title,category,description,starts_at,ends_at,venue,city,cover,tiers,status,submitted_at,created_at,organizer:profiles(name,handle)'
		)
		.eq('status', 'pending')
		.order('submitted_at', { ascending: true, nullsFirst: true })
		.order('created_at', { ascending: true })
		.limit(100);
	if (error) throw new Error(error.message);
	return (data ?? []).map((row) => mapLiveRow(row as Row));
}

export interface ModerationResult {
	id: string;
	status: EventSubmissionStatus;
}

/**
 * Approve (publish) or reject one submission.
 *
 * Approving flips `events.status` to `published`; the public app filters its
 * home/explore feeds on exactly that value, so the event goes live on the next
 * request. The `.eq('status', 'pending')` guard makes concurrent decisions safe.
 */
export async function decideSubmission(
	id: string,
	decision: 'approve' | 'reject',
	actor: string,
	note = ''
): Promise<ModerationResult> {
	const trimmed = note.trim();
	if (decision === 'reject' && !trimmed) {
		throw new Error('Add a short reason so the organizer knows what to fix.');
	}

	if (moderationMode() === 'demo') {
		// Mirrors the live `.eq('status', 'pending')` guard: a decision only ever
		// applies to a submission that is still waiting for review.
		if (liveEventStatus(id) !== 'pending') {
			throw new Error('That submission is no longer in the review queue.');
		}
		const next = decision === 'approve' ? 'published' : 'suspended';
		const updated = setEventStatus(
			id,
			next,
			actor,
			trimmed || (decision === 'approve' ? 'Moderation approved — listing published' : 'Rejected by admin')
		);
		if (!updated) throw new Error('That submission is no longer in the review queue.');
		return { id: updated.id, status: decision === 'approve' ? 'published' : 'rejected' };
	}

	const patch =
		decision === 'approve'
			? {
					status: 'published',
					moderated_at: new Date().toISOString(),
					moderated_by: actor,
					moderation_note: trimmed || null
				}
			: {
					status: 'rejected',
					moderated_at: new Date().toISOString(),
					moderated_by: actor,
					moderation_note: trimmed
				};

	const { data, error } = await liveClient()
		.from('events')
		.update(patch)
		.eq('id', id)
		.eq('status', 'pending')
		.select('id,status')
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) throw new Error('That submission is no longer in the review queue.');

	return {
		id: data.id,
		status: decision === 'approve' ? 'published' : 'rejected'
	};
}
