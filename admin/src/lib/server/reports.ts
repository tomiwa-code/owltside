import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AdminReport, ReportStatus, ReportTargetType } from '$admin/types';
import { decideReport as decideDemoReport, getReportsData } from './store';
import { supabaseConfigured, supabaseServiceRoleKey, supabaseUrl } from './supabase-env';

/**
 * Content report driver (event listings & public profiles).
 *
 * The public app only files a report: it lands `open` in
 * `public.content_reports` and is reviewed here. Nothing is auto-actioned.
 *
 *  - `supabase` — live mode, uses the service-role key because RLS deliberately
 *    gives clients no read or update access to the queue.
 *  - `demo` — no credentials configured: the seeded queue is decided in memory.
 */

export type ReportMode = 'supabase' | 'demo';

export function reportMode(): ReportMode {
	return supabaseConfigured() ? 'supabase' : 'demo';
}

let cached: { key: string; client: SupabaseClient } | null = null;

function liveClient(): SupabaseClient {
	const url = supabaseUrl();
	const key = supabaseServiceRoleKey();
	if (!url || !key) throw new Error('Supabase reports are not configured.');
	const cacheKey = `${url}:${key.slice(-8)}`;
	if (!cached || cached.key !== cacheKey) {
		cached = {
			key: cacheKey,
			client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
		};
	}
	return cached.client;
}

type Row = Record<string, any>;

const asText = (value: unknown, fallback = ''): string =>
	typeof value === 'string' ? value : fallback;

const CATEGORY_LABELS: Record<string, string> = {
	misleading: 'Misleading or false information',
	scam: 'Scam, fraud or fake tickets',
	prohibited: 'Prohibited or illegal activity',
	safety: 'Safety or security concern',
	'wrong-details': 'Wrong date, venue or pricing',
	offensive: 'Offensive or hateful content',
	spam: 'Spam or fake account',
	impersonation: 'Impersonation or fake identity',
	harassment: 'Harassment, threats or hate speech',
	inappropriate: 'Inappropriate or explicit content',
	underage: 'Person appears to be under 18',
	other: 'Something else'
};

/** Existing content snapshot so a reviewer can judge the report in place. */
function contextFor(row: Row, event?: Row, profile?: Row): { label: string; value: string }[] {
	const details: { label: string; value: string }[] = [];
	if (row.target_type === 'event') {
		details.push({ label: 'Listing', value: asText(event?.title, asText(row.target_label, row.target_id)) });
		details.push({ label: 'Venue', value: [asText(event?.venue), asText(event?.city)].filter(Boolean).join(', ') || '—' });
		details.push({ label: 'Organizer', value: asText(event?.organizer?.handle, '—') });
		details.push({ label: 'Status', value: asText(event?.status, 'unknown') });
	} else {
		details.push({ label: 'Profile', value: `${asText(profile?.handle, asText(row.target_label, row.target_id))} · ${asText(profile?.name, 'Unknown')}` });
		details.push({ label: 'Email', value: asText(profile?.email, '—') });
		details.push({ label: 'Operating identity', value: asText(profile?.operating_identity, 'attendee') });
	}
	details.push({ label: 'Reported', value: asText(row.created_at, new Date().toISOString()) });
	return details;
}

function mapLiveRow(row: Row, reporter?: Row, event?: Row, profile?: Row): AdminReport {
	return {
		id: String(row.id),
		targetType: asText(row.target_type, 'event') as ReportTargetType,
		targetId: asText(row.target_id),
		targetLabel: asText(row.target_label, asText(row.target_id)),
		category: asText(row.category),
		categoryLabel: CATEGORY_LABELS[asText(row.category)] ?? asText(row.category),
		details: asText(row.details),
		reporterName: asText(reporter?.name, row.reporter_id ? 'Owltside member' : 'Guest reporter'),
		reporterHandle: asText(reporter?.handle, '—'),
		reporterEmail: asText(reporter?.email, ''),
		status: asText(row.status, 'open') as ReportStatus,
		createdAt: asText(row.created_at, new Date().toISOString()),
		slaHours: row.target_type === 'profile' ? 12 : 24,
		context: contextFor(row, event, profile),
		reviewerName: asText(row.reviewer_name) || undefined,
		reviewNote: asText(row.review_note) || undefined,
		reviewedAt: asText(row.reviewed_at) || undefined
	};
}

export async function listReports(): Promise<{ rows: AdminReport[]; mode: ReportMode }> {
	if (reportMode() === 'demo') {
		return { rows: getReportsData().rows, mode: 'demo' };
	}

	const client = liveClient();
	const { data, error } = await client
		.from('content_reports')
		.select('*')
		.order('created_at', { ascending: false })
		.limit(200);
	if (error) throw new Error(error.message);

	const rows = (data ?? []) as Row[];
	const reporterIds = [...new Set(rows.map((row) => asText(row.reporter_id)).filter(Boolean))];
	const eventIds = [...new Set(rows.filter((row) => row.target_type === 'event').map((row) => asText(row.target_id)).filter(Boolean))];
	const profileIds = [...new Set(rows.filter((row) => row.target_type === 'profile').map((row) => asText(row.target_id)).filter(Boolean))];

	const reporters = new Map<string, Row>();
	const events = new Map<string, Row>();
	const profiles = new Map<string, Row>();

	if (reporterIds.length) {
		const { data: people } = await client.from('profiles').select('id,name,handle,email').in('id', reporterIds);
		for (const person of (people ?? []) as Row[]) reporters.set(String(person.id), person);
	}
	if (eventIds.length) {
		const { data: found } = await client
			.from('events')
			.select('id,title,venue,city,status,organizer:profiles(handle)')
			.in('id', eventIds);
		for (const event of (found ?? []) as Row[]) events.set(String(event.id), event);
	}
	if (profileIds.length) {
		const { data: found } = await client
			.from('profiles')
			.select('id,name,handle,email,operating_identity')
			.in('id', profileIds);
		for (const profile of (found ?? []) as Row[]) profiles.set(String(profile.id), profile);
	}

	return {
		rows: rows.map((row) =>
			mapLiveRow(
				row,
				reporters.get(asText(row.reporter_id)),
				events.get(asText(row.target_id)),
				profiles.get(asText(row.target_id))
			)
		),
		mode: 'supabase'
	};
}

export interface ReportDecisionResult {
	id: string;
	status: Extract<ReportStatus, 'actioned' | 'dismissed'>;
}

/**
 * Record the review outcome. `action` means the team acted on the content
 * (suspended the listing, restricted the account, …); `dismiss` closes it with
 * no further action. Both require a short note for the audit trail.
 */
export async function decideReport(
	id: string,
	decision: 'action' | 'dismiss',
	actor: string,
	note = ''
): Promise<ReportDecisionResult> {
	const trimmed = note.trim();
	if (!trimmed) throw new Error('Add a short note explaining the outcome.');

	if (reportMode() === 'demo') {
		const report = decideDemoReport(id, decision, actor, trimmed);
		if (!report) throw new Error('That report is no longer open.');
		return { id: report.id, status: decision === 'action' ? 'actioned' : 'dismissed' };
	}

	const client = liveClient();
	const { data, error } = await client
		.from('content_reports')
		.update({
			status: decision === 'action' ? 'actioned' : 'dismissed',
			reviewer_name: actor,
			review_note: trimmed,
			reviewed_at: new Date().toISOString()
		})
		.eq('id', id)
		.eq('status', 'open')
		.select('id,status')
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) throw new Error('That report is no longer open.');

	return { id: data.id, status: decision === 'action' ? 'actioned' : 'dismissed' };
}
