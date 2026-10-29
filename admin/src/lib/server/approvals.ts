import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AdminApproval, ApprovalKind } from '$admin/types';

/**
 * Approval queue driver.
 *
 * Every action the public app cannot take on its own — ticket refunds, instant
 * payouts, identity and payout-account verification — is written to
 * `public.approval_requests` as `pending`. This module lists those rows and
 * records the decision using the Supabase service-role key (RLS stops every
 * client from deciding a request), so the public web can only ever show what
 * an admin actually approved.
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

const SLA_HOURS: Record<ApprovalKind, number> = { refund: 8, payout: 4, verification: 24 };

const asText = (value: unknown, fallback = ''): string =>
	typeof value === 'string' ? value : fallback;

const money = (value: unknown): string =>
	typeof value === 'number' ? `₦${value.toLocaleString('en-NG')}` : '—';

function detailsFor(row: Row): { label: string; value: string }[] {
	const payload = (row.payload ?? {}) as Row;
	const kind = asText(row.kind) as ApprovalKind;
	const details: { label: string; value: string }[] = [];
	if (kind === 'refund') {
		details.push({ label: 'Pass', value: asText(row.subject_label, '—') });
		details.push({ label: 'Reason', value: asText(payload.reason, 'Not specified') });
		if (asText(payload.details)) details.push({ label: 'Context', value: asText(payload.details) });
		details.push({ label: 'Refund value', value: money(row.amount) });
	} else if (kind === 'payout') {
		details.push({ label: 'Event', value: asText(row.subject_label, 'Settlement balance') });
		details.push({ label: 'Destination', value: asText(payload.destination, '—') });
		details.push({ label: 'Payout value', value: money(row.amount) });
	} else {
		const check = asText(payload.check, 'identity');
		details.push({ label: 'Check', value: check === 'payoutAccount' ? 'Payout account' : 'Identity' });
		if (asText(payload.document)) details.push({ label: 'Document', value: asText(payload.document) });
		if (asText(payload.bank)) details.push({ label: 'Bank', value: asText(payload.bank) });
		if (asText(payload.accountNumber)) {
			const account = asText(payload.accountNumber);
			details.push({ label: 'Account', value: `••••${account.slice(-4)}` });
		}
		if (asText(payload.reference)) {
			const reference = asText(payload.reference);
			details.push({ label: 'Reference', value: `••••${reference.slice(-4)}` });
		}
		if (asText(payload.attachment)) details.push({ label: 'Attachment', value: asText(payload.attachment) });
	}
	return details;
}

function mapLiveRow(row: Row, profile?: Row): AdminApproval {
	const kind = (asText(row.kind, 'verification') as ApprovalKind) ?? 'verification';
	return {
		id: String(row.id),
		kind,
		status: row.status,
		requesterName: asText(profile?.name, 'Unknown requester'),
		requesterHandle: asText(profile?.handle, '—'),
		requesterEmail: asText(profile?.email, ''),
		title: asText(row.title, 'Approval request'),
		summary: asText(row.summary),
		amountNgn: row.amount === null || row.amount === undefined ? undefined : Number(row.amount),
		subjectId: asText(row.subject_id) || undefined,
		subjectLabel: asText(row.subject_label) || undefined,
		details: detailsFor(row),
		requestedAt: asText(row.created_at, new Date().toISOString()),
		slaHours: SLA_HOURS[kind] ?? 24,
		note: asText(row.decision_note) || undefined,
		decidedAt: asText(row.decided_at) || undefined,
		decidedBy: asText(row.decided_by) || undefined
	};
}

export async function listApprovals(): Promise<{ rows: AdminApproval[] }> {
	const client = liveClient();
	const { data, error } = await client
		.from('approval_requests')
		.select('*')
		.order('created_at', { ascending: false })
		.limit(200);
	if (error) throw new Error(error.message);

	const rows = (data ?? []) as Row[];
	const ids = [...new Set(rows.map((row) => String(row.requester_id)).filter(Boolean))];
	const profiles = new Map<string, Row>();
	if (ids.length) {
		const { data: people } = await client.from('profiles').select('id,name,handle,email').in('id', ids);
		for (const person of (people ?? []) as Row[]) profiles.set(String(person.id), person);
	}
	return {
		rows: rows.map((row) => mapLiveRow(row, profiles.get(String(row.requester_id))))
	};
}

/** Pending requests, for the sidebar badge. */
export async function pendingApprovalCount(): Promise<number> {
	const client = liveClient();
	const { count, error } = await client
		.from('approval_requests')
		.select('*', { count: 'exact', head: true })
		.eq('status', 'pending');
	if (error) return 0;
	return count ?? 0;
}

export interface ApprovalDecisionResult {
	id: string;
	status: 'approved' | 'rejected';
}

/**
 * Record a decision. Approving a refund settles the pass
 * (`tickets.status = 'refunded'`) via the `apply_approved_refund` trigger
 * in migration 023.
 */
export async function decideApproval(
	id: string,
	decision: 'approve' | 'reject',
	actor: string,
	note = ''
): Promise<ApprovalDecisionResult> {
	const trimmed = note.trim();
	if (decision === 'reject' && !trimmed) {
		throw new Error('Add a short reason so the requester knows what to change.');
	}

	const client = liveClient();
	const { data: existing, error: readError } = await client
		.from('approval_requests')
		.select('id,kind,title,requester_id,subject_id,status')
		.eq('id', id)
		.maybeSingle();
	if (readError) throw new Error(readError.message);
	if (!existing) throw new Error('That request is no longer in the queue.');

	const { data, error } = await client
		.from('approval_requests')
		.update({
			status: decision === 'approve' ? 'approved' : 'rejected',
			decision_note: trimmed || null,
			decided_at: new Date().toISOString(),
			decided_by: actor
		})
		.eq('id', id)
		.eq('status', 'pending')
		.select('id,status')
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) throw new Error('That request has already been decided.');

	return { id: data.id, status: decision === 'approve' ? 'approved' : 'rejected' };
}
