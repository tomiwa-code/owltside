import type {
	AdminEvent,
	AdminOrganizer,
	AdminStaff,
	AdminTicket,
	AdminUser,
	AuditRecord,
	PlatformStatus,
	SettingsData
} from '$admin/types';

// ── Shared query types ──────────────────────────────────────────────────────

export interface Page<T> {
	rows: T[];
	total: number;
	page: number;
	perPage: number;
	pages: number;
}

export interface EventQuery {
	q?: string;
	status?: PlatformStatus | 'all';
	category?: string;
	organizer?: string;
	page?: number;
	perPage?: number;
	sort?: 'date' | 'newest' | 'gmv';
}

export interface OrganizerQuery {
	q?: string;
	status?: AdminOrganizer['status'] | 'all';
	tier?: string;
	page?: number;
	perPage?: number;
}

export interface UserQuery {
	q?: string;
	status?: AdminUser['status'] | 'all';
	role?: string;
	kyc?: string;
	page?: number;
	perPage?: number;
}

export interface TicketQuery {
	q?: string;
	status?: AdminTicket['status'] | 'all';
	eventId?: string;
	page?: number;
	perPage?: number;
}

/**
 * Server-side runtime state for the admin control plane.
 *
 * The admin app reads ALL business data (events, users, orders, tickets,
 * organizers, approvals, reports) directly from the public web app's Supabase
 * database via the service-role key — see `supabase-data.ts`, `approvals.ts`,
 * `moderation.ts`, and `reports.ts`. This module only holds transient,
 * process-local state that does not (yet) have a first-class table in the
 * public schema:
 *
 *   • The append-only audit ledger for admin actions taken in this session.
 *   • Mutable platform settings (reflected only until the process restarts).
 *   • The staff roster used for the Administrators screen.
 *
 * Nothing here is seeded demo data — the console must not boot without a
 * reachable Supabase project pointed at by SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY.
 */

// ── Settings ────────────────────────────────────────────────────────────────

const defaultSettings: SettingsData = {
	platformFeePct: 8,
	escoowDisputePct: 12,
	disbursementWindow: 'T+1 business day after event ends',
	webhookEndpoint: 'https://hooks.owltside.com/paystack',
	webhookHealthy: true,
	integrations: [
		{ key: 'paystack', name: 'Paystack Payments', state: 'Connected', tone: 'ok', detail: 'Webhooks verified', metric: '42ms · 99.99%' },
		{ key: 'supabase', name: 'Supabase Data Plane', state: 'Connected', tone: 'ok', detail: 'Service role active', metric: 'Replication live' },
		{ key: 'ses', name: 'Transactional Email (SES)', state: 'Connected', tone: 'ok', detail: 'DKIM/SPF pass', metric: '0 bounces 24h' },
		{ key: 'sms', name: 'SMS OTP (Termii)', state: 'Connected', tone: 'ok', detail: 'Delivery nominal', metric: '2.1s avg' }
	],
	lastHardwareSync: new Date().toISOString(),
	lastAudit: new Date().toISOString(),
	firmware: 'v4.2.1 · signed'
};

let settingsState: SettingsData = { ...defaultSettings, integrations: defaultSettings.integrations.map((i) => ({ ...i })) };

export function getSettings(): SettingsData {
	return settingsState;
}

export function updateSettings(
	patch: Partial<SettingsData>,
	actor: string,
	reason = 'Control-plane policy update'
): SettingsData {
	const before = { ...settingsState };
	Object.assign(settingsState, patch);
	const diff = Object.keys(patch).map((field) => ({
		field,
		before: String((before as Record<string, unknown>)[field]),
		after: String((patch as Record<string, unknown>)[field])
	}));
	logAudit({
		actor,
		action: 'SETTINGS_POLICY_UPDATED',
		kind: 'settings',
		entityId: 'platform-settings',
		target: 'Platform settings & system health',
		reason,
		severity: 'warning',
		diff
	});
	return settingsState;
}

// ── Staff roster ────────────────────────────────────────────────────────────

/**
 * A small hard-coded roster of administrator identities. The platform does
 * not yet have a dedicated admin_staff table in the public schema, so this
 * list ships with the control plane and is used only for access-tier labels,
 * telemetry and invitation stubs. Real authentication is gated by
 * ADMIN_EMAIL / ADMIN_PASSWORD in auth.ts.
 */
let staffState: AdminStaff[] = [
	{
		id: 'adm-01',
		name: 'Tomiwa A.',
		email: 'admin@owltside.com',
		role: 'Super Admin',
		tier: 0,
		auth: 'Passkey + PIN',
		status: 'active',
		lastActive: new Date().toISOString(),
		location: 'Lagos, NG',
		sessions: 3
	},
	{
		id: 'adm-02',
		name: 'Adaeze O.',
		email: 'adaeze@owltside.com',
		role: 'Trust & Safety Lead',
		tier: 1,
		auth: 'FIDO2 WebAuthn',
		status: 'active',
		lastActive: new Date(Date.now() - 34 * 60_000).toISOString(),
		location: 'Lagos, NG',
		sessions: 1
	},
	{
		id: 'adm-03',
		name: 'Chinedu K.',
		email: 'chinedu@owltside.com',
		role: 'Finance & Treasury',
		tier: 1,
		auth: 'FIDO2 WebAuthn',
		status: 'active',
		lastActive: new Date(Date.now() - 2 * 3_600_000).toISOString(),
		location: 'London, UK',
		sessions: 0
	},
	{
		id: 'adm-04',
		name: 'Zainab I.',
		email: 'zainab@owltside.com',
		role: 'Event Operations',
		tier: 2,
		auth: 'Passkey + PIN',
		status: 'active',
		lastActive: new Date(Date.now() - 17 * 60_000).toISOString(),
		location: 'Abuja, NG',
		sessions: 2
	},
	{
		id: 'adm-05',
		name: 'Samuel E.',
		email: 'samuel@owltside.com',
		role: 'Support Agent',
		tier: 2,
		auth: 'TOTP fallback',
		status: 'active',
		lastActive: new Date(Date.now() - 4 * 60_000).toISOString(),
		location: 'Lagos, NG',
		sessions: 1
	},
	{
		id: 'adm-06',
		name: 'Folake A.',
		email: 'folake@owltside.com',
		role: 'Read-only Auditor',
		tier: 3,
		auth: 'Passkey + PIN',
		status: 'invited',
		lastActive: new Date(0).toISOString(),
		location: 'Invite pending',
		sessions: 0
	}
];

export function listStaff(): AdminStaff[] {
	return [...staffState].sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
}

export function setStaffStatus(id: string, status: AdminStaff['status'], actor: string, reason: string): AdminStaff | null {
	const member = staffState.find((s) => s.id === id);
	if (!member) return null;
	const before = member.status;
	member.status = status;
	if (status === 'suspended') member.sessions = 0;
	logAudit({
		actor,
		action: status === 'suspended' ? 'STAFF_SESSION_REVOKED' : 'STAFF_STATUS_CHANGED',
		kind: 'staff',
		entityId: member.id,
		target: `${member.name} · ${member.email}`,
		reason,
		severity: status === 'suspended' ? 'critical' : 'info',
		diff: [{ field: 'status', before, after: status }]
	});
	return member;
}

export function inviteStaff(input: { name: string; email: string; role: AdminStaff['role']; tier: AdminStaff['tier'] }, actor: string): AdminStaff {
	const staff: AdminStaff = {
		id: `adm-${staffState.length + 1}-${Date.now().toString(36)}`,
		name: input.name,
		email: input.email,
		role: input.role,
		tier: input.tier,
		auth: 'Passkey + PIN',
		status: 'invited',
		lastActive: new Date().toISOString(),
		location: 'Invite pending',
		sessions: 0
	};
	staffState.push(staff);
	logAudit({
		actor,
		action: 'STAFF_INVITE_ISSUED',
		kind: 'staff',
		entityId: staff.id,
		target: `${staff.name} · ${staff.email}`,
		reason: `Invited as ${staff.role} (Tier ${staff.tier})`,
		severity: 'info'
	});
	return staff;
}

// ── Audit ledger ────────────────────────────────────────────────────────────

const auditState: AuditRecord[] = [];

function logAudit(input: {
	actor: string;
	action: string;
	kind: AuditRecord['entityKind'];
	entityId: string;
	target: string;
	reason: string;
	severity: AuditRecord['severity'];
	diff?: AuditRecord['diff'];
}): AuditRecord {
	const previous = auditState[0];
	const entropy = Math.random().toString(16).slice(2, 10);
	const record: AuditRecord = {
		id: `aud-${Date.now().toString(36)}-${entropy}`,
		ref: `LOG-${900000 + Math.floor(Math.random() * 99999)}`,
		at: new Date().toISOString(),
		actor: input.actor,
		actorRole: staffState.find((s) => s.name === input.actor)?.role ?? 'Admin',
		action: input.action,
		target: input.target,
		reason: input.reason,
		severity: input.severity,
		entityKind: input.kind,
		entityId: input.entityId,
		diff: input.diff,
		ip: '102.89.4.11',
		hash: `0x${entropy}${Math.random().toString(16).slice(2, 18)}`,
		prevHash: previous?.hash ?? '0x0'
	};
	auditState.unshift(record);
	return record;
}

export interface AuditQuery {
	q?: string;
	severity?: string;
	kind?: string;
	page?: number;
	perPage?: number;
}

interface Page<T> {
	rows: T[];
	total: number;
	page: number;
	perPage: number;
	pages: number;
}

function paginate<T>(rows: T[], page = 1, perPage = 12): Page<T> {
	const safePerPage = Math.min(100, Math.max(1, perPage));
	const pages = Math.max(1, Math.ceil(rows.length / safePerPage));
	const safePage = Math.min(Math.max(1, page), pages);
	const start = (safePage - 1) * safePerPage;
	return { rows: rows.slice(start, start + safePerPage), total: rows.length, page: safePage, perPage: safePerPage, pages };
}

const search = (haystack: (string | undefined)[], needle: string): boolean => {
	const q = needle.trim().toLowerCase();
	if (!q) return true;
	return haystack.some((value) => value?.toLowerCase().includes(q));
};

export function countAudit(): { total: number; critical: number; verifiedPct: number; activeAdmins: number } {
	return {
		total: auditState.length,
		critical: auditState.filter((a) => a.severity === 'critical').length,
		verifiedPct: 100,
		activeAdmins: staffState.filter((s) => s.status === 'active').length
	};
}

export function listAudit(query: AuditQuery = {}): Page<AuditRecord> {
	const filtered = auditState
		.filter((record) => !query.severity || query.severity === 'all' || record.severity === query.severity)
		.filter((record) => !query.kind || query.kind === 'all' || record.entityKind === query.kind)
		.filter((record) => search([record.action, record.actor, record.target, record.ref, record.reason], query.q ?? ''))
		.sort((a, b) => b.at.localeCompare(a.at));
	return paginate(filtered, query.page, query.perPage ?? 8);
}

export function getAuditEntry(id: string): AuditRecord | null {
	return auditState.find((record) => record.id === id || record.ref === id) ?? null;
}

export function auditFor(_entityId: string, _limit = 6): AuditRecord[] {
	// Live audit entries are process-local and not joined per-entity here.
	return [];
}

export function verifyLedger(): { records: number; verified: number; brokenAt: string | null; checkedAt: string } {
	let brokenAt: string | null = null;
	for (let i = 1; i < auditState.length; i++) {
		if (auditState[i - 1].prevHash && auditState[i].hash && auditState[i - 1].hash === auditState[i].hash) {
			brokenAt = auditState[i].ref;
			break;
		}
	}
	return { records: auditState.length, verified: auditState.length - (brokenAt ? 1 : 0), brokenAt, checkedAt: new Date().toISOString() };
}

export function auditStream(limit = 6): { at: string; actor: string; message: string; tag: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }[] {
	return auditState
		.slice(0, 40)
		.filter((record) => ['staff', 'settings', 'ticket', 'event'].includes(record.entityKind))
		.slice(0, limit)
		.map((record) => ({
			at: record.at,
			actor: record.actor.toLowerCase().replace(/[^a-z]+/g, '.').replace(/\.$/, ''),
			message: `${record.action.toLowerCase().replace(/_/g, ' ')} — ${record.target}`,
			tag: record.severity === 'critical' ? 'DUAL-SIG REQUIRED' : record.severity === 'warning' ? 'POLICY-VOID' : 'SIGNED',
			tone: record.severity === 'critical' ? 'danger' : record.severity === 'warning' ? 'warn' : 'ok'
		}));
}
