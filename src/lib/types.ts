import type { OperatingIdentity } from './constants/operating-identity';

export type Currency = 'NGN' | 'USD';

export interface Session {
	userId: string;
	email: string;
	handle: string;
	name: string;
	role: 'attendee' | 'organizer' | 'guest';
	avatarUrl?: string | null;
	usernameChangedAt?: string | null;
	demo?: boolean;
}

export interface Profile {
	id: string;
	handle: string;
	name: string;
	avatarColor: string; // fallback art hue
	avatarUrl?: string | null;
	bio?: string | null;
	link?: string | null;
	city?: string | null;
	bannerUrl?: string | null;
	interests?: string[];
	usernameChangedAt?: string | null;
	/** Operating identity this user chose for themselves (public mirror of the auth preference). */
	operatingIdentity?: OperatingIdentity;
	verified?: boolean;
	followers: number;
	following: number;
}

export type SpeakerInviteStatus = 'pending' | 'accepted' | 'declined';

/**
 * Things a user can ask Owltside to do that an administrator must approve.
 * Each submission is stored as an `ApprovalRequest` and stays `pending` on the
 * public app until the admin console publishes a decision.
 */
export type ApprovalKind = 'refund' | 'payout' | 'verification';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ApprovalRequest {
	id: string;
	kind: ApprovalKind;
	status: ApprovalStatus;
	/** Requester's profile id. Public reads only ever return the viewer's own rows. */
	requesterId: string;
	title: string;
	summary: string;
	/** Naira amount for money-moving requests (refunds, payouts). */
	amount?: number;
	/** Ticket / event / check the request is about. */
	subjectId?: string;
	subjectLabel?: string;
	/** Extra review details (never secrets: document type, masked number, etc.). */
	payload?: Record<string, unknown>;
	/** Admin decision note, shown back to the requester. */
	note?: string;
	createdAt: string;
	decidedAt?: string;
}

export interface CreateApprovalInput {
	kind: ApprovalKind;
	title: string;
	summary: string;
	amount?: number;
	subjectId?: string;
	subjectLabel?: string;
	payload?: Record<string, unknown>;
}

/**
 * A user-submitted report about an event listing or a public profile. Reports
 * are reviewed in the admin console; nothing here is auto-actioned.
 */
export type ReportTargetType = 'event' | 'profile';

export type ReportStatus = 'open' | 'actioned' | 'dismissed';

export interface ContentReport {
	id: string;
	targetType: ReportTargetType;
	/** Event id or profile id being reported. */
	targetId: string;
	/** Human-readable label captured at submission time (title / @handle). */
	targetLabel: string;
	category: string;
	categoryLabel: string;
	details: string;
	/** Null for guests who reported without signing in. */
	reporterId?: string;
	reporterHandle?: string;
	status: ReportStatus;
	createdAt: string;
	reviewedAt?: string;
	reviewerName?: string;
	reviewNote?: string;
}

export interface CreateReportInput {
	targetType: ReportTargetType;
	targetId: string;
	targetLabel: string;
	category: string;
	details: string;
}

/**
 * Moderation and lifecycle state of an event. Organizer submissions start as
 * `pending`, reach the public feeds once an admin publishes them (`published`),
 * and transition to `closed` once the event's end date and time has passed.
 */
export type EventStatus = 'draft' | 'pending' | 'published' | 'closed' | 'rejected' | 'suspended';

export interface EventSpeaker extends Profile {
	role?: string;
	invited?: boolean;
	inviteStatus?: SpeakerInviteStatus;
	displayOnly?: boolean;
}

export interface WizardSpeaker {
	id?: string;
	handle?: string;
	name: string;
	avatarColor?: string;
	avatarUrl?: string | null;
	bio?: string;
	role: string;
	org?: string;
	tag?: string;
	displayOnly?: boolean;
	invited?: boolean;
	inviteStatus?: SpeakerInviteStatus;
	followers?: number;
	following?: number;
	city?: string | null;
}

export interface TicketTier {
	id: string;
	name: string;
	price: number; // in Naira
	benefits?: string;
	sold: number;
	capacity: number;
	perOrderLimit?: number;
}

export interface AgendaItem {
	id: string;
	start: string; // ISO
	title: string;
	location?: string;
	speakerIds?: string[];
}

/** A promo code an organizer configured for one event. */
export interface EventPromo {
	code: string;
	percent: number;
	maxUses: number;
	/** Completed orders that redeemed the code. Organizer-scoped reads only. */
	uses?: number;
}

/** A promo after server-side validation, safe to show to the buyer who entered it. */
export interface ResolvedPromo {
	code: string;
	kind: 'flat' | 'pct';
	value: number;
	source: 'event' | 'global';
}

export interface EventItem {
	id: string;
	slug: string;
	title: string;
	category: string;
	tags: string[];
	startsAt: string; // ISO
	endsAt?: string;
	venue: string;
	city: string;
	cover: CoverArt;
	description: string;
	organizer: Profile;
	speakers: EventSpeaker[];
	agenda: AgendaItem[];
	tiers: TicketTier[];
	faqs: { q: string; a: string }[];
	policies: string[];
	featured?: boolean;
	trendingRank?: number;
	viewsToday: number;
	attendees: number;
	/** Review state. Only `published` events appear in the public home/explore feeds. */
	status: EventStatus;
	/** When the organizer submitted the event for review (ISO). */
	submittedAt?: string;
	/** Admin note explaining a rejection or suspension. */
	moderationNote?: string;
	live?: boolean;
	online?: boolean;
	gates?: GateConfig[];
	/**
	 * Organizer-only promo definitions. Public event reads deliberately omit
	 * this field so unpublished/shared codes are not exposed to every buyer.
	 */
	promos?: EventPromo[];
}

export type CategoryId =
	| 'all'
	| 'tech'
	| 'music'
	| 'design'
	| 'conferences'
	| 'workshops'
	| 'food'
	| 'nightlife';

export interface CoverArt {
	src?: string; // Uploaded and server-validated event poster
	from: string;
	to: string;
	icon: string; // lucide icon key
}

export interface Ticket {
	id: string;
	code: string; // EV-XXXX-XXXX-XXXX
	eventId: string;
	eventSlug: string;
	eventTitle: string;
	eventStartsAt: string;
	venue: string;
	tierName: string;
	holder: string;
	status: 'valid' | 'used' | 'refunded' | 'transferred';
	purchasedAt: string;
	price: number;
	cover: CoverArt;
}

export interface ConversationEventRef {
	id: string;
	slug: string;
	title: string;
}

export interface Conversation {
	id: string;
	peer: Profile;
	lastMessage: string;
	lastAt: string;
	unread: number;
	online?: boolean;
	/** Event this chat is about (the one the message request came from). */
	event?: ConversationEventRef | null;
}

export interface MessageRequest {
	id: string;
	eventId: string;
	eventSlug: string;
	eventTitle: string;
	requester: Profile;
	organizer: Profile;
	body: string;
	createdAt: string;
	status: 'pending' | 'accepted' | 'declined';
	conversationId?: string;
}

export interface Message {
	id: string;
	conversationId: string;
	senderId: string;
	body: string;
	sentAt: string;
}

export interface NotificationItem {
	id: string;
	kind: 'ticket' | 'event' | 'social' | 'system' | 'promo';
	title: string;
	body: string;
	href?: string;
	at: string;
	read: boolean;
}

export interface EventFilters {
	category?: CategoryId;
	query?: string;
	city?: string;
	freeOnly?: boolean;
	dateFrom?: string;
	dateTo?: string;
	sort?: 'date' | 'popular' | 'price_asc' | 'price_desc';
}

export interface CheckoutItem {
	tierId: string;
	qty: number;
}

export type PaymentScenario = 'approve' | '3ds' | 'decline';

export interface Checkin {
	id: string;
	eventId: string;
	ticketCode: string;
	holder: string;
	tier: string;
	gate: string;
	at: string;
	result: 'verified' | 'duplicate' | 'invalid';
}

export interface Order {
	id: string;
	reference: string;
	eventId: string;
	buyer: string;
	itemsLabel: string;
	total: number;
	status: 'paid' | 'pending' | 'refunded';
	at: string;
}

export interface GateConfig {
	id: string;
	name: string;
	modes: string[]; // NFC / QR / Manual
	staff: string[];
}

export interface OrganizerPayload {
	events: EventItem[];
	stats: {
		revenue: number;
		revenueDeltaPct: number;
		checkedIn: number;
		capacity: number;
		orders: number;
		soldPct: number;
		soldLastHour: number;
		payout: number;
	};
	checkins: Checkin[];
	orders: Order[];
}

export interface WizardPayload {
	title: string;
	category: string;
	tags: string[];
	startsAt: string;
	endsAt?: string;
	venue: string;
	city: string;
	description: string;
	cover: CoverArt;
	tiers: Array<{ name: string; price: number; capacity: number; benefits?: string }>;
	promos?: Array<{ code: string; percent: number; maxUses: number }>;
	agenda: Array<{ start: string; title: string; location?: string }>;
	speakers: WizardSpeaker[];
	gates: GateConfig[];
	live?: boolean;
}
