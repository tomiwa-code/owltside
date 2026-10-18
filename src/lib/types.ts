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
	verified?: boolean;
	followers: number;
	following: number;
}

export type SpeakerInviteStatus = 'pending' | 'accepted' | 'declined';

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
	live?: boolean;
	online?: boolean;
	gates?: GateConfig[];
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
	agenda: Array<{ start: string; title: string; location?: string }>;
	speakers: WizardSpeaker[];
	gates: GateConfig[];
	live?: boolean;
}
