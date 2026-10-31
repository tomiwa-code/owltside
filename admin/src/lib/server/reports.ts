import { createClient, type SupabaseClient, type User as AuthUser } from '@supabase/supabase-js';
import type { AdminReport, ReportStatus, ReportTargetType } from '$admin/types';

/**
 * Content report driver (event listings & public profiles).
 *
 * The public app files reports into `public.content_reports` as `open`;
 * this module resolves full unredacted reporter and target profile/event
 * details (including auth email, phone, organizer info, bio, and status)
 * using the Supabase service-role key.
 */

function supabaseUrl(): string {
	return (process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? '').trim();
}

function serviceRoleKey(): string {
	return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
}

let cached: { key: string; client: SupabaseClient } | null = null;

function liveClient(): SupabaseClient {
	const url = supabaseUrl();
	const key = serviceRoleKey();
	if (!url || !key) {
		throw new Error(
			'Supabase is not configured. Set PUBLIC_SUPABASE_URL and ' +
				'SUPABASE_SERVICE_ROLE_KEY before starting the admin control plane.'
		);
	}
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

async function loadAuthUsersMap(client: SupabaseClient): Promise<Map<string, AuthUser>> {
	const map = new Map<string, AuthUser>();
	try {
		const { data } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
		for (const u of data?.users ?? []) map.set(u.id, u);
	} catch {
		// Ignore if auth admin API is unreachable
	}
	return map;
}

function contextFor(
	row: Row,
	authMap: Map<string, AuthUser>,
	event?: Row,
	profile?: Row
): { label: string; value: string }[] {
	const details: { label: string; value: string }[] = [];
	if (row.target_type === 'event') {
		const org = (event?.organizer ?? {}) as Row;
		const orgAuth = org?.id ? authMap.get(String(org.id)) : undefined;
		details.push({
			label: 'Listing',
			value: asText(event?.title, asText(row.target_label, row.target_id))
		});
		details.push({
			label: 'Venue',
			value: [asText(event?.venue), asText(event?.city)].filter(Boolean).join(', ') || '—'
		});
		details.push({
			label: 'Organizer',
			value: org?.name ? `${org.name} (@${asText(org.handle, '—')})` : asText(org?.handle, '—')
		});
		if (orgAuth?.email) {
			details.push({ label: 'Organizer email', value: orgAuth.email });
		}
		details.push({ label: 'Status', value: asText(event?.status, 'unknown') });
	} else {
		const targetAuth = authMap.get(asText(row.target_id));
		const meta = (targetAuth?.user_metadata ?? {}) as Row;
		details.push({
			label: 'Profile',
			value: `${asText(profile?.name, 'Unknown')} (@${asText(profile?.handle, asText(row.target_label, row.target_id))})`
		});
		details.push({ label: 'Email', value: asText(targetAuth?.email, '—') });
		const phone = asText(targetAuth?.phone) || asText(meta.verified_phone);
		if (phone) details.push({ label: 'Phone', value: phone });
		details.push({
			label: 'Operating identity',
			value: asText(profile?.operating_identity, 'attendee')
		});
		if (asText(profile?.city)) details.push({ label: 'City', value: asText(profile?.city) });
		if (asText(profile?.bio)) details.push({ label: 'Bio', value: asText(profile?.bio) });
	}
	details.push({ label: 'Reported at', value: asText(row.created_at, new Date().toISOString()) });
	return details;
}

function mapLiveRow(
	row: Row,
	authMap: Map<string, AuthUser>,
	reporter?: Row,
	event?: Row,
	profile?: Row
): AdminReport {
	const reporterId = asText(row.reporter_id);
	const reporterAuth = reporterId ? authMap.get(reporterId) : undefined;
	const reporterMeta = (reporterAuth?.user_metadata ?? {}) as Row;
	const reporterName =
		asText(reporter?.name) ||
		asText(reporterMeta.full_name) ||
		asText(reporterMeta.name) ||
		(reporterAuth?.email ? reporterAuth.email.split('@')[0] : '') ||
		(reporterId ? 'Owltside Member' : 'Guest reporter');
	const reporterHandle =
		asText(reporter?.handle) || asText(reporterMeta.handle) || (reporterId ? 'member' : 'guest');

	return {
		id: String(row.id),
		targetType: asText(row.target_type, 'event') as ReportTargetType,
		targetId: asText(row.target_id),
		targetLabel: asText(row.target_label, asText(row.target_id)),
		category: asText(row.category),
		categoryLabel: CATEGORY_LABELS[asText(row.category)] ?? asText(row.category),
		details: asText(row.details),
		reporterId: reporterId || undefined,
		reporterName,
		reporterHandle,
		reporterEmail: asText(reporterAuth?.email, ''),
		status: asText(row.status, 'open') as ReportStatus,
		createdAt: asText(row.created_at, new Date().toISOString()),
		slaHours: row.target_type === 'profile' ? 12 : 24,
		context: contextFor(row, authMap, event, profile),
		reviewerName: asText(row.reviewer_name) || undefined,
		reviewNote: asText(row.review_note) || undefined,
		reviewedAt: asText(row.reviewed_at) || undefined
	};
}

export async function listReports(): Promise<{ rows: AdminReport[] }> {
	const client = liveClient();
	const [{ data, error }, authMap] = await Promise.all([
		client
			.from('content_reports')
			.select('*')
			.order('created_at', { ascending: false })
			.limit(200),
		loadAuthUsersMap(client)
	]);
	if (error) throw new Error(error.message);

	const rows = (data ?? []) as Row[];
	const reporterIds = [...new Set(rows.map((row) => asText(row.reporter_id)).filter(Boolean))];
	const eventIds = [
		...new Set(
			rows
				.filter((row) => row.target_type === 'event')
				.map((row) => asText(row.target_id))
				.filter(Boolean)
		)
	];
	const profileIds = [
		...new Set(
			rows
				.filter((row) => row.target_type === 'profile')
				.map((row) => asText(row.target_id))
				.filter(Boolean)
		)
	];

	const reporters = new Map<string, Row>();
	const events = new Map<string, Row>();
	const profiles = new Map<string, Row>();

	const allProfileIds = [...new Set([...reporterIds, ...profileIds])];
	if (allProfileIds.length) {
		const { data: people } = await client
			.from('profiles')
			.select('id,name,handle,bio,city,link,verified,operating_identity')
			.in('id', allProfileIds);
		for (const person of (people ?? []) as Row[]) {
			reporters.set(String(person.id), person);
			profiles.set(String(person.id), person);
		}
	}
	if (eventIds.length) {
		const { data: found } = await client
			.from('events')
			.select('id,title,venue,city,status,organizer:profiles(id,name,handle)')
			.in('id', eventIds);
		for (const event of (found ?? []) as Row[]) events.set(String(event.id), event);
	}

	return {
		rows: rows.map((row) =>
			mapLiveRow(
				row,
				authMap,
				reporters.get(asText(row.reporter_id)),
				events.get(asText(row.target_id)),
				profiles.get(asText(row.target_id))
			)
		)
	};
}

export interface ReportDecisionResult {
	id: string;
	status: Extract<ReportStatus, 'actioned' | 'dismissed'>;
}

export async function decideReport(
	id: string,
	decision: 'action' | 'dismiss',
	actor: string,
	note = ''
): Promise<ReportDecisionResult> {
	const trimmed = note.trim();
	if (!trimmed) throw new Error('Add a short note explaining the outcome.');

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

export async function countOpenReports(): Promise<number> {
	const client = liveClient();
	const { count, error } = await client
		.from('content_reports')
		.select('*', { count: 'exact', head: true })
		.eq('status', 'open');
	if (error) return 0;
	return count ?? 0;
}
