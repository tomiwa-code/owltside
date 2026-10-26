/** Shared view-model types for the Owltside Admin control plane. */

export type AdminRole =
	| 'Super Admin'
	| 'Trust & Safety Lead'
	| 'Finance & Treasury'
	| 'Event Operations'
	| 'Support Agent'
	| 'Read-only Auditor';

export type AdminTier = 0 | 1 | 2 | 3;

export interface AdminSession {
	id: string;
	email: string;
	name: string;
	initials: string;
	role: AdminRole;
	tier: AdminTier;
	/** How this browser session authenticated. */
	auth: 'webauthn' | 'password+totp';
	issuedAt: string;
	expiresAt: string;
	ip: string;
	demo: boolean;
}

export type PlatformStatus = 'published' | 'pending' | 'draft' | 'suspended' | 'completed';

export interface EventTier {
	name: string;
	priceNgn: number;
	capacity: number;
	sold: number;
}

export interface AdminEvent {
	id: string;
	ref: string;
	slug: string;
	title: string;
	category: string;
	organizerId: string;
	organizerName: string;
	organizerTier: AdminTier | 1 | 2;
	status: PlatformStatus;
	startsAt: string;
	endsAt: string;
	venue: string;
	city: string;
	capacity: number;
	sold: number;
	grossNgn: number;
	tiers: EventTier[];
	coverFrom: string;
	coverTo: string;
	coverIcon: string;
	moderationNote?: string;
	submittedAt?: string;
	policyFlags?: string[];
}

export interface AdminOrganizer {
	id: string;
	name: string;
	legalName: string;
	slug: string;
	cacRegNumber: string;
	tin?: string;
	tier: 1 | 2 | 3;
	status: 'verified' | 'pending' | 'flagged' | 'suspended';
	city: string;
	state: string;
	contactName: string;
	contactEmail: string;
	contactPhone: string;
	eventsCount: number;
	ticketsSold: number;
	grossVolumeNgn: number;
	escrowHeldNgn: number;
	settlementBank: string;
	settlementAccountLast4: string;
	settlementState: 'linked' | 'pending' | 'conflict' | 'frozen';
	risk: 'low' | 'medium' | 'high';
	verifiedDocs: number;
	requiredDocs: number;
	lastPayoutAt?: string;
	createdAt: string;
	flagReason?: string;
	beneficiaryMismatch?: boolean;
}

export type TicketStatus = 'valid' | 'used' | 'void' | 'refunded' | 'transferred';

export interface AdminTicket {
	id: string;
	code: string;
	holderName: string;
	holderHandle: string;
	eventId: string;
	eventTitle: string;
	tierName: string;
	seat?: string;
	status: TicketStatus;
	priceNgn: number;
	settlement: 'Paystack' | 'Complementary' | 'USD / Card';
	orderRef: string;
	purchasedAt: string;
	reissuedAt?: string;
	reissueCount?: number;
	flags?: string[];
}

export type OrderStatus = 'settled' | 'pending' | 'failed' | 'refunded' | 'disputed';

export interface AdminOrderItem {
	label: string;
	qty: number;
	unitNgn: number;
}

export interface AdminOrder {
	id: string;
	reference: string;
	customerName: string;
	customerEmail: string;
	customerPhone: string;
	eventId: string;
	eventTitle: string;
	tierLabel: string;
	qty: number;
	subtotalNgn: number;
	feeNgn: number;
	totalNgn: number;
	gateway: 'paystack' | 'usd';
	method: string;
	status: OrderStatus;
	createdAt: string;
	settledAt?: string;
	subaccount?: string;
	items: AdminOrderItem[];
	promo?: { code: string; discountNgn: number };
	ipCountry?: string;
	risk?: 'low' | 'medium' | 'high';
}

export type RefundStatus = 'pending' | 'approved' | 'rejected' | 'processing' | 'settled';

export interface AdminRefund {
	id: string;
	orderRef: string;
	customerName: string;
	eventTitle: string;
	amountNgn: number;
	originalNgn: number;
	reason: string;
	status: RefundStatus;
	requestedAt: string;
	slaHours: number;
	policyMatch: number;
	signals: string[];
	note?: string;
	decidedAt?: string;
	decidedBy?: string;
}

/** Everything the public app sends to the console for a decision. */
export type ApprovalKind = 'refund' | 'payout' | 'verification';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface AdminApproval {
	id: string;
	kind: ApprovalKind;
	status: ApprovalStatus;
	requesterName: string;
	requesterHandle: string;
	requesterEmail: string;
	title: string;
	summary: string;
	amountNgn?: number;
	subjectId?: string;
	subjectLabel?: string;
	/** Straight label/value pairs rendered in the reviewer dossier. */
	details: { label: string; value: string }[];
	requestedAt: string;
	slaHours: number;
	note?: string;
	decidedAt?: string;
	decidedBy?: string;
}

export interface ApprovalsData {
	pending: number;
	approved: number;
	rejected: number;
	total: number;
	rows: AdminApproval[];
}

/** User-submitted report about an event listing or a public profile. */
export type ReportTargetType = 'event' | 'profile';
export type ReportStatus = 'open' | 'actioned' | 'dismissed';

export interface AdminReport {
	id: string;
	targetType: ReportTargetType;
	targetId: string;
	targetLabel: string;
	category: string;
	categoryLabel: string;
	details: string;
	reporterName: string;
	reporterHandle: string;
	reporterEmail: string;
	status: ReportStatus;
	createdAt: string;
	slaHours: number;
	/** Existing content snapshot so a reviewer can judge without leaving. */
	context: { label: string; value: string }[];
	reviewerName?: string;
	reviewNote?: string;
	reviewedAt?: string;
}

export interface ReportsData {
	open: number;
	actioned: number;
	dismissed: number;
	total: number;
	rows: AdminReport[];
}

export interface AdminUser {
	id: string;
	handle: string;
	name: string;
	email: string;
	phone: string;
	role: 'Attendee' | 'Organizer' | 'Speaker' | 'Staff';
	kycTier: 0 | 1 | 2 | 3;
	spendNgn: number;
	ticketsCount: number;
	ordersCount: number;
	status: 'active' | 'blocked' | 'flagged';
	city: string;
	joinedAt: string;
	lastSeenAt: string;
	flags?: string[];
}

export type CaseSeverity = 'critical' | 'high' | 'medium' | 'low';
export type CaseStatus = 'open' | 'escalated' | 'quarantined' | 'reviewing' | 'resolved' | 'dismissed';

export interface AdminCase {
	id: string;
	ref: string;
	title: string;
	category: string;
	severity: CaseSeverity;
	status: CaseStatus;
	reportedBy: string;
	target: string;
	targetKind: 'Event' | 'Organizer' | 'User' | 'Ticket' | 'Order';
	createdAt: string;
	slaHours: number;
	summary: string;
	evidence: { at: string; text: string }[];
	exposureNgn: number;
	escrowNgn: number;
	resolutionNote?: string;
	resolvedAt?: string;
}

export interface AdminStaff {
	id: string;
	name: string;
	email: string;
	role: AdminRole;
	tier: AdminTier;
	auth: 'FIDO2 WebAuthn' | 'Passkey + PIN' | 'TOTP fallback';
	status: 'active' | 'invited' | 'suspended';
	lastActive: string;
	location: string;
	sessions: number;
}

export interface AuditRecord {
	id: string;
	ref: string;
	at: string;
	actor: string;
	actorRole: string;
	action: string;
	target: string;
	reason: string;
	severity: 'info' | 'warning' | 'critical';
	entityKind: 'ticket' | 'event' | 'order' | 'user' | 'organizer' | 'settings' | 'staff';
	entityId: string;
	diff?: { field: string; before: string; after: string }[];
	ip: string;
	hash: string;
	prevHash: string;
}

export interface DashboardSeries {
	day: string;
	grossNgn: number;
	passes: number;
}

export interface AdminDashboard {
	rangeLabel: string;
	grossNgn: number;
	netNgn: number;
	grossDelta: number;
	passes: number;
	passesDelta: number;
	liveEvents: number;
	eventsToday: number;
	pendingReview: number;
	activePasses: number;
	refundsPending: number;
	moderationOpen: number;
	series: DashboardSeries[];
	tierMix: { tier: string; count: number; share: number; avgNgn: number }[];
	categoryMix: { category: string; gmvNgn: number; share: number }[];
	topEvents: {
		id: string;
		title: string;
		venue: string;
		sold: number;
		capacity: number;
		grossNgn: number;
	}[];
	reviewQueue: { id: string; ref: string; title: string; organizer: string; status: string; tone: 'warn' | 'danger' | 'accent' }[];
	recentOrders: AdminOrder[];
	systemHealth: { key: string; label: string; value: string; ok: boolean }[];
}

export interface SettlementsData {
	range: { from: string; to: string };
	grossNgn: number;
	grossDelta: number;
	settledNgn: number;
	settledPct: number;
	commissionNgn: number;
	commissionRate: number;
	escrowNgn: number;
	escrowEvents: number;
	refundedNgn: number;
	refundedPct: number;
	velocity: { day: string; grossNgn: number; payoutNgn: number }[];
	rows: {
		organizerId: string;
		name: string;
		initials: string;
		events: number;
		tickets: number;
		gmvNgn: number;
		feeNgn: number;
		payoutNgn: number;
		state: 'settled' | 'queued' | 'frozen' | 'next_batch';
		bank: string;
		accountLast4: string;
	}[];
	totalProfiles: number;
	totalSubaccounts: number;
}

export interface SettingsData {
	platformFeePct: number;
	escoowDisputePct: number;
	disbursementWindow: string;
	webhookEndpoint: string;
	webhookHealthy: boolean;
	integrations: {
		key: string;
		name: string;
		state: string;
		tone: 'ok' | 'warn' | 'danger';
		detail: string;
		metric: string;
	}[];
	lastHardwareSync: string;
	lastAudit: string;
	firmware: string;
}

export interface RefundsData {
	pending: number;
	total30dNgn: number;
	successRate: number;
	avgResolutionHours: number;
	escrowNgn: number;
	rows: AdminRefund[];
}
