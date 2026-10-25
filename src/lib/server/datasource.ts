import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	ApprovalKind,
	ApprovalRequest,
	Checkin,
	CheckoutItem,
	Conversation,
	CreateApprovalInput,
	EventFilters,
	EventItem,
	EventPromo,
	EventSpeaker,
	Message,
	MessageRequest,
	NotificationItem,
	Order,
	OrganizerPayload,
	Profile,
	ResolvedPromo,
	SpeakerInviteStatus,
	Ticket,
	WizardPayload
} from '$lib/types';
import * as demo from './demo/seed';
import { isOperatingIdentity, type OperatingIdentity } from '$lib/constants/operating-identity';
import { createHash, randomInt } from 'node:crypto';
import { newTicketCode } from '$lib/utils/qr';
import {
	normalizeEventPromos,
	normalizePromoCode,
	promoDiscount
} from '$lib/utils/promo';
import { globalPromoForCode } from './promos';
import { isPubliclyVisible, normalizedEventStatus } from '$lib/utils/event-status';

const demoMeId = 'u-ada';
const demoFollows = new Map<string, Set<string>>();

type DemoPrivateConversation = {
	id: string;
	requesterId: string;
	organizerId: string;
	requester: Profile;
	organizer: Profile;
	lastMessage: string;
	lastAt: string;
	requesterUnread: number;
	organizerUnread: number;
	eventId: string;
	eventSlug: string;
	eventTitle: string;
};

const demoPrivateConversations: DemoPrivateConversation[] = [];
const demoPrivateNotifications = new Map<string, NotificationItem[]>();
const demoUserTickets = new Map<string, Ticket[]>();
const demoGateTokens = new Map<string, { code: string; expiresAt: string }>();
/** Standalone terminal PINs, keyed by organizer — the scanner arms with one even before any event exists. */
const demoScannerTokens = new Map<string, { code: string; expiresAt: string }>();
const gateTokenHash = (code: string) => createHash('sha256').update(code).digest('hex');

/*
 * Approval queue (demo). Every action that needs an administrator decision —
 * ticket refunds, organizer payouts, verification submissions — is written here
 * as `pending` and only changes when the admin console decides it. In live mode
 * the same rows live in `public.approval_requests` (supabase/sql/023).
 */
const demoApprovals: ApprovalRequest[] = [
	{
		id: 'ap-refund-ada',
		kind: 'refund',
		status: 'pending',
		requesterId: demoMeId,
		title: 'Refund · Afrobeats & Sound Sunset',
		summary: 'General pass · reason: Schedule Conflict',
		amount: 15_000,
		subjectId: 't-afrobeats-ada',
		subjectLabel: 'EV-7QK2-4M8P-9XRT',
		payload: { reason: 'Schedule Conflict', details: 'Clashes with a work trip.' },
		createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
	},
	{
		id: 'ap-payout-ada',
		kind: 'payout',
		status: 'pending',
		requesterId: demoMeId,
		title: 'Instant payout · Yaba Rooftop Sessions',
		summary: 'Cleared settlement balance requested to GTBank ••••6789',
		amount: 1_240_000,
		subjectId: 'e-rooftop',
		subjectLabel: 'Yaba Rooftop Sessions',
		payload: { eventId: 'e-rooftop', destination: 'GTBank ••••6789' },
		createdAt: new Date(Date.now() - 95 * 60 * 1000).toISOString()
	},
	{
		id: 'ap-verify-ada',
		kind: 'verification',
		status: 'approved',
		requesterId: demoMeId,
		title: 'Identity verification',
		summary: 'NIN · approved by the trust & safety team',
		subjectLabel: 'identity',
		payload: { check: 'identity', document: 'NIN' },
		note: 'Document and selfie matched.',
		createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
		decidedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
	}
];

const approvalHref = (kind: ApprovalRequest['kind'], subjectId?: string): string =>
	kind === 'refund' && subjectId
		? `/tickets/${subjectId}`
		: kind === 'payout'
			? '/organizer'
			: '/settings';

/** Inbox entry announcing receipt of a request (and, later, the decision). */
function pushDemoNotification(
	userId: string,
	notification: { kind: 'ticket' | 'event' | 'social' | 'system' | 'promo'; title: string; body: string; href?: string }
) {
	const list = demoPrivateNotifications.get(userId) ?? [];
	list.unshift({
		id: `n-${Math.random().toString(36).slice(2, 10)}`,
		at: new Date().toISOString(),
		read: false,
		...notification
	});
	demoPrivateNotifications.set(userId, list);
}

/**
 * Persist a demo approval request. Duplicate pending requests of the same kind
 * for the same subject are rejected so a reviewer cannot queue the same action
 * twice — the live path relies on a partial unique index (migration 023).
 */
function createDemoApproval(userId: string, input: CreateApprovalInput): ApprovalRequest {
	const check = typeof input.payload?.check === 'string' ? input.payload.check : undefined;
	const duplicate = demoApprovals.find(
		(request) =>
			request.requesterId === userId &&
			request.kind === input.kind &&
			request.status === 'pending' &&
			(input.kind === 'payout'
				? (request.subjectId ?? undefined) === (input.subjectId ?? undefined)
				: (request.payload?.check ?? undefined) === check &&
					(request.subjectId ?? undefined) === (input.subjectId ?? undefined))
	);
	if (duplicate) {
		throw new Error(
			describeDuplicate(input.kind, check) + ' is already awaiting approval. We will let you know as soon as it is reviewed.'
		);
	}

	const approval: ApprovalRequest = {
		id: `ap-${Math.random().toString(36).slice(2, 10)}`,
		kind: input.kind,
		status: 'pending',
		requesterId: userId,
		title: input.title,
		summary: input.summary,
		amount: input.amount,
		subjectId: input.subjectId,
		subjectLabel: input.subjectLabel,
		payload: input.payload,
		createdAt: new Date().toISOString()
	};
	demoApprovals.unshift(approval);
	pushDemoNotification(userId, {
		kind: 'system',
		title: `Pending approval · ${input.title}`,
		body: `${input.summary} — submitted to the Owltside review team.`,
		href: approvalHref(input.kind, input.subjectId)
	});
	return approval;
}

const describeDuplicate = (kind: ApprovalKind, check?: string): string =>
	kind === 'payout'
		? 'A payout request'
		: kind === 'refund'
			? 'A refund request for this pass'
			: check === 'payoutAccount'
				? 'Your payout account verification'
				: 'Your identity verification';


const CANNED: Record<string, string[]> = {
	'u-amina': [
		'Good question — the agenda sheet at the gate has the full room list.',
		'Ha, I like the energy. See you on the main stage side 👋',
		'Yes! Badge pickup opens 90 minutes before the keynote.'
	],
	'u-tunde': [
		'No cap 😂',
		'Abeg make we move this weekend too',
		'On my way, send the pin'
	],
	'u-support': [
		'We\u2019ve logged this and will follow up within 24 hours.',
		'You can manage passes from Ticket Wallet → pass → Transfer.',
		'Anything else I can help with?'
	]
};

function cannedReply(peerId: string, body: string): string {
	const pool = CANNED[peerId] ?? CANNED['u-support'];
	if (/\b(refund|cancel)\b/i.test(body)) return 'Refunds land back on your card in 3–5 working days.';
	if (/\?$/u.test(body)) return pool[0];
	return pool[Math.floor(Math.random() * pool.length)];
}

export interface OrderResult {
	orderId: string;
	reference: string;
	total: number;
	tickets: Ticket[];
}

/**
 * What a scanner PIN unlocks. Gate and terminal PINs are bearer credentials
 * an organizer can hand to door staff, so resolution deliberately does not
 * depend on the signed-in scanner user owning the event.
 */
export type StaffScanContext =
	| { kind: 'gate'; eventId: string; gate: string; eventTitle: string; organizerId: string }
	| { kind: 'terminal'; organizerId: string };

export type StaffScanResolution = StaffScanContext | { kind: 'ambiguous' };

export interface DataSource {
	mode: 'demo' | 'supabase';
	listEvents(filters?: EventFilters): Promise<EventItem[]>;
	getEvent(slug: string): Promise<EventItem | undefined>;
	getTickets(userId: string): Promise<Ticket[]>;
	getConversations(userId: string): Promise<Conversation[]>;
	getMessages(conversationId: string): Promise<Message[]>;
	getNotifications(userId: string): Promise<NotificationItem[]>;
	getProfile(handle: string): Promise<Profile | undefined>;
	searchProfiles(handlePrefix: string): Promise<Profile[]>;
	getFollowingIds(userId: string): Promise<string[]>;
	getConnections(profileId: string, kind: 'followers' | 'following'): Promise<Profile[]>;
	setFollow(userId: string, targetId: string, following: boolean): Promise<void>;
	getProfileEvents(profileId: string): Promise<EventItem[]>;
	respondToSpeakerInvite(inviteeId: string, eventSlug: string, accept: boolean): Promise<SpeakerInviteStatus>;
	createMessageRequest(requesterId: string, eventSlug: string, body: string): Promise<MessageRequest>;
	getIncomingMessageRequests(organizerId: string): Promise<MessageRequest[]>;
	getEventMessageRequest(requesterId: string, eventId: string): Promise<MessageRequest | undefined>;
	respondToMessageRequest(organizerId: string, requestId: string, accept: boolean): Promise<MessageRequest>;
	/** Validate a buyer-entered code for one event without exposing the event's other codes. */
	resolvePromoCode(eventSlug: string, code: string): Promise<ResolvedPromo | null>;
	createOrder(
		userId: string,
		eventSlug: string,
		items: CheckoutItem[],
		promoCode?: string | null
	): Promise<OrderResult>;
	sendMessage(conversationId: string, senderId: string, body: string): Promise<Message>;
	/** Clear the caller's own unread counter — opening a chat only acknowledges it for the reader. */
	markConversationRead(conversationId: string, readerId: string): Promise<void>;
	markAllNotificationsRead(userId: string): Promise<void>;
	/* organizer side */
	getOrganizer(userId: string): Promise<OrganizerPayload>;
	getOrganizerEvent(eventId: string): Promise<EventItem | undefined>;
	getEventTickets(eventId: string): Promise<Ticket[]>;
	getEventOrders(eventId: string): Promise<Order[]>;
	getEventCheckins(eventId: string): Promise<Checkin[]>;
	checkInTicket(eventId: string, code: string, gate: string): Promise<Checkin>;
	createEvent(userId: string, payload: WizardPayload): Promise<EventItem>;
	issueGateToken(userId: string, eventId: string, gateName: string): Promise<{ code: string; expiresAt: string }>;
	verifyGateToken(userId: string, eventId: string, gateName: string, code: string): Promise<boolean>;
	/** Organizer-scoped scanner ("terminal") PIN — arms the scanner with no event/gate context. */
	issueScannerToken(userId: string): Promise<{ code: string; expiresAt: string }>;
	verifyScannerToken(userId: string, code: string): Promise<boolean>;
	/** Resolve any active staff PIN to the gate/terminal it was issued for, whoever presents it. */
	resolveStaffScanToken(code: string): Promise<StaffScanResolution | null>;
	/** Check a ticket in under a resolved staff PIN (used when the scanner user is not the event owner). */
	checkInWithStaffToken(input: {
		context: StaffScanContext;
		staffToken: string;
		ticketCode?: string;
		simulate?: boolean;
	}): Promise<Checkin>;
	recordEventView(slug: string): Promise<void>;
	updateEvent(
		userId: string,
		eventId: string,
		updates: Partial<WizardPayload>
	): Promise<EventItem>;
	deleteEvent(userId: string, eventId: string): Promise<void>;
	broadcastEvent(userId: string, eventId: string, message: string): Promise<number>;
	transferTicket(userId: string, ticketId: string, recipientHandle: string): Promise<Ticket>;
	/* ── approvals (everything that needs an administrator decision) ── */
	/** The caller's own approval requests, newest first. */
	listApprovals(userId: string): Promise<ApprovalRequest[]>;
	/** Submit a payout, verification or other request for admin review. */
	createApproval(userId: string, input: CreateApprovalInput): Promise<ApprovalRequest>;
	/**
	 * Ask for a ticket refund. The ticket is NOT cancelled here: it stays valid
	 * and the request waits for an admin decision, so the pass remains usable
	 * until the refund is approved.
	 */
	requestTicketRefund(
		userId: string,
		ticketId: string,
		request?: { reason: string; details?: string }
	): Promise<ApprovalRequest>;
}

/* ────────────────────────────── demo mode ────────────────────────────── */

function matches(e: EventItem, f: EventFilters): boolean {
	if (f.category && f.category !== 'all' && e.category !== f.category) return false;
	if (f.freeOnly && e.tiers.some((t) => t.price > 0) === true && !e.tiers.some((t) => t.price === 0))
		return false;
	if (f.query) {
		const q = f.query.trim().toLowerCase();
		const hay = `${e.title} ${e.venue} ${e.city} ${e.organizer.name} ${e.tags.join(' ')}`.toLowerCase();
		if (!hay.includes(q)) return false;
	}
	if (f.dateFrom && new Date(e.startsAt) < new Date(f.dateFrom)) return false;
	if (f.dateTo && new Date(e.startsAt) > new Date(`${f.dateTo}T23:59:59`)) return false;
	return true;
}

function sortEvents(list: EventItem[], sort: EventFilters['sort']): EventItem[] {
	const arr = [...list];
	switch (sort) {
		case 'popular':
			return arr.sort((a, b) => b.viewsToday - a.viewsToday);
		case 'price_asc':
			return arr.sort((a, b) => minPrice(a) - minPrice(b));
		case 'price_desc':
			return arr.sort((a, b) => minPrice(b) - minPrice(a));
		default:
			return arr.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
	}
}

export function minPrice(e: EventItem): number {
	return Math.min(...e.tiers.map((t) => t.price));
}

/** Public/demo catalogue reads must never leak an event's promo definitions. */
function publicEvent(event: EventItem): EventItem {
	const { promos: _promos, ...publicFields } = event;
	return publicFields;
}

function demoPromoForOrder(
	event: EventItem,
	codeInput: string | null | undefined
): { resolved: ResolvedPromo | null; definition?: EventPromo } {
	const code = normalizePromoCode(codeInput);
	if (!code) return { resolved: null };
	const definition = (event.promos ?? []).find((promo) => normalizePromoCode(promo.code) === code);
	if (definition) {
		if ((definition.uses ?? 0) >= definition.maxUses) {
			throw new Error('That promo code has reached its usage limit');
		}
		return {
			definition,
			resolved: { code: definition.code, kind: 'pct', value: definition.percent, source: 'event' }
		};
	}
	const global = globalPromoForCode(code);
	if (global) return { resolved: global };
	throw new Error("That promo code isn't valid for this event");
}

function resolveDemoStaffScanToken(tokenHash: string): StaffScanResolution | null {
	const candidates: StaffScanContext[] = [];
	for (const [key, stored] of demoGateTokens) {
		if (stored.code !== tokenHash || Date.parse(stored.expiresAt) <= Date.now()) continue;
		const separator = key.indexOf(':');
		const eventId = key.slice(0, separator);
		const gate = key.slice(separator + 1);
		const event = demo.events.find((item) => item.id === eventId);
		if (!event?.gates?.some((configured) => configured.name === gate)) continue;
		candidates.push({ kind: 'gate', eventId, gate, eventTitle: event.title, organizerId: event.organizer.id });
	}
	for (const [organizerId, stored] of demoScannerTokens) {
		if (stored.code !== tokenHash || Date.parse(stored.expiresAt) <= Date.now()) continue;
		candidates.push({ kind: 'terminal', organizerId });
	}
	if (candidates.length > 1) return { kind: 'ambiguous' };
	return candidates[0] ?? null;
}

function newDemoStaffScanCode(isOwnContext: (context: StaffScanContext) => boolean): string {
	for (let attempt = 0; attempt < 20; attempt++) {
		const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
		const resolution = resolveDemoStaffScanToken(gateTokenHash(code));
		if (!resolution || (resolution.kind !== 'ambiguous' && isOwnContext(resolution))) return code;
	}
	throw new Error('Could not generate a unique scanner PIN. Please try again.');
}

export const demoSource: DataSource = {
	mode: 'demo',
	async listEvents(filters = {}) {
		return sortEvents(
			demo.events
				// Pending submissions are only visible to their organizer (dashboard).
				.filter((e) => isPubliclyVisible(e) && matches(e, filters))
				.map(publicEvent),
			filters.sort
		);
	},
	async getEvent(slug) {
		const event = demo.events.find((e) => e.slug === slug && isPubliclyVisible(e));
		return event ? publicEvent(event) : undefined;
	},
	async getTickets(userId = 'demo') {
		const uid = userId === 'demo' ? demoMeId : userId;
		if (uid === demoMeId) {
			return [...demo.tickets, ...(demoUserTickets.get(uid) ?? [])];
		}
		return [...(demoUserTickets.get(uid) ?? [])];
	},
	async getConversations(userId = 'demo') {
		const uid = userId === 'demo' ? demoMeId : userId;
		const seeded = uid === demoMeId ? [...demo.conversations] : [];
		const dynamic = demoPrivateConversations
			.filter((c) => c.requesterId === uid || c.organizerId === uid)
			.map((c) => ({
				id: c.id,
				peer: c.requesterId === uid ? c.organizer : c.requester,
				lastMessage: c.lastMessage,
				lastAt: c.lastAt,
				unread: c.requesterId === uid ? c.requesterUnread : c.organizerUnread,
				event: { id: c.eventId, slug: c.eventSlug, title: c.eventTitle }
			}));
		return [...seeded, ...dynamic].sort((a, b) => +new Date(b.lastAt) - +new Date(a.lastAt));
	},
	async getMessages(conversationId) {
		return [...(demo.messages[conversationId] ?? [])];
	},
	async getNotifications(userId = 'demo') {
		const uid = userId === 'demo' ? demoMeId : userId;
		return [...demo.notifications, ...(demoPrivateNotifications.get(uid) ?? [])]
			.sort((a, b) => +new Date(b.at) - +new Date(a.at));
	},
	async getProfile(handle) {
		const profile = Object.values(demo.people).find((p) => p.handle === handle);
		return profile ? { ...profile, following: (demoFollows.get(profile.id) ?? new Set()).size, followers: [...demoFollows.values()].filter((ids) => ids.has(profile.id)).length } : undefined;
	},
	async searchProfiles(handlePrefix) {
		const raw = handlePrefix.trim();
		const prefix = raw.replace(/^@+/, '').trim().toLowerCase();
		if (!prefix && raw !== '@') return [];
		const list = Object.values(demo.people).filter((profile) =>
			!prefix
				? true
				: `${profile.handle} ${profile.name} ${profile.city ?? ''}`.toLowerCase().includes(prefix)
		);
		if (prefix) {
			list.sort((a, b) => {
				const aStarts =
					a.handle.toLowerCase().startsWith(prefix) || a.name.toLowerCase().startsWith(prefix)
						? 0
						: 1;
				const bStarts =
					b.handle.toLowerCase().startsWith(prefix) || b.name.toLowerCase().startsWith(prefix)
						? 0
						: 1;
				return aStarts - bStarts || a.handle.localeCompare(b.handle);
			});
		}
		return list.slice(0, 8);
	},
	async getFollowingIds(userId) {
		return [...(demoFollows.get(userId) ?? [])];
	},
	async getConnections(profileId, kind) {
		const ids = kind === 'following' ? [...(demoFollows.get(profileId) ?? [])]
			: [...demoFollows].filter(([, ids]) => ids.has(profileId)).map(([id]) => id);
		return Object.values(demo.people).filter((p) => ids.includes(p.id));
	},
	async setFollow(userId, targetId, following) {
		if (userId === targetId) throw new Error('You cannot follow yourself.');
		if (!Object.values(demo.people).some((p) => p.id === targetId)) throw new Error('Profile not found.');
		const ids = demoFollows.get(userId) ?? new Set<string>();
		if (following) ids.add(targetId); else ids.delete(targetId);
		demoFollows.set(userId, ids);
	},

	async getProfileEvents(profileId) {
		return demo.events
			.filter(
				(event) => isPubliclyVisible(event) && (event.organizer?.id === profileId || event.speakers?.some((speaker) =>
					speaker?.id === profileId &&
					!speaker.displayOnly &&
					(speaker.invited ? speaker.inviteStatus === 'accepted' : speaker.inviteStatus !== 'declined')
				))
			)
			.map(publicEvent);
	},
	async respondToSpeakerInvite(inviteeId, eventSlug, accept) {
		const uid = inviteeId === 'demo' ? demoMeId : inviteeId;
		const event = demo.events.find((item) => item.slug === eventSlug);
		if (!event) throw new Error('Event not found');
		const speaker = event.speakers.find((item) => item.id === uid && item.invited && !item.displayOnly);
		if (!speaker) throw new Error('Speaker invitation not found');
		if ((speaker.inviteStatus ?? 'pending') !== 'pending') throw new Error('This speaker invitation has already been answered');
		speaker.inviteStatus = accept ? 'accepted' : 'declined';
		return speaker.inviteStatus;
	},
	async createMessageRequest(requesterId, eventSlug, body) {
		const uid = requesterId === 'demo' ? demoMeId : requesterId;
		const event = demo.events.find((item) => item.slug === eventSlug);
		if (!event) throw new Error('Event not found');
		if (event.organizer.id === uid) throw new Error('You cannot message yourself');
		const requester = Object.values(demo.people).find((profile) => profile.id === uid);
		if (!requester) throw new Error('Your profile could not be loaded');
		const active = demo.messageRequests.find((item) => item.eventId === event.id && item.requester.id === uid && (item.status === 'pending' || item.status === 'accepted'));
		if (active) return active;
		const request: MessageRequest = {
			id: `mr-${Math.random().toString(36).slice(2, 10)}`,
			eventId: event.id,
			eventSlug: event.slug,
			eventTitle: event.title,
			requester,
			organizer: event.organizer,
			body: body.trim(),
			createdAt: new Date().toISOString(),
			status: 'pending'
		};
		demo.messageRequests.unshift(request);
		return request;
	},
	async getIncomingMessageRequests(organizerId) {
		const uid = organizerId === 'demo' ? demoMeId : organizerId;
		return demo.messageRequests
			.filter((request) => request.organizer.id === uid && request.status === 'pending')
			.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
	},
	async getEventMessageRequest(requesterId, eventId) {
		const uid = requesterId === 'demo' ? demoMeId : requesterId;
		return [...demo.messageRequests]
			.filter((request) => request.eventId === eventId && request.requester.id === uid)
			.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
	},
	async respondToMessageRequest(organizerId, requestId, accept) {
		const uid = organizerId === 'demo' ? demoMeId : organizerId;
		const request = demo.messageRequests.find((item) => item.id === requestId);
		if (!request || request.organizer.id !== uid) throw new Error('Message request not found');
		if (request.status !== 'pending') throw new Error('This request has already been answered');
		if (!accept) {
			request.status = 'declined';
			return request;
		}

		let conversationId = request.requester.id === demoMeId
			? demo.conversations.find((conversation) => conversation.peer.id === request.organizer.id)?.id
			: undefined;
		let dynamic = demoPrivateConversations.find((conversation) => conversation.requesterId === request.requester.id && conversation.organizerId === request.organizer.id);
		if (!conversationId) {
			if (!dynamic) {
				dynamic = {
					id: `c-${Math.random().toString(36).slice(2, 10)}`,
					requesterId: request.requester.id,
					organizerId: request.organizer.id,
					requester: request.requester,
					organizer: request.organizer,
					lastMessage: '',
					lastAt: new Date().toISOString(),
					requesterUnread: 0,
					organizerUnread: 0,
					eventId: request.eventId,
					eventSlug: request.eventSlug,
					eventTitle: request.eventTitle
				};
				demoPrivateConversations.push(dynamic);
				demo.messages[dynamic.id] = [];
			}
			conversationId = dynamic.id;
		}
		// The chat is about the event the request was sent from — keep the
		// conversation's event brief in sync even when reusing an older thread.
		const seededConv = demo.conversations.find((conversation) => conversation.id === conversationId);
		if (seededConv) {
			seededConv.event = { id: request.eventId, slug: request.eventSlug, title: request.eventTitle };
		}
		if (dynamic && dynamic.id === conversationId) {
			dynamic.eventId = request.eventId;
			dynamic.eventSlug = request.eventSlug;
			dynamic.eventTitle = request.eventTitle;
		}
		const message: Message = {
			id: `m-${Math.random().toString(36).slice(2, 10)}`,
			conversationId,
			senderId: request.requester.id,
			body: request.body,
			sentAt: new Date().toISOString()
		};
		(demo.messages[conversationId] ??= []).push(message);
		const seeded = demo.conversations.find((conversation) => conversation.id === conversationId);
		if (seeded) {
			seeded.lastMessage = message.body;
			seeded.lastAt = message.sentAt;
		} else if (dynamic) {
			dynamic.lastMessage = message.body;
			dynamic.lastAt = message.sentAt;
			dynamic.organizerUnread += 1;
		}
		request.status = 'accepted';
		request.conversationId = conversationId;
		return request;
	},
	async resolvePromoCode(eventSlug, code) {
		const event = demo.events.find((e) => e.slug === eventSlug);
		if (!event) return null;
		try {
			return demoPromoForOrder(event, code).resolved;
		} catch {
			return null;
		}
	},
	async createOrder(userId, eventSlug, items, promoCode) {
		const event = demo.events.find((e) => e.slug === eventSlug);
		if (!event) throw new Error('Event not found');
		const promo = demoPromoForOrder(event, promoCode);
		const holder = 'Ada Obi';
		const created: Ticket[] = [];
		const requestedByTier = new Map<string, number>();
		let gross = 0;
		for (const item of items) {
			const tier = event.tiers.find((t) => t.id === item.tierId);
			if (!tier) throw new Error('Tier not found');
			const requested = (requestedByTier.get(tier.id) ?? 0) + item.qty;
			requestedByTier.set(tier.id, requested);
			if (tier.capacity - tier.sold < requested) {
				throw new Error(`Only ${tier.capacity - tier.sold} ${tier.name} passes left`);
			}
			gross += tier.price * item.qty;
		}
		const total = Math.max(0, gross - promoDiscount(gross, promo.resolved));
		for (const item of items) {
			const tier = event.tiers.find((t) => t.id === item.tierId)!;
			tier.sold += item.qty;
			for (let i = 0; i < item.qty; i++) {
				created.push({
					id: `t-${Math.random().toString(36).slice(2, 8)}`,
					code: newTicketCode(),
					eventId: event.id,
					eventSlug: event.slug,
					eventTitle: event.title,
					eventStartsAt: event.startsAt,
					venue: event.venue,
					tierName: tier.name,
					holder,
					status: 'valid',
					purchasedAt: new Date().toISOString(),
					price: tier.price,
					cover: event.cover
				});
			}
		}
		demo.tickets.unshift(...created);
		event.attendees += created.length;
		// A promo use is one completed purchase/order, not one use per ticket
		// in a multi-pass order.
		if (promo.definition) promo.definition.uses = (promo.definition.uses ?? 0) + 1;
		void userId;
		return {
			orderId: `ord-${Math.random().toString(36).slice(2, 8)}`,
			reference: `OWT-${Date.now()}`,
			total,
			tickets: created
		};
	},
	async sendMessage(conversationId, senderId, body) {
		const msg: Message = {
			id: `m-${Math.random().toString(36).slice(2, 8)}`,
			conversationId,
			senderId,
			body,
			sentAt: new Date().toISOString()
		};
		const push = (m: Message) => {
			(demo.messages[m.conversationId] ??= []).push(m);
			const conv = demo.conversations.find((c) => c.id === m.conversationId);
			if (conv) {
				conv.lastMessage = m.body;
				conv.lastAt = m.sentAt;
				// Seeded threads are the demo account's inbox: a reply counts as
				// unread until that account opens the thread.
				if (m.senderId !== demoMeId) conv.unread += 1;
			}
			const dynamic = demoPrivateConversations.find((c) => c.id === m.conversationId);
			if (dynamic) {
				dynamic.lastMessage = m.body;
				dynamic.lastAt = m.sentAt;
				dynamic.requesterUnread = m.senderId === dynamic.organizerId ? dynamic.requesterUnread + 1 : dynamic.requesterUnread;
				dynamic.organizerUnread = m.senderId === dynamic.requesterId ? dynamic.organizerUnread + 1 : dynamic.organizerUnread;
			}
		};
		push(msg);

		// Demo "realtime": the peer types back after a human-ish delay.
		if (senderId === demoMeId) {
			const conv = demo.conversations.find((c) => c.id === conversationId);
			const dynamic = demoPrivateConversations.find((c) => c.id === conversationId);
			const peerId = conv?.peer.id ?? (dynamic ? (senderId === dynamic.requesterId ? dynamic.organizerId : dynamic.requesterId) : 'u-support');
			const reply = cannedReply(peerId, body);
			setTimeout(() => {
				push({
					id: `m-${Math.random().toString(36).slice(2, 8)}`,
					conversationId,
					senderId: peerId,
					body: reply,
					sentAt: new Date().toISOString()
				});
			}, 1600 + Math.random() * 2200);
		}
		return msg;
	},
	async markConversationRead(conversationId, readerId = demoMeId) {
		const uid = readerId === 'demo' ? demoMeId : readerId;
		// Seeded threads are the demo account's own inbox.
		const seeded = demo.conversations.find((c) => c.id === conversationId);
		if (seeded) {
			if (uid === demoMeId) seeded.unread = 0;
			return;
		}
		const dynamic = demoPrivateConversations.find((c) => c.id === conversationId);
		if (!dynamic) return;
		// Read state belongs to the receiver: opening the thread must never
		// clear the other participant's counter.
		if (dynamic.requesterId === uid) dynamic.requesterUnread = 0;
		else if (dynamic.organizerId === uid) dynamic.organizerUnread = 0;
	},
	async markAllNotificationsRead(userId = 'demo') {
		const uid = userId === 'demo' ? demoMeId : userId;
		demo.notifications.forEach((n) => (n.read = true));
		(demoPrivateNotifications.get(uid) ?? []).forEach((n) => (n.read = true));
	},

	/* ── organizer side (demo) ── */
	async getOrganizer(userId) {
		const uid = userId === 'demo' ? demoMeId : userId;
		return computeOrganizer(
			demo.events.filter((e) => e.organizer?.id === uid),
			allDemoTickets().filter((t) => t.eventId === 'e-rooftop' || demo.events.some((e) => e.id === t.eventId && e.organizer?.id === uid)),
			demo.orders,
			demo.checkins
		);
	},
	async getOrganizerEvent(eventId) {
		return demo.events.find((e) => e.id === eventId);
	},
	async getEventTickets(eventId) {
		return allDemoTickets().filter((t) => t.eventId === eventId);
	},
	async getEventOrders(eventId) {
		return demo.orders.filter((o) => o.eventId === eventId);
	},
	async getEventCheckins(eventId) {
		return demo.checkins
			.filter((c) => c.eventId === eventId)
			.sort((a, b) => +new Date(b.at) - +new Date(a.at));
	},
	async checkInTicket(eventId, code, gate) {
		return performDemoCheckin(eventId, code, gate);
	},
	async createEvent(userId, payload) {
		const uid = userId === 'demo' ? demoMeId : userId;
		// demo.people is keyed by handle — resolve profiles by id instead
		const organizer = Object.values(demo.people).find((p) => p.id === uid) ?? demo.people.ada;
		const slug = payload.title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/(^-|-$)/g, '');
		const event: EventItem = {
			id: `e-${Math.random().toString(36).slice(2, 8)}`,
			slug,
			// Organizer submissions wait for admin approval before going public.
			status: 'pending',
			submittedAt: new Date().toISOString(),
			title: payload.title,
			category: payload.category,
			tags: payload.tags,
			startsAt: payload.startsAt,
			endsAt: payload.endsAt,
			venue: payload.venue,
			city: payload.city,
			cover: payload.cover,
			description: payload.description,
			organizer,
			speakers: payload.speakers.map((speaker, index) => {
				const profile = Object.values(demo.people).find((person) => person.id === speaker.id || person.handle === speaker.handle);
				return {
					...(profile ?? {
						id: speaker.id ?? `speaker-${index}`,
						handle: speaker.handle ?? '',
						avatarColor: speaker.avatarColor ?? '#8083ff',
						avatarUrl: speaker.avatarUrl ?? null,
						followers: speaker.followers ?? 0,
						following: speaker.following ?? 0
					}),
					name: speaker.name,
					role: speaker.role,
					bio: speaker.bio ?? profile?.bio,
					invited: speaker.invited,
					inviteStatus: speaker.invited ? 'pending' : undefined,
					displayOnly: speaker.displayOnly
				};
			}),
			agenda: payload.agenda.map((a, i) => ({ id: `ag-${i}`, ...a })),
			tiers: payload.tiers.map((t, i) => ({ id: `tier-${i}`, sold: 0, ...t })),
			promos: normalizeEventPromos(payload.promos).map((promo) => ({ ...promo, uses: 0 })),
			faqs: [],
			policies: [],
			gates: payload.gates,
			viewsToday: 0,
			attendees: 0,
			live: payload.live ?? true
		};
		demo.events.push(event);
		for (const speaker of event.speakers) {
			if (!speaker.invited || speaker.displayOnly || !speaker.id || speaker.id === organizer.id) continue;
			const inviteeNotifications = demoPrivateNotifications.get(speaker.id) ?? [];
			inviteeNotifications.unshift({
				id: `n-${Math.random().toString(36).slice(2, 10)}`,
				kind: 'event',
				title: `Invitation · ${event.title}`,
				body: `${organizer.name} invited you as ${speaker.role ?? 'a speaker'} for this event.`,
				href: `/events/${event.slug}`,
				at: new Date().toISOString(),
				read: false
			});
			demoPrivateNotifications.set(speaker.id, inviteeNotifications);
		}
		return event;
	},
	async issueGateToken(userId, eventId, gateName) {
		const uid = userId === 'demo' ? demoMeId : userId;
		const event = demo.events.find((item) => item.id === eventId && item.organizer.id === uid);
		if (!event || !event.gates?.some((gate) => gate.name === gateName)) throw new Error('Gate not found for this event');
		const code = newDemoStaffScanCode(
			(context) => context.kind === 'gate' && context.eventId === eventId && context.gate === gateName
		);
		const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
		demoGateTokens.set(`${eventId}:${gateName}`, { code: gateTokenHash(code), expiresAt });
		return { code, expiresAt };
	},
	async verifyGateToken(_userId, eventId, gateName, code) {
		// A gate PIN is the staff credential itself: whoever presents a valid,
		// unexpired PIN for this configured gate may scan at it. Ownership is
		// still required to issue or rotate the PIN.
		const event = demo.events.find((item) => item.id === eventId);
		const stored = demoGateTokens.get(`${eventId}:${gateName}`);
		return Boolean(event?.gates?.some((gate) => gate.name === gateName) && stored && Date.parse(stored.expiresAt) > Date.now() && stored.code === gateTokenHash(code));
	},
	async issueScannerToken(userId) {
		const uid = userId === 'demo' ? demoMeId : userId;
		const code = newDemoStaffScanCode(
			(context) => context.kind === 'terminal' && context.organizerId === uid
		);
		const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
		demoScannerTokens.set(uid, { code: gateTokenHash(code), expiresAt });
		return { code, expiresAt };
	},
	async verifyScannerToken(userId, code) {
		const uid = userId === 'demo' ? demoMeId : userId;
		const stored = demoScannerTokens.get(uid);
		return Boolean(stored && Date.parse(stored.expiresAt) > Date.now() && stored.code === gateTokenHash(code));
	},
	async resolveStaffScanToken(code) {
		return resolveDemoStaffScanToken(gateTokenHash(code));
	},
	async checkInWithStaffToken({ context, staffToken, ticketCode, simulate = false }) {
		const resolved = resolveDemoStaffScanToken(gateTokenHash(staffToken));
		const matches =
			resolved?.kind === context.kind &&
			(context.kind !== 'gate' ||
				(resolved.kind === 'gate' && resolved.eventId === context.eventId && resolved.gate === context.gate)) &&
			(context.kind !== 'terminal' ||
				(resolved.kind === 'terminal' && resolved.organizerId === context.organizerId));
		if (!matches) throw new Error('Gate PIN is invalid or expired');

		if (context.kind === 'gate') {
			const code = simulate
				? (allDemoTickets().find((ticket) => ticket.eventId === context.eventId && ticket.status === 'valid') ??
					allDemoTickets().find((ticket) => ticket.eventId === context.eventId))?.code
				: ticketCode;
			if (!code) throw new Error(simulate ? 'No tickets left to scan' : 'Invalid scan request');
			return performDemoCheckin(context.eventId, code, context.gate);
		}

		const ownerTickets = allDemoTickets().filter((ticket) =>
			demo.events.some((event) => event.id === ticket.eventId && event.organizer.id === context.organizerId)
		);
		const ticket = simulate
			? (ownerTickets.find((candidate) => candidate.status === 'valid') ?? ownerTickets[0])
			: ownerTickets.find((candidate) => candidate.code === ticketCode);
		if (!ticket) {
			if (simulate) throw new Error('No tickets left to scan');
			return {
				id: `ck-${ticketCode ?? 'unknown'}`,
				eventId: '',
				ticketCode: ticketCode ?? '',
				holder: 'Unknown pass',
				tier: '—',
				gate: 'Terminal',
				at: new Date().toISOString(),
				result: 'invalid' as const
			};
		}
		return performDemoCheckin(ticket.eventId, ticket.code, 'Terminal');
	},
		async recordEventView(slug) {
		const event = demo.events.find((e) => e.slug === slug);
		if (event) event.viewsToday += 1;
	},
	async updateEvent(userId, eventId, updates) {
		const uid = userId === 'demo' ? demoMeId : userId;
		const event = demo.events.find((e) => e.id === eventId && e.organizer.id === uid);
		if (!event) throw new Error('Event not found');
		// Editing a rejected listing resubmits it for review.
		if (event.status === 'rejected') {
			event.status = 'pending';
			event.submittedAt = new Date().toISOString();
			event.moderationNote = undefined;
		}
		if (updates.title) event.title = updates.title;
		if (updates.venue) event.venue = updates.venue;
		if (updates.city) event.city = updates.city;
		if (updates.description !== undefined) event.description = updates.description;
		if (updates.category !== undefined) event.category = updates.category;
		if (updates.tags !== undefined) event.tags = updates.tags;
		if (updates.startsAt !== undefined) event.startsAt = updates.startsAt;
		if (updates.endsAt !== undefined) event.endsAt = updates.endsAt;
		if (updates.cover !== undefined) event.cover = updates.cover;
		if (updates.speakers !== undefined) event.speakers = updates.speakers.map((speaker, index) => ({ id: speaker.id ?? `speaker-${index}`, handle: speaker.handle ?? '', name: speaker.name, avatarColor: speaker.avatarColor ?? '#8083ff', avatarUrl: speaker.avatarUrl ?? null, followers: speaker.followers ?? 0, following: speaker.following ?? 0, role: speaker.role, bio: speaker.bio, invited: speaker.invited, inviteStatus: speaker.invited ? (speaker.inviteStatus ?? 'pending') : undefined, displayOnly: speaker.displayOnly }));
		if (updates.agenda !== undefined) event.agenda = updates.agenda.map((item, index) => ({ id: event.agenda[index]?.id ?? `ag-${index}`, ...item }));
		if (updates.tiers !== undefined) event.tiers = updates.tiers.map((tier, index) => ({ id: event.tiers[index]?.id ?? `tier-${index}`, sold: event.tiers[index]?.sold ?? 0, ...tier, capacity: Math.max(tier.capacity, event.tiers[index]?.sold ?? 0) }));
		if (updates.promos !== undefined) {
			const previousUses = new Map((event.promos ?? []).map((promo) => [promo.code, promo.uses ?? 0]));
			event.promos = normalizeEventPromos(updates.promos).map((promo) => {
				const uses = previousUses.get(promo.code) ?? 0;
				return { ...promo, maxUses: Math.max(promo.maxUses, uses), uses };
			});
		}
		if (updates.gates !== undefined) event.gates = updates.gates;
		if (updates.live !== undefined) event.live = updates.live;
		return event;
	},
	async deleteEvent(userId, eventId) {
		const uid = userId === 'demo' ? demoMeId : userId;
		const idx = demo.events.findIndex((e) => e.id === eventId && e.organizer.id === uid);
		if (idx === -1) throw new Error('Event not found');
		demo.events.splice(idx, 1);
	},
	async broadcastEvent(userId, eventId, message) {
		const uid = userId === 'demo' ? demoMeId : userId;
		const event = demo.events.find((e) => e.id === eventId && e.organizer.id === uid);
		if (!event) throw new Error('Event not found');
		const body = message.trim();
		if (!body) throw new Error('Enter a message to broadcast');
		// The announcement lands in the notification hub of every pass owner.
		const owners = demoTicketOwners(eventId);
		const at = new Date().toISOString();
		for (const ownerId of owners) {
			const ownerNotifications = demoPrivateNotifications.get(ownerId) ?? [];
			ownerNotifications.unshift({
				id: `n-${Math.random().toString(36).slice(2, 10)}`,
				kind: 'event',
				title: `Announcement · ${event.title}`,
				body,
				href: `/events/${event.slug}`,
				at,
				read: false
			});
			demoPrivateNotifications.set(ownerId, ownerNotifications);
		}
		return owners.size;
	},
	async transferTicket(userId, ticketId, recipientHandle) {
		const uid = userId === 'demo' ? demoMeId : userId;
		const raw = recipientHandle.trim();
		if (/[,;]/.test(raw) || (raw.match(/@/g)?.length ?? 0) > 1) {
			throw new Error('Ticket transfer is 1-to-1. Select a single recipient.');
		}
		const cleaned = raw.replace(/^@+/, '').trim().toLowerCase();
		if (!cleaned) throw new Error('Enter a valid recipient @handle');
		const sender = Object.values(demo.people).find((p) => p.id === uid);
		const recipient = Object.values(demo.people).find(
			(p) => p.handle.toLowerCase() === cleaned || p.name.toLowerCase() === cleaned
		);
		if (!recipient) throw new Error(`No member found with handle @${cleaned}`);
		if (
			recipient.id === uid ||
			(sender && recipient.handle.toLowerCase() === sender.handle.toLowerCase())
		) {
			throw new Error('You cannot transfer a ticket to yourself');
		}
		const pool = uid === demoMeId ? demo.tickets : (demoUserTickets.get(uid) ?? []);
		const ticket = pool.find((t) => t.id === ticketId) ?? demo.tickets.find((t) => t.id === ticketId);
		if (!ticket) throw new Error('Ticket not found');
		if (ticket.status !== 'valid') throw new Error('Only active tickets can be transferred');
		const rotatedCode = newTicketCode();
		ticket.holder = recipient.name;
		ticket.code = rotatedCode;
		ticket.status = 'transferred';

		const recipientTickets = demoUserTickets.get(recipient.id) ?? [];
		const existingIdx = recipientTickets.findIndex((t) => t.id === ticket.id);
		const activeCopy: Ticket = {
			...ticket,
			holder: recipient.name,
			code: rotatedCode,
			status: 'valid'
		};
		if (existingIdx >= 0) {
			recipientTickets[existingIdx] = activeCopy;
		} else {
			recipientTickets.unshift(activeCopy);
		}
		demoUserTickets.set(recipient.id, recipientTickets);

		const nowIso = new Date().toISOString();
		const recipientNotifications = demoPrivateNotifications.get(recipient.id) ?? [];
		recipientNotifications.unshift({
			id: `n-${Math.random().toString(36).slice(2, 10)}`,
			kind: 'ticket',
			title: `Pass Transferred · ${ticket.eventTitle}`,
			body: `A ${ticket.tierName} pass for ${ticket.eventTitle} has been transferred to your wallet${sender ? ` by @${sender.handle}` : ''}.`,
			href: `/tickets/${ticket.id}`,
			at: nowIso,
			read: false
		});
		demoPrivateNotifications.set(recipient.id, recipientNotifications);

		const senderNotifications = demoPrivateNotifications.get(uid) ?? [];
		senderNotifications.unshift({
			id: `n-${Math.random().toString(36).slice(2, 10)}`,
			kind: 'ticket',
			title: `Pass Transferred · ${ticket.eventTitle}`,
			body: `Your ${ticket.tierName} pass for ${ticket.eventTitle} was transferred to @${recipient.handle}.`,
			href: `/tickets/${ticket.id}`,
			at: nowIso,
			read: false
		});
		demoPrivateNotifications.set(uid, senderNotifications);

		return ticket;
	},
	async listApprovals(userId) {
		const uid = userId === 'demo' ? demoMeId : userId;
		return demoApprovals
			.filter((request) => request.requesterId === uid)
			.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
			.map((request) => ({ ...request }));
	},
	async createApproval(userId, input) {
		const uid = userId === 'demo' ? demoMeId : userId;
		return createDemoApproval(uid, input);
	},
	async requestTicketRefund(userId, ticketId, request) {
		const uid = userId === 'demo' ? demoMeId : userId;
		const owned = demoUserTickets.get(uid) ?? [];
		const ticket =
			owned.find((item) => item.id === ticketId) ??
			(uid === demoMeId ? allDemoTickets().find((item) => item.id === ticketId) : undefined);
		if (!ticket) throw new Error('Ticket not found');
		// The pass stays valid (and scan-able) until an admin approves the refund.
		if (ticket.status !== 'valid') throw new Error('Only active tickets can be refunded');
		return createDemoApproval(uid, {
			kind: 'refund',
			title: `Refund · ${ticket.eventTitle}`,
			summary: `${ticket.tierName} pass · reason: ${request?.reason ?? 'Not specified'}`,
			amount: ticket.price,
			subjectId: ticket.id,
			subjectLabel: ticket.code,
			payload: { reason: request?.reason ?? '', details: request?.details ?? '', code: ticket.code }
		});
	}
};

function allDemoTickets(): Ticket[] {
	return [...demo.tickets, ...demo.rooftopTickets];
}

function performDemoCheckin(eventId: string, code: string, gate: string): Checkin {
	const ticket = allDemoTickets().find((t) => t.eventId === eventId && t.code === code);
	const at = new Date().toISOString();
	if (!ticket) {
		const ck: Checkin = {
			id: `ck-${Math.random().toString(36).slice(2, 8)}`,
			eventId,
			ticketCode: code,
			holder: 'Unknown pass',
			tier: '—',
			gate,
			at,
			result: 'invalid'
		};
		demo.checkins.unshift(ck);
		return ck;
	}
	if (ticket.status === 'used') {
		const ck: Checkin = {
			id: `ck-${Math.random().toString(36).slice(2, 8)}`,
			eventId,
			ticketCode: code,
			holder: ticket.holder,
			tier: ticket.tierName,
			gate,
			at,
			result: 'duplicate'
		};
		demo.checkins.unshift(ck);
		return ck;
	}
	ticket.status = 'used';
	const ck: Checkin = {
		id: `ck-${Math.random().toString(36).slice(2, 8)}`,
		eventId,
		ticketCode: code,
		holder: ticket.holder,
		tier: ticket.tierName,
		gate,
		at,
		result: 'verified'
	};
	demo.checkins.unshift(ck);
	return ck;
}

/**
 * Demo passes only carry a holder name, so resolve the account that owns each
 * pass of an event. Used to deliver broadcast announcements to ticket owners.
 */
function demoTicketOwners(eventId: string): Set<string> {
	const owners = new Set<string>();
	const idByHolder = new Map<string, string>();
	for (const person of Object.values(demo.people)) {
		idByHolder.set(person.name.trim().toLowerCase(), person.id);
	}
	const isAnnounceable = (ticket: Ticket) =>
		ticket.eventId === eventId && ticket.status !== 'refunded' && ticket.status !== 'transferred';
	for (const [userId, tickets] of demoUserTickets) {
		if (tickets.some(isAnnounceable)) owners.add(userId);
	}
	for (const ticket of allDemoTickets()) {
		if (!isAnnounceable(ticket)) continue;
		const ownerId = idByHolder.get(ticket.holder.trim().toLowerCase());
		if (ownerId) owners.add(ownerId);
	}
	return owners;
}

export function computeOrganizer(
	events: EventItem[],
	tickets: Ticket[],
	orders: Order[],
	checkins: Checkin[]
): OrganizerPayload {
	const sold = events.reduce((s, e) => s + e.tiers.reduce((x, t) => x + t.sold, 0), 0);
	const capacity = events.reduce((s, e) => s + e.tiers.reduce((x, t) => x + t.capacity, 0), 0);
	const revenue = events.reduce(
		(s, e) => s + e.tiers.reduce((x, t) => x + t.sold * t.price, 0),
		0
	);
	const checkedIn = tickets.filter((t) => t.status === 'used').length;
	return {
		events,
		stats: {
			revenue,
			revenueDeltaPct: 24,
			checkedIn,
			capacity,
			orders: sold,
			soldPct: capacity ? Math.round((sold / capacity) * 1000) / 10 : 0,
			soldLastHour: 12,
			payout: Math.round(revenue * 0.35)
		},
		checkins: [...checkins].sort((a, b) => +new Date(b.at) - +new Date(a.at)),
		orders
	};
}

/* ──────────────────────────── supabase mode ──────────────────────────── */

type Row = Record<string, any>;

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** True when Postgres/PostgREST reports that a function was never installed. */
const isMissingFunctionError = (error: { code?: string; message?: string } | null): boolean => {
	if (!error) return false;
	if (error.code === '42883' || error.code === 'PGRST202') return true;
	return /function .* does not exist|could not find the function/i.test(error.message ?? '');
};

const isMissingPromoStorageError = (error: { code?: string; message?: string } | null): boolean => {
	if (!error) return false;
	if (error.code === '42P01' || error.code === 'PGRST205') return true;
	return /event_promos.*(?:does not exist|not found)|relation .*event_promos|could not find the table .*event_promos/i.test(
		error.message ?? ''
	);
};

const promoStorageError = () =>
	new Error('Event promo storage is not installed. Apply supabase/sql/020_event_promos.sql, then try again.');

/**
 * The event review columns arrive with migration 022. Until it is applied the
 * app keeps working (treating the catalogue as published) instead of failing
 * every feed with "column events.status does not exist".
 */
const isMissingEventStatusError = (error: { code?: string; message?: string } | null): boolean => {
	if (!error) return false;
	const mentionsColumn = /\b(status|submitted_at|moderation_note|moderated_at)\b/i.test(error.message ?? '');
	if (error.code === '42703' || error.code === 'PGRST204') return mentionsColumn;
	return /column .*\.(status|submitted_at|moderation_note|moderated_at) does not exist/i.test(error.message ?? '');
};

const isMissingApprovalStorageError = (error: { code?: string; message?: string } | null): boolean => {
	if (!error) return false;
	if (error.code === '42P01' || error.code === 'PGRST205') return true;
	return /approval_requests.*(?:does not exist|not found)|could not find the table .*approval_requests/i.test(
		error.message ?? ''
	);
};

const approvalStorageError = () =>
	new Error('The approval queue is not installed. Apply supabase/sql/023_approval_requests.sql, then try again.');

const isDuplicateApprovalError = (error: { code?: string; message?: string } | null): boolean =>
	Boolean(error) && (error!.code === '23505' || /duplicate key value/i.test(error!.message ?? ''));

const toApproval = (r: Row): ApprovalRequest => ({
	id: r.id,
	kind: r.kind,
	status: r.status,
	requesterId: r.requester_id,
	title: r.title,
	summary: r.summary ?? '',
	amount: r.amount === null || r.amount === undefined ? undefined : Number(r.amount),
	subjectId: r.subject_id ?? undefined,
	subjectLabel: r.subject_label ?? undefined,
	payload: (r.payload ?? {}) as Record<string, unknown>,
	note: r.decision_note ?? undefined,
	createdAt: r.created_at,
	decidedAt: r.decided_at ?? undefined
});

const toEventPromo = (r: Row): EventPromo => ({
	code: normalizePromoCode(String(r.code ?? '')),
	percent: Number(r.percent ?? 0),
	maxUses: Number(r.max_uses ?? r.maxUses ?? 0),
	uses: Number(r.uses_count ?? r.uses ?? 0)
});

async function fetchEventPromos(
	db: SupabaseClient,
	eventIds: string[]
): Promise<Map<string, EventPromo[]>> {
	const byEvent = new Map<string, EventPromo[]>();
	if (eventIds.length === 0) return byEvent;
	const { data, error } = await db.from('event_promos').select('*').in('event_id', eventIds);
	if (error) {
		// Organizer screens should keep working on a database that has not
		// received migration 020 yet; saving a new promo fails explicitly.
		if (isMissingPromoStorageError(error)) return byEvent;
		throw error;
	}
	for (const row of (data ?? []) as Row[]) {
		const promos = byEvent.get(row.event_id) ?? [];
		promos.push(toEventPromo(row));
		byEvent.set(row.event_id, promos);
	}
	for (const promos of byEvent.values()) promos.sort((a, b) => a.code.localeCompare(b.code));
	return byEvent;
}

async function insertEventPromos(
	db: SupabaseClient,
	eventId: string,
	definitions: EventPromo[]
): Promise<EventPromo[]> {
	const promos = normalizeEventPromos(definitions).map((promo) => ({ ...promo, uses: 0 }));
	if (promos.length === 0) return [];
	const { error } = await db.from('event_promos').insert(
		promos.map((promo) => ({
			event_id: eventId,
			code: promo.code,
			percent: promo.percent,
			max_uses: promo.maxUses
		}))
	);
	if (error) {
		if (isMissingPromoStorageError(error)) throw promoStorageError();
		throw error;
	}
	return promos;
}

async function replaceEventPromos(
	db: SupabaseClient,
	eventId: string,
	definitions: EventPromo[]
): Promise<EventPromo[]> {
	const desired = normalizeEventPromos(definitions);
	const { data: existingRows, error: fetchError } = await db
		.from('event_promos')
		.select('*')
		.eq('event_id', eventId);
	if (fetchError) {
		if (isMissingPromoStorageError(fetchError)) {
			if (desired.length === 0) return [];
			throw promoStorageError();
		}
		throw fetchError;
	}
	const existing = ((existingRows ?? []) as Row[]).map(toEventPromo);
	const existingByCode = new Map(existing.map((promo) => [promo.code, promo]));
	const synced = desired.map((promo) => {
		const uses = existingByCode.get(promo.code)?.uses ?? 0;
		return { ...promo, maxUses: Math.max(promo.maxUses, uses), uses };
	});

	if (synced.length > 0) {
		const { error } = await db.from('event_promos').upsert(
			synced.map((promo) => ({
				event_id: eventId,
				code: promo.code,
				percent: promo.percent,
				max_uses: promo.maxUses
			})),
			{ onConflict: 'event_id,code' }
		);
		if (error) {
			if (isMissingPromoStorageError(error)) throw promoStorageError();
			throw error;
		}
	}

	const desiredCodes = new Set(synced.map((promo) => promo.code));
	const removedCodes = existing.filter((promo) => !desiredCodes.has(promo.code)).map((promo) => promo.code);
	if (removedCodes.length > 0) {
		const { error } = await db
			.from('event_promos')
			.delete()
			.eq('event_id', eventId)
			.in('code', removedCodes);
		if (error) throw error;
	}
	return synced.sort((a, b) => a.code.localeCompare(b.code));
}

const mapStaffScanResolution = (data: Row | null): StaffScanResolution | null => {
	if (!data) return null;
	if (data.kind === 'ambiguous') return { kind: 'ambiguous' };
	if (data.kind === 'gate') {
		return {
			kind: 'gate',
			eventId: data.eventId,
			gate: data.gate,
			eventTitle: data.eventTitle ?? 'Shared event',
			organizerId: data.organizerId
		};
	}
	if (data.kind === 'terminal') return { kind: 'terminal', organizerId: data.organizerId };
	return null;
};

async function resolveStaffScanTokenHash(
	db: SupabaseClient,
	tokenHash: string
): Promise<StaffScanResolution | null> {
	const { data, error } = await db.rpc('resolve_staff_scan_token', { p_token_hash: tokenHash });
	if (error) throw error;
	return mapStaffScanResolution(data as Row | null);
}

/**
 * Generate a PIN that is not already active for a different gate/terminal,
 * so presenting it later resolves to exactly one scanner context. Falls
 * back to a plain random PIN when migration 019 is not installed yet.
 */
async function newStaffScanCode(
	db: SupabaseClient,
	isOwnContext: (context: StaffScanContext) => boolean
): Promise<string> {
	for (let attempt = 0; attempt < 20; attempt++) {
		const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
		try {
			const resolution = await resolveStaffScanTokenHash(db, gateTokenHash(code));
			if (!resolution || (resolution.kind !== 'ambiguous' && isOwnContext(resolution))) return code;
		} catch (error) {
			if (isMissingFunctionError(error as { code?: string; message?: string })) return code;
			throw error;
		}
	}
	throw new Error('Could not generate a unique scanner PIN. Please try again.');
}

/** Chosen operating identity from a profile row (column added in 017; absent on un-migrated DBs). */
const rowOperatingIdentity = (r: Row): OperatingIdentity | undefined => {
	const raw = r.operating_identity ?? r.operatingIdentity;
	return typeof raw === 'string' && isOperatingIdentity(raw) ? raw : undefined;
};

const toProfile = (r: Row): Profile => ({
	id: r.id,
	handle: r.handle,
	name: r.name,
	avatarColor: r.avatar_color ?? '#8083ff',
	avatarUrl: r.avatar_url,
	bio: r.bio,
	link: r.link,
	city: r.city,
	bannerUrl: r.banner_url,
	interests: r.interests ?? [],
	usernameChangedAt: r.username_changed_at,
	operatingIdentity: rowOperatingIdentity(r),
	verified: !!r.verified,
	followers: r.followers ?? 0,
	following: r.following ?? 0
});

const toEventSpeaker = (r: Row, index: number): EventSpeaker => ({
	id: r.id ?? `speaker-${index}`,
	handle: r.handle ?? '',
	name: r.name ?? 'Guest speaker',
	avatarColor: r.avatarColor ?? r.avatar_color ?? '#8083ff',
	avatarUrl: r.avatarUrl ?? r.avatar_url ?? null,
	bio: r.bio ?? r.role,
	city: r.city,
	operatingIdentity: rowOperatingIdentity(r),
	verified: !!r.verified,
	followers: r.followers ?? 0,
	following: r.following ?? 0,
	role: r.role,
	invited: !!r.invited,
	inviteStatus: r.inviteStatus ?? (r.invited ? 'pending' : undefined),
	displayOnly: !!r.displayOnly
});

const toMessageRequest = (r: Row): MessageRequest => ({
	id: r.id,
	eventId: r.event_id,
	eventSlug: r.event?.slug ?? r.event_slug,
	eventTitle: r.event?.title ?? r.event_title,
	requester: toProfile(r.requester),
	organizer: toProfile(r.organizer),
	body: r.body,
	createdAt: r.created_at,
	status: r.status,
	conversationId: r.conversation_id ?? undefined
});

const toCoverArt = (value: unknown): EventItem['cover'] => {
	let raw: Record<string, unknown> = {};
	if (typeof value === 'string') {
		try { raw = JSON.parse(value) as Record<string, unknown>; }
		catch { raw = { src: value }; }
	} else if (value && typeof value === 'object' && !Array.isArray(value)) {
		raw = value as Record<string, unknown>;
	}
	const src = [raw.src, raw.url, raw.imageUrl, raw.image_url, raw.poster].find((candidate) => typeof candidate === 'string' && candidate.trim());
	return {
		...(typeof src === 'string' ? { src } : {}),
		from: typeof raw.from === 'string' ? raw.from : '#312e81',
		to: typeof raw.to === 'string' ? raw.to : '#0b1326',
		icon: typeof raw.icon === 'string' ? raw.icon : 'music'
	};
};

const toEvent = (r: Row, organizer: Profile): EventItem => ({
	id: r.id,
	slug: r.slug,
	title: r.title,
	category: r.category,
	tags: r.tags ?? [],
	startsAt: r.starts_at,
	endsAt: r.ends_at,
	venue: r.venue,
	city: r.city,
	cover: toCoverArt(r.cover),
	description: r.description ?? '',
	organizer,
	speakers: (r.speakers ?? []).map((speaker: Row, index: number) => toEventSpeaker(speaker, index)),
	agenda: r.agenda ?? [],
	tiers: r.tiers ?? [],
	gates: r.gates ?? [],
	faqs: r.faqs ?? [],
	policies: r.policies ?? [],
	featured: !!r.featured,
	trendingRank: r.trending_rank,
	viewsToday: r.views_today ?? 0,
	attendees: r.attendees ?? 0,
	status: normalizedEventStatus({ status: r.status }),
	submittedAt: r.submitted_at ?? undefined,
	moderationNote: r.moderation_note ?? undefined,
	live: !!r.live
});

const toTicket = (r: Row): Ticket => ({
	id: r.id,
	code: r.code,
	eventId: r.event_id,
	eventSlug: r.event_slug,
	eventTitle: r.event_title,
	eventStartsAt: r.event_starts_at,
	venue: r.venue,
	tierName: r.tier_name,
	holder: r.holder_name,
	status: r.status,
	purchasedAt: r.purchased_at,
	price: r.price,
	cover: r.cover
});

export function supabaseSource(db: SupabaseClient): DataSource {
	return {
		mode: 'supabase',
		async listEvents(filters = {}) {
			// Public feeds only ever show approved events. Organizer dashboards use
			// getOrganizer(), which deliberately keeps every status visible.
			const query = () => {
				let q = db.from('events').select('*, organizer:profiles(*)').order('starts_at');
				if (filters.category && filters.category !== 'all') q = q.eq('category', filters.category);
				// Apply the same text, venue, date, and price semantics as demo mode below.
				if (filters.dateFrom) q = q.gte('starts_at', filters.dateFrom);
				return q;
			};
			let { data, error } = await query().eq('status', 'published');
			if (error && isMissingEventStatusError(error)) {
				// Database predates migration 022: treat the catalogue as published.
				({ data, error } = await query());
			}
			if (error) throw error;
			return sortEvents((data ?? []).map((r) => toEvent(r, toProfile(r.organizer))).filter((event) => matches(event, filters)), filters.sort);
		},
		async getEvent(slug) {
			const load = (approvedOnly: boolean) => {
				let q = db.from('events').select('*, organizer:profiles(*)').eq('slug', slug);
				if (approvedOnly) q = q.eq('status', 'published');
				return q.maybeSingle();
			};
			let { data, error } = await load(true);
			if (error && isMissingEventStatusError(error)) ({ data, error } = await load(false));
			if (error) throw error;
			return data ? toEvent(data, toProfile(data.organizer)) : undefined;
		},
		async getTickets(userId) {
			if (!isUuid(userId)) return [];
			const { data, error } = await db
				.from('tickets')
				.select('*')
				.eq('owner_id', userId)
				.order('purchased_at', { ascending: false });
			if (error) throw error;
			return (data ?? []).map(toTicket);
		},
		async getConversations(userId) {
			if (!isUuid(userId)) return [];
			const { data, error } = await db
				.from('conversations')
				.select('*, user:profiles!conversations_user_id_fkey(*), peer:profiles!conversations_peer_id_fkey(*)')
				.or(`user_id.eq.${userId},peer_id.eq.${userId}`);
			if (error) throw error;
			const rows = data ?? [];
			// Resolve the event each chat is about (added in 015_conversation_events).
			// event_id is read defensively so an un-migrated database still lists threads.
			const eventIds = [...new Set(rows.map((r: Row) => r.event_id).filter(Boolean))] as string[];
			const eventRefs = new Map<string, { id: string; slug: string; title: string }>();
			if (eventIds.length) {
				const { data: events, error: eventError } = await db
					.from('events')
					.select('id,slug,title')
					.in('id', eventIds);
				if (!eventError) {
					for (const ev of events ?? []) eventRefs.set(ev.id, { id: ev.id, slug: ev.slug, title: ev.title });
				}
			}
			return rows.map((r: Row) => ({
				id: r.id,
				peer: toProfile(r.user_id === userId ? r.peer : r.user),
				lastMessage: r.last_message ?? '',
				lastAt: r.last_at,
				// Read state is per participant (021): `unread` counts what the row
				// owner has not opened, `peer_unread` what the other side has not.
				// peer_unread is read defensively so an un-migrated database lists 0.
				unread: r.user_id === userId ? (r.unread ?? 0) : (r.peer_unread ?? 0),
				event: r.event_id ? (eventRefs.get(r.event_id) ?? null) : null
			}));
		},
		async getMessages(conversationId) {
			if (!isUuid(conversationId)) return [];
			const { data, error } = await db
				.from('messages')
				.select('*')
				.eq('conversation_id', conversationId)
				.order('sent_at');
			if (error) throw error;
			return (data ?? []).map((r: Row) => ({
				id: r.id,
				conversationId: r.conversation_id,
				senderId: r.sender_id,
				body: r.body,
				sentAt: r.sent_at
			}));
		},
		async getNotifications(userId) {
			if (!isUuid(userId)) return [];
			const { data, error } = await db
				.from('notifications')
				.select('*')
				.eq('user_id', userId)
				.order('at', { ascending: false });
			if (error) throw error;
			return (data ?? []).map((r: Row) => ({
				id: r.id,
				kind: r.kind,
				title: r.title,
				body: r.body,
				href: r.href ?? undefined,
				at: r.at,
				read: !!r.read
			}));
		},
		async getProfile(handle) {
			const { data, error } = await db.from('profiles').select('*').eq('handle', handle).maybeSingle();
			if (error) throw error;
			return data ? toProfile(data) : undefined;
		},
		async searchProfiles(handlePrefix) {
			const raw = handlePrefix.trim();
			const prefix = raw.replace(/^@+/, '').trim().toLowerCase();
			if (!prefix && raw !== '@') return [];
			if (!prefix && raw === '@') {
				const { data, error } = await db.from('profiles').select('*').order('handle').limit(30);
				if (error) throw error;
				return (data ?? []).map(toProfile);
			}
			const safe = prefix.replace(/[^\p{L}\p{N}_ -]/gu, '').slice(0, 80);
			if (!safe) return [];
			const { data, error } = await db.from('profiles').select('*').or(`handle.ilike.%${safe}%,name.ilike.%${safe}%,city.ilike.%${safe}%`).order('handle').limit(30);
			if (error) throw error;
			return (data ?? []).map(toProfile);
		},
		async getFollowingIds(userId) {
			const { data, error } = await db.from('profile_follows').select('following_id').eq('follower_id', userId);
			if (error) throw error;
			return (data ?? []).map((r) => r.following_id);
		},
		async getConnections(profileId, kind) {
			const column = kind === 'following' ? 'following_id' : 'follower_id';
			const { data, error } = await db.from('profile_follows')
				.select(`profile:profiles!profile_follows_${column}_fkey(*)`)
				.eq(kind === 'following' ? 'follower_id' : 'following_id', profileId)
				.order('created_at', { ascending: false });
			if (error) throw error;
			return (data ?? []).map((r) => toProfile(r.profile));
		},
		async setFollow(userId, targetId, following) {
			if (userId === targetId) throw new Error('You cannot follow yourself.');
			const result = following
				? await db.from('profile_follows').upsert({ follower_id: userId, following_id: targetId }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true })
				: await db.from('profile_follows').delete().eq('follower_id', userId).eq('following_id', targetId);
			if (result.error) throw result.error;
		},

		async getProfileEvents(profileId) {
			if (!isUuid(profileId)) return [];
			const load = (approvedOnly: boolean) => {
				let q = db.from('events').select('*, organizer:profiles(*)').order('starts_at');
				if (approvedOnly) q = q.eq('status', 'published');
				return q;
			};
			let { data, error } = await load(true);
			if (error && isMissingEventStatusError(error)) ({ data, error } = await load(false));
			if (error) throw error;
			return (data ?? [])
				.map((row) => toEvent(row, toProfile(row.organizer)))
				.filter((event) => event.organizer.id === profileId || event.speakers.some((speaker) =>
					speaker.id === profileId &&
					!speaker.displayOnly &&
					(speaker.invited ? speaker.inviteStatus === 'accepted' : speaker.inviteStatus !== 'declined')
				));
		},
		async respondToSpeakerInvite(_inviteeId, eventSlug, accept) {
			const { data, error } = await db.rpc('respond_to_event_speaker_invite', {
				p_event_slug: eventSlug,
				p_accept: accept
			});
			if (error) throw error;
			if (data?.status !== 'accepted' && data?.status !== 'declined') {
				throw new Error('The speaker invitation response could not be saved');
			}
			return data.status;
		},
		async createMessageRequest(requesterId, eventSlug, body) {
			const { data: event, error: eventError } = await db
				.from('events')
				.select('id,slug,title,organizer_id')
				.eq('slug', eventSlug)
				.maybeSingle();
			if (eventError) throw eventError;
			if (!event) throw new Error('Event not found');
			if (event.organizer_id === requesterId) throw new Error('You cannot message yourself');
			const requestSelect = '*, requester:profiles!message_requests_requester_id_fkey(*), organizer:profiles!message_requests_organizer_id_fkey(*), event:events!message_requests_event_id_fkey(slug,title)';
			const { data: existing, error: existingError } = await db
				.from('message_requests')
				.select(requestSelect)
				.eq('event_id', event.id)
				.eq('requester_id', requesterId)
				.in('status', ['pending', 'accepted'])
				.order('created_at', { ascending: false })
				.limit(1)
				.maybeSingle();
			if (existingError) throw existingError;
			if (existing) return toMessageRequest(existing);
			const { data, error } = await db
				.from('message_requests')
				.insert({ event_id: event.id, requester_id: requesterId, organizer_id: event.organizer_id, body: body.trim() })
				.select(requestSelect)
				.single();
			if (error) throw error;
			return toMessageRequest(data);
		},
		async getIncomingMessageRequests(organizerId) {
			if (!isUuid(organizerId)) return [];
			const { data, error } = await db
				.from('message_requests')
				.select('*, requester:profiles!message_requests_requester_id_fkey(*), organizer:profiles!message_requests_organizer_id_fkey(*), event:events!message_requests_event_id_fkey(slug,title)')
				.eq('organizer_id', organizerId)
				.eq('status', 'pending')
				.order('created_at', { ascending: false });
			if (error) throw error;
			return (data ?? []).map(toMessageRequest);
		},
		async getEventMessageRequest(requesterId, eventId) {
			if (!isUuid(requesterId) || !isUuid(eventId)) return undefined;
			const { data, error } = await db
				.from('message_requests')
				.select('*, requester:profiles!message_requests_requester_id_fkey(*), organizer:profiles!message_requests_organizer_id_fkey(*), event:events!message_requests_event_id_fkey(slug,title)')
				.eq('requester_id', requesterId)
				.eq('event_id', eventId)
				.order('created_at', { ascending: false })
				.limit(1)
				.maybeSingle();
			if (error) throw error;
			return data ? toMessageRequest(data) : undefined;
		},
		async respondToMessageRequest(organizerId, requestId, accept) {
			const { error: responseError } = await db.rpc('respond_to_message_request', {
				p_request_id: requestId,
				p_accept: accept
			});
			if (responseError) throw responseError;
			const { data, error } = await db
				.from('message_requests')
				.select('*, requester:profiles!message_requests_requester_id_fkey(*), organizer:profiles!message_requests_organizer_id_fkey(*), event:events!message_requests_event_id_fkey(slug,title)')
				.eq('id', requestId)
				.eq('organizer_id', organizerId)
				.single();
			if (error) throw error;
			return toMessageRequest(data);
		},
		async resolvePromoCode(eventSlug, codeInput) {
			const code = normalizePromoCode(codeInput);
			if (!code) return null;
			if (typeof db.rpc === 'function') {
				const { data, error } = await db.rpc('validate_event_promo', {
					p_event_slug: eventSlug,
					p_code: code
				});
				if (error) {
					if (isMissingFunctionError(error) || isMissingPromoStorageError(error)) {
						return globalPromoForCode(code);
					}
					throw error;
				}
				const row = data as Row | null;
				if (row?.valid === true || (row?.code && row?.value !== undefined)) {
					return {
						code: normalizePromoCode(String(row.code ?? code)),
						kind: row.kind === 'flat' ? 'flat' : 'pct',
						value: Number(row.value ?? 0),
						source: 'event'
					};
				}
				// An exhausted event code intentionally shadows any global code
				// with the same spelling for this event.
				if (row?.state === 'exhausted') return null;
			}
			return globalPromoForCode(code);
		},
		async createOrder(userId, eventSlug, items, promoCodeInput) {
			if (!isUuid(userId)) throw new Error('Sign in required to purchase tickets');
			const promoCode = normalizePromoCode(promoCodeInput);
			let { data, error } = await db.rpc('create_order', {
				p_owner: userId,
				p_event_slug: eventSlug,
				p_items: items,
				p_promo_code: promoCode || null
			});
			if (error && isMissingFunctionError(error)) {
				if (promoCode) throw promoStorageError();
				// Databases that have not received migration 020 still accept
				// ordinary orders through the original three-argument RPC.
				const retry = await db.rpc('create_order', {
					p_owner: userId,
					p_event_slug: eventSlug,
					p_items: items
				});
				data = retry.data;
				error = retry.error;
			}
			if (error) throw error;
			return {
				orderId: data.orderId,
				reference: data.reference,
				total: Number(data.total ?? 0),
				tickets: (data.tickets ?? []).map((t: Row) => (t.event_id ? toTicket(t) : (t as Ticket)))
			};
		},
		async sendMessage(conversationId, senderId, body) {
			const { data, error } = await db
				.from('messages')
				.insert({ conversation_id: conversationId, sender_id: senderId, body })
				.select()
				.single();
			if (error) throw error;
			return {
				id: data.id,
				conversationId,
				senderId,
				body,
				sentAt: data.sent_at
			};
		},
		async markConversationRead(conversationId, readerId) {
			if (!isUuid(conversationId) || !isUuid(readerId)) return;
			const { data: row, error } = await db
				.from('conversations')
				.select('*')
				.eq('id', conversationId)
				.maybeSingle();
			if (error || !row) return;
			// Only a participant may acknowledge, and only their own counter.
			if (row.user_id === readerId) {
				if ((row.unread ?? 0) === 0) return;
				await db
					.from('conversations')
					.update({ unread: 0 })
					.eq('id', conversationId)
					.eq('user_id', readerId);
				return;
			}
			if (row.peer_id !== readerId) return;
			// peer_unread arrives with 021; on an older database the peer never
			// reports a count, so there is nothing to clear.
			if ((row.peer_unread ?? 0) === 0) return;
			await db
				.from('conversations')
				.update({ peer_unread: 0 })
				.eq('id', conversationId)
				.eq('peer_id', readerId);
		},
		async markAllNotificationsRead(userId) {
			if (!isUuid(userId)) return;
			await db.from('notifications').update({ read: true }).eq('user_id', userId);
		},

		/* ── organizer side ── */
		async getOrganizer(userId) {
			if (!isUuid(userId))
				return { events: [], stats: computeOrganizer([], [], [], []).stats, checkins: [], orders: [] };
			const { data, error } = await db
				.from('events')
				.select('*, organizer:profiles(*)')
				.eq('organizer_id', userId);
			if (error) throw error;
			const evs = (data ?? []).map((r) => toEvent(r, toProfile(r.organizer)));
			const ids = evs.map((e) => e.id);
			if (ids.length === 0)
				return { events: [], stats: computeOrganizer([], [], [], []).stats, checkins: [], orders: [] };
			const [t, o, c, promosByEvent] = await Promise.all([
				db.from('tickets').select('*').in('event_id', ids),
				db.from('orders').select('*').in('event_id', ids),
				db.from('checkins').select('*').in('event_id', ids),
				fetchEventPromos(db, ids)
			]);
			for (const event of evs) event.promos = promosByEvent.get(event.id) ?? [];
			return computeOrganizer(
				evs,
				(t.data ?? []).map(toTicket),
				(o.data ?? []).map(toOrder),
				(c.data ?? []).map(toCheckin)
			);
		},
		async getOrganizerEvent(eventId) {
			if (!isUuid(eventId)) return undefined;
			const { data } = await db
				.from('events')
				.select('*, organizer:profiles(*)')
				.eq('id', eventId)
				.maybeSingle();
			if (!data) return undefined;
			const event = toEvent(data, toProfile(data.organizer));
			event.promos = (await fetchEventPromos(db, [eventId])).get(eventId) ?? [];
			return event;
		},
		async getEventTickets(eventId) {
			if (!isUuid(eventId)) return [];
			const { data, error } = await db.from('tickets').select('*').eq('event_id', eventId);
			if (error) throw error;
			return (data ?? []).map(toTicket);
		},
		async getEventOrders(eventId) {
			if (!isUuid(eventId)) return [];
			const { data, error } = await db.from('orders').select('*').eq('event_id', eventId);
			if (error) throw error;
			return (data ?? []).map(toOrder);
		},
		async getEventCheckins(eventId) {
			if (!isUuid(eventId)) return [];
			const { data, error } = await db
				.from('checkins')
				.select('*')
				.eq('event_id', eventId)
				.order('at', { ascending: false });
			if (error) throw error;
			return (data ?? []).map(toCheckin);
		},
		async checkInTicket(eventId, code, gate) {
			const { data: ticket } = await db
				.from('tickets')
				.select('*')
				.eq('event_id', eventId)
				.eq('code', code)
				.maybeSingle();
			const at = new Date().toISOString();
			const holder = ticket?.holder_name ?? 'Unknown pass';
			const tier = ticket?.tier_name ?? '—';
			const base = {
				eventId,
				ticketCode: code,
				gate,
				at,
				holder,
				tier
			};
			if (!ticket) {
				await db.from('checkins').insert({ event_id: eventId, ticket_code: code, gate, at, holder, tier, result: 'invalid' });
				return { id: `ck-${code}`, ...base, result: 'invalid' as const };
			}
			if (ticket.status === 'used') {
				await db.from('checkins').insert({ event_id: eventId, ticket_code: code, gate, at, holder, tier, result: 'duplicate' });
				return { id: `ck-${code}`, ...base, result: 'duplicate' as const };
			}
			await db.from('tickets').update({ status: 'used' }).eq('id', ticket.id);
			await db.from('checkins').insert({ event_id: eventId, ticket_code: code, gate, at, holder, tier, result: 'verified' });
			return { id: `ck-${code}`, ...base, result: 'verified' as const };
		},
		async createEvent(userId, payload) {
			const slug = payload.title
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/(^-|-$)/g, '') + '-' + crypto.randomUUID().slice(0, 8);
			const submission = {
				organizer_id: userId,
				slug,
				// Submissions wait in the admin review queue; only approval publishes.
				status: 'pending',
				submitted_at: new Date().toISOString(),
				title: payload.title,
				category: payload.category,
				tags: payload.tags,
				starts_at: payload.startsAt,
				ends_at: payload.endsAt ?? null,
				venue: payload.venue,
				city: payload.city,
				cover: payload.cover,
				description: payload.description,
				speakers: payload.speakers.map((speaker) => ({
					...speaker,
					inviteStatus: speaker.invited ? 'pending' : undefined
				})),
				agenda: payload.agenda.map((a, i) => ({ id: `ag-${i}`, ...a })),
				tiers: payload.tiers.map((t, i) => ({ id: `tier-${i}`, sold: 0, ...t })),
				gates: payload.gates,
				live: payload.live ?? true
			};
			let result = await db
				.from('events')
				.insert(submission)
				.select('*, organizer:profiles(*)')
				.single();
			if (result.error && isMissingEventStatusError(result.error)) {
				// Pre-022 database: no review columns, organizer submissions go live.
				const { status: _status, submitted_at: _submittedAt, ...legacySubmission } = submission;
				result = await db
					.from('events')
					.insert(legacySubmission)
					.select('*, organizer:profiles(*)')
					.single();
			}
			const { data, error } = result;
			if (error) throw error;
			const event = toEvent(data, toProfile(data.organizer));
			try {
				event.promos = await insertEventPromos(
					db,
					event.id,
					normalizeEventPromos(payload.promos)
				);
			} catch (promoError) {
				// Do not publish an event whose advertised promo codes were lost.
				await db.from('events').delete().eq('id', event.id).eq('organizer_id', userId);
				throw promoError;
			}
			return event;
		},
		async issueGateToken(userId, eventId, gateName) {
			if (!isUuid(userId) || !isUuid(eventId)) throw new Error('Invalid event or organizer ID');
			const { data: event, error: eventError } = await db.from('events').select('gates').eq('id', eventId).eq('organizer_id', userId).maybeSingle();
			if (eventError) throw eventError;
			if (!event || !(event.gates ?? []).some((gate: Row) => gate.name === gateName)) throw new Error('Gate not found for this event');
			const code = await newStaffScanCode(
				db,
				(context) => context.kind === 'gate' && context.eventId === eventId && context.gate === gateName
			);
			const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
			const { error } = await db.from('gate_staff_tokens').upsert({ event_id: eventId, gate_name: gateName, token_hash: gateTokenHash(code), expires_at: expiresAt, created_by: userId }, { onConflict: 'event_id,gate_name' });
			if (error) throw error;
			return { code, expiresAt };
		},
		async verifyGateToken(userId, eventId, gateName, code) {
			if (!isUuid(userId) || !isUuid(eventId)) return false;
			const { data: event, error: eventError } = await db.from('events').select('gates,organizer_id').eq('id', eventId).maybeSingle();
			if (eventError) throw eventError;
			if (!event || !(event.gates ?? []).some((gate: Row) => gate.name === gateName)) return false;
			if (event.organizer_id !== userId) {
				// Door staff present another organizer's PIN: their session cannot
				// read that token row under RLS, so resolve it through the
				// security-definer RPC from migration 019 instead.
				const resolution = await resolveStaffScanTokenHash(db, gateTokenHash(code));
				return resolution?.kind === 'gate' && resolution.eventId === eventId && resolution.gate === gateName;
			}
			const { data, error } = await db.from('gate_staff_tokens').select('token_hash,expires_at').eq('event_id', eventId).eq('gate_name', gateName).eq('token_hash', gateTokenHash(code)).gt('expires_at', new Date().toISOString()).maybeSingle();
			if (error) throw error;
			return Boolean(data);
		},
		async issueScannerToken(userId) {
			if (!isUuid(userId)) throw new Error('Invalid organizer ID');
			const code = await newStaffScanCode(
				db,
				(context) => context.kind === 'terminal' && context.organizerId === userId
			);
			const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
			const { error } = await db.from('organizer_scanner_tokens').upsert({ organizer_id: userId, token_hash: gateTokenHash(code), expires_at: expiresAt }, { onConflict: 'organizer_id' });
			if (error) throw error;
			return { code, expiresAt };
		},
		async verifyScannerToken(userId, code) {
			if (!isUuid(userId)) return false;
			const { data, error } = await db.from('organizer_scanner_tokens').select('token_hash,expires_at').eq('organizer_id', userId).eq('token_hash', gateTokenHash(code)).gt('expires_at', new Date().toISOString()).maybeSingle();
			if (error) throw error;
			return Boolean(data);
		},
		async resolveStaffScanToken(code) {
			return resolveStaffScanTokenHash(db, gateTokenHash(code));
		},
		async checkInWithStaffToken({ context, staffToken, ticketCode, simulate = false }) {
			// The scanner user may not own this event, so ordinary table access
			// is closed to them by RLS. The 019 RPCs re-verify the PIN hash and
			// perform the check-in atomically as security definers.
			if (context.kind === 'gate') {
				if (!isUuid(context.eventId)) throw new Error('Invalid scan request');
				const { data, error } = await db.rpc('staff_check_in_ticket', {
					p_event_id: context.eventId,
					p_gate: context.gate,
					p_ticket_code: ticketCode ?? null,
					p_token_hash: gateTokenHash(staffToken),
					p_simulate: simulate
				});
				if (error) throw error;
				return toCheckin(data as Row);
			}
			if (!isUuid(context.organizerId)) throw new Error('Invalid scan request');
			const { data, error } = await db.rpc('staff_check_in_terminal', {
				p_organizer_id: context.organizerId,
				p_ticket_code: ticketCode ?? null,
				p_token_hash: gateTokenHash(staffToken),
				p_simulate: simulate
			});
			if (error) throw error;
			const row = data as Row;
			return toCheckin({ ...row, event_id: row.event_id ?? '' });
		},
		async recordEventView(slug) {
			try {
				await db.rpc('record_event_view', { p_slug: slug });
			} catch {
				// Ignore view counter errors if migration isn't applied yet
			}
		},
		async updateEvent(userId, eventId, updates) {
			if (!isUuid(userId) || !isUuid(eventId)) throw new Error('Invalid event or organizer ID');
			const patch: Record<string, unknown> = {};
			if (updates.title) patch.title = updates.title;
			if (updates.venue) patch.venue = updates.venue;
			if (updates.city) patch.city = updates.city;
			if (updates.startsAt) patch.starts_at = updates.startsAt;
			if (updates.description !== undefined) patch.description = updates.description;
			if (updates.category !== undefined) patch.category = updates.category;
			if (updates.tags !== undefined) patch.tags = updates.tags;
			if (updates.endsAt !== undefined) patch.ends_at = updates.endsAt;
			if (updates.cover !== undefined) patch.cover = updates.cover;
			if (updates.speakers !== undefined) patch.speakers = updates.speakers.map((speaker) => ({ ...speaker, inviteStatus: speaker.invited ? (speaker.inviteStatus ?? 'pending') : undefined }));
			if (updates.agenda !== undefined) patch.agenda = updates.agenda.map((item, index) => ({ id: `ag-${index}`, ...item }));
			if (updates.tiers !== undefined) {
				const { data: current } = await db.from('events').select('tiers').eq('id', eventId).eq('organizer_id', userId).maybeSingle();
				patch.tiers = updates.tiers.map((tier, index) => ({ id: current?.tiers?.[index]?.id ?? `tier-${index}`, sold: current?.tiers?.[index]?.sold ?? 0, ...tier, capacity: Math.max(tier.capacity, current?.tiers?.[index]?.sold ?? 0) }));
			}
			if (updates.gates !== undefined) patch.gates = updates.gates;
			if (updates.live !== undefined) patch.live = updates.live;
			// A rejected listing re-enters the review queue as soon as it is edited.
			// Published and pending events keep their current review state.
			const { data: currentReview } = await db
				.from('events')
				.select('status')
				.eq('id', eventId)
				.eq('organizer_id', userId)
				.maybeSingle();
			if (currentReview?.status === 'rejected') {
				patch.status = 'pending';
				patch.submitted_at = new Date().toISOString();
				patch.moderation_note = null;
			}
			const { data, error } = await db
				.from('events')
				.update(patch)
				.eq('id', eventId)
				.eq('organizer_id', userId)
				.select('*, organizer:profiles(*)')
				.single();
			if (error) throw error;
			const event = toEvent(data, toProfile(data.organizer));
			event.promos =
				updates.promos !== undefined
					? await replaceEventPromos(db, eventId, normalizeEventPromos(updates.promos))
					: ((await fetchEventPromos(db, [eventId])).get(eventId) ?? []);
			return event;
		},
		async deleteEvent(userId, eventId) {
			if (!isUuid(userId) || !isUuid(eventId)) throw new Error('Invalid event or organizer ID');
			const { error } = await db.from('events').delete().eq('id', eventId).eq('organizer_id', userId);
			if (error) throw error;
		},
		async broadcastEvent(userId, eventId, message) {
			if (!isUuid(userId) || !isUuid(eventId)) throw new Error('Invalid event ID');
			const body = message.trim();
			if (!body) throw new Error('Enter a message to broadcast');

			const { data: event, error: eventError } = await db
				.from('events')
				.select('id, title, slug')
				.eq('id', eventId)
				.eq('organizer_id', userId)
				.maybeSingle();
			if (eventError) throw eventError;
			if (!event) throw new Error('Event not found');

			const rpcResult = await db.rpc('broadcast_to_event_holders', {
				p_event_id: eventId,
				p_body: body
			});
			if (!rpcResult.error) return Number(rpcResult.data?.sent ?? 0);
			// Deployments without the broadcast RPC still get the announcement.
			if (!isMissingFunctionError(rpcResult.error)) throw rpcResult.error;

			const { data: tickets, error: ticketsError } = await db
				.from('tickets')
				.select('owner_id')
				.eq('event_id', eventId)
				.in('status', ['valid', 'used']);
			if (ticketsError) throw ticketsError;
			const owners = [...new Set((tickets ?? []).map((row: Row) => row.owner_id).filter(Boolean))];
			if (owners.length === 0) return 0;

			const { error: insertError } = await db.from('notifications').insert(
				owners.map((ownerId) => ({
					user_id: ownerId,
					kind: 'event',
					title: `Announcement · ${event.title}`,
					body,
					href: `/events/${event.slug}`
				}))
			);
			if (insertError) throw insertError;
			return owners.length;
		},
		async transferTicket(userId, ticketId, recipientHandle) {
			if (!isUuid(userId) || !isUuid(ticketId)) throw new Error('Invalid ticket or user ID');
			const raw = recipientHandle.trim();
			if (/[,;]/.test(raw) || (raw.match(/@/g)?.length ?? 0) > 1) {
				throw new Error('Ticket transfer is 1-to-1. Select a single recipient.');
			}
			const cleaned = raw.replace(/^@+/, '').trim().toLowerCase();
			if (!cleaned) throw new Error('Enter a valid recipient @handle');

			if (typeof db.rpc === 'function') {
				const rpcResult = await db.rpc('transfer_ticket', {
					p_ticket_id: ticketId,
					p_recipient_handle: cleaned
				});
				if (!rpcResult.error && rpcResult.data) {
					return toTicket({ ...rpcResult.data, status: 'transferred' });
				}
				// If the RPC raised a domain validation error (not "function does not exist"), surface it
				if (
					rpcResult.error &&
					!/function .*transfer_ticket.* does not exist|Could not find the function/i.test(
						rpcResult.error.message ?? ''
					)
				) {
					throw new Error(rpcResult.error.message);
				}
			}

			let { data: recipient, error: recipientError } = await db
				.from('profiles')
				.select('*')
				.ilike('handle', cleaned)
				.maybeSingle();
			if (recipientError) throw recipientError;
			if (!recipient) {
				const byName = await db
					.from('profiles')
					.select('*')
					.ilike('name', cleaned)
					.maybeSingle();
				if (byName.error) throw byName.error;
				recipient = byName.data;
			}
			if (!recipient) throw new Error(`No member found with handle @${cleaned}`);
			if (recipient.id === userId) throw new Error('You cannot transfer a ticket to yourself');

			const { data: existing, error: fetchError } = await db
				.from('tickets')
				.select('*')
				.eq('id', ticketId)
				.eq('owner_id', userId)
				.maybeSingle();
			if (fetchError) throw fetchError;
			if (!existing) throw new Error('Ticket not found');
			if (existing.status !== 'valid') throw new Error('Only active tickets can be transferred');

			const rotatedCode = newTicketCode();
			const { error: updateError } = await db
				.from('tickets')
				.update({
					owner_id: recipient.id,
					holder_name: recipient.name,
					code: rotatedCode,
					status: 'valid'
				})
				.eq('id', ticketId)
				.eq('owner_id', userId)
				.eq('status', 'valid');
			if (updateError) throw updateError;

			const notificationRows = [
				{
					user_id: recipient.id,
					kind: 'ticket',
					title: `Pass Transferred · ${existing.event_title}`,
					body: `A ${existing.tier_name} pass for ${existing.event_title} has been transferred to your wallet.`,
					href: `/tickets/${existing.id}`
				},
				{
					user_id: userId,
					kind: 'ticket',
					title: `Pass Transferred · ${existing.event_title}`,
					body: `Your ${existing.tier_name} pass for ${existing.event_title} was transferred to @${recipient.handle}.`,
					href: '/tickets'
				}
			];
			const { error: notifError } = await db.from('notifications').insert(notificationRows);
			if (notifError) {
				await db.from('notifications').insert(
					notificationRows.map(({ href: _href, ...rest }) => rest)
				);
			}

			return toTicket({
				...existing,
				owner_id: recipient.id,
				holder_name: recipient.name,
				code: rotatedCode,
				status: 'transferred'
			});
		},
		async listApprovals(userId) {
			if (!isUuid(userId)) return [];
			const { data, error } = await db
				.from('approval_requests')
				.select('*')
				.eq('requester_id', userId)
				.order('created_at', { ascending: false })
				.limit(100);
			if (error) {
				if (isMissingApprovalStorageError(error)) return [];
				throw error;
			}
			return ((data ?? []) as Row[]).map(toApproval);
		},
		async createApproval(userId, input) {
			if (!isUuid(userId)) throw new Error('Sign in to submit a request for approval.');
			const { data, error } = await db
				.from('approval_requests')
				.insert({
					requester_id: userId,
					kind: input.kind,
					title: input.title,
					summary: input.summary,
					amount: input.amount ?? null,
					subject_id: input.subjectId ?? null,
					subject_label: input.subjectLabel ?? null,
					payload: input.payload ?? {}
				})
				.select('*')
				.single();
			if (error) {
				if (isMissingApprovalStorageError(error)) throw approvalStorageError();
				if (isDuplicateApprovalError(error)) {
					throw new Error('This request is already awaiting approval. We will let you know once it is reviewed.');
				}
				throw error;
			}
			await db.from('notifications').insert({
				user_id: userId,
				kind: 'system',
				title: `Pending approval · ${input.title}`,
				body: `${input.summary} — submitted to the Owltside review team.`,
				href: '/settings'
			});
			return toApproval(data);
		},
		async requestTicketRefund(userId, ticketId, request) {
			if (!isUuid(userId) || !isUuid(ticketId)) throw new Error('Invalid ticket or user ID');
			const { data: ticket, error: ticketError } = await db
				.from('tickets')
				.select('id,code,event_title,tier_name,price,status')
				.eq('id', ticketId)
				.eq('owner_id', userId)
				.maybeSingle();
			if (ticketError) throw ticketError;
			if (!ticket) throw new Error('Ticket not found');
			// A gate-verified (`used`) pass can no longer be refunded. The pass is
			// not touched here: it stays valid until an admin approves the refund.
			if (ticket.status !== 'valid') throw new Error('Only active tickets can be refunded');
			return this.createApproval(userId, {
				kind: 'refund',
				title: `Refund · ${ticket.event_title}`,
				summary: `${ticket.tier_name} pass · reason: ${request?.reason ?? 'Not specified'}`,
				amount: Number(ticket.price ?? 0),
				subjectId: ticket.id,
				subjectLabel: ticket.code,
				payload: { reason: request?.reason ?? '', details: request?.details ?? '', code: ticket.code }
			});
		}
	};
}

const toOrder = (r: Row): Order => ({
	id: r.id,
	reference: r.reference,
	eventId: r.event_id,
	buyer: r.owner_name ?? 'Attendee',
	itemsLabel: r.items_label ?? '',
	total: Number(r.total ?? 0),
	status: r.status,
	at: r.created_at
});

const toCheckin = (r: Row): Checkin => ({
	id: r.id,
	eventId: r.event_id,
	ticketCode: r.ticket_code,
	holder: r.holder,
	tier: r.tier,
	gate: r.gate,
	at: r.at,
	result: r.result
});

export function getSource(db?: SupabaseClient | null): DataSource {
	return db ? supabaseSource(db) : demoSource;
}
