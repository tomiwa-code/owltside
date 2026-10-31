import { createClient, type SupabaseClient, type User as AuthUser } from '@supabase/supabase-js';
import type { AdminApproval, AdminApprovalAttachment, ApprovalKind } from '$admin/types';

/**
 * Approval queue driver.
 *
 * Every action the public app cannot take on its own — ticket refunds, payout
 * requests, identity and payout-account verification — is written to
 * `public.approval_requests` as `pending`. This module lists those rows with
 * FULL unredacted requester, bank, identity, and ID media details using the
 * Supabase service-role key, and records admin decisions.
 */

function supabaseUrl(): string {
	return (process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? '').trim();
}

function serviceRoleKey(): string {
	return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
}

let cached: { key: string; client: SupabaseClient } | null = null;

export function liveClient(): SupabaseClient {
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

export function extractApprovalAttachments(payload: Row): AdminApprovalAttachment[] {
	const attachments: AdminApprovalAttachment[] = [];
	const pushDoc = (side: 'front' | 'back', raw: unknown) => {
		if (!raw || typeof raw !== 'object') return;
		const doc = raw as Record<string, unknown>;
		const name = asText(doc.name, `${side}-id`);
		const dataUrl = asText(doc.dataUrl) || asText(doc.preview) || null;
		const mimeType = asText(
			doc.mimeType,
			dataUrl?.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg'
		);
		if (dataUrl || asText(doc.name)) {
			attachments.push({ side, name, dataUrl, mimeType });
		}
	};
	pushDoc('front', payload.frontDocument);
	pushDoc('back', payload.backDocument);
	return attachments;
}

function detailsFor(row: Row, requesterName: string): { label: string; value: string }[] {
	const payload = (row.payload ?? {}) as Row;
	const kind = asText(row.kind) as ApprovalKind;
	const details: { label: string; value: string }[] = [];

	if (kind === 'refund') {
		details.push({
			label: 'Pass code',
			value: asText(payload.code) || asText(row.subject_label, '—')
		});
		if (asText(payload.eventTitle)) {
			details.push({ label: 'Event', value: asText(payload.eventTitle) });
		}
		if (asText(payload.tierName)) {
			details.push({ label: 'Ticket tier', value: asText(payload.tierName) });
		}
		if (asText(payload.holder)) {
			details.push({ label: 'Ticket holder', value: asText(payload.holder) });
		}
		details.push({ label: 'Reason', value: asText(payload.reason, 'Not specified') });
		if (asText(payload.details)) {
			details.push({ label: 'Attendee context', value: asText(payload.details) });
		}
		details.push({ label: 'Refund value', value: money(Number(row.amount ?? payload.price ?? 0)) });
	} else if (kind === 'payout') {
		details.push({
			label: 'Event',
			value: asText(payload.eventTitle) || asText(row.subject_label, 'Settlement balance')
		});
		if (asText(payload.bank)) {
			details.push({ label: 'Bank', value: asText(payload.bank) });
		}
		if (asText(payload.accountNumber)) {
			details.push({ label: 'Account number (NUBAN)', value: asText(payload.accountNumber) });
		} else if (asText(payload.destination)) {
			details.push({ label: 'Destination', value: asText(payload.destination) });
		}
		if (asText(payload.accountHolder) || requesterName) {
			details.push({
				label: 'Account holder',
				value: asText(payload.accountHolder, requesterName)
			});
		}
		details.push({ label: 'Payout value', value: money(Number(row.amount ?? 0)) });
	} else {
		const check = asText(payload.check, 'identity');
		details.push({
			label: 'Check',
			value:
				check === 'payoutAccount'
					? 'Payout bank account'
					: check === 'phone'
						? 'Phone number'
						: 'Government ID'
		});
		if (asText(payload.legalName)) {
			details.push({ label: 'Legal name (on ID)', value: asText(payload.legalName) });
		}
		if (asText(payload.dateOfBirth)) {
			details.push({ label: 'Date of birth', value: asText(payload.dateOfBirth) });
		}
		if (asText(payload.document)) {
			details.push({ label: 'Document type', value: asText(payload.document) });
		}
		const fullRef = asText(payload.fullReference) || asText(payload.reference);
		if (fullRef) {
			details.push({ label: 'ID / Document number', value: fullRef });
		}
		if (asText(payload.bank)) {
			details.push({ label: 'Bank', value: asText(payload.bank) });
		}
		if (asText(payload.accountNumber)) {
			details.push({ label: 'Account number (NUBAN)', value: asText(payload.accountNumber) });
		}
		if (asText(payload.accountHolder)) {
			details.push({ label: 'Account holder', value: asText(payload.accountHolder) });
		}
		if (asText(payload.phone)) {
			details.push({ label: 'Phone number', value: asText(payload.phone) });
		}
		if (asText(payload.attachment)) {
			details.push({ label: 'Uploaded sides', value: asText(payload.attachment) });
		}
	}
	return details;
}

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

function mapLiveRow(row: Row, profile?: Row, authUser?: AuthUser): AdminApproval {
	const kind = (asText(row.kind, 'verification') as ApprovalKind) ?? 'verification';
	const payload = (row.payload ?? {}) as Row;
	const meta = (authUser?.user_metadata ?? {}) as Row;

	const requesterName =
		asText(profile?.name) ||
		asText(payload.requesterName) ||
		asText(payload.legalName) ||
		asText(meta.full_name) ||
		asText(meta.name) ||
		asText(authUser?.email)?.split('@')[0] ||
		'Owltside Member';

	const requesterHandle =
		asText(profile?.handle) ||
		asText(payload.requesterHandle) ||
		asText(meta.handle) ||
		'member';

	const requesterEmail =
		asText(authUser?.email) || asText(payload.requesterEmail) || '';

	const requesterPhone =
		asText(authUser?.phone) ||
		asText(meta.verified_phone) ||
		asText(meta.phone) ||
		asText(payload.phone) ||
		undefined;

	return {
		id: String(row.id),
		kind,
		status: row.status,
		requesterId: asText(row.requester_id) || undefined,
		requesterName,
		requesterHandle,
		requesterEmail,
		requesterPhone,
		title: asText(row.title, 'Approval request'),
		summary: asText(row.summary),
		amountNgn: row.amount === null || row.amount === undefined ? undefined : Number(row.amount),
		subjectId: asText(row.subject_id) || undefined,
		subjectLabel: asText(row.subject_label) || undefined,
		details: detailsFor(row, requesterName),
		attachments: extractApprovalAttachments(payload),
		requestedAt: asText(row.created_at, new Date().toISOString()),
		slaHours: SLA_HOURS[kind] ?? 24,
		note: asText(row.decision_note) || undefined,
		decidedAt: asText(row.decided_at) || undefined,
		decidedBy: asText(row.decided_by) || undefined
	};
}

export async function listApprovals(): Promise<{ rows: AdminApproval[] }> {
	const client = liveClient();
	const [{ data, error }, authMap] = await Promise.all([
		client
			.from('approval_requests')
			.select('*')
			.order('created_at', { ascending: false })
			.limit(200),
		loadAuthUsersMap(client)
	]);
	if (error) throw new Error(error.message);

	const rows = (data ?? []) as Row[];
	const ids = [...new Set(rows.map((row) => String(row.requester_id)).filter(Boolean))];
	const profiles = new Map<string, Row>();
	if (ids.length) {
		const { data: people } = await client
			.from('profiles')
			.select('id,name,handle,city,verified,operating_identity')
			.in('id', ids);
		for (const person of (people ?? []) as Row[]) profiles.set(String(person.id), person);
	}
	return {
		rows: rows.map((row) => {
			const uid = String(row.requester_id);
			return mapLiveRow(row, profiles.get(uid), authMap.get(uid));
		})
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
 * in migration 023. Approving identity + payout verification also updates
 * `profiles.verified = true`.
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
		.select('id,kind,title,requester_id,subject_id,status,payload')
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

	if (decision === 'approve' && existing.kind === 'verification' && existing.requester_id) {
		const { data: approvedVerifications } = await client
			.from('approval_requests')
			.select('payload')
			.eq('requester_id', existing.requester_id)
			.eq('kind', 'verification')
			.eq('status', 'approved');
		const checks = new Set(
			(approvedVerifications ?? []).map((item: Row) => asText((item.payload ?? {}).check))
		);
		if (checks.has('identity') && checks.has('payoutAccount')) {
			await client
				.from('profiles')
				.update({ verified: true })
				.eq('id', existing.requester_id)
				.then(() => undefined, () => undefined);
		}
	}

	return { id: data.id, status: decision === 'approve' ? 'approved' : 'rejected' };
}
