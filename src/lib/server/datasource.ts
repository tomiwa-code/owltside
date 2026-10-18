import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Checkin,
	CheckoutItem,
	Conversation,
	EventFilters,
	EventItem,
	EventSpeaker,
	Message,
	MessageRequest,
	NotificationItem,
	Order,
	OrganizerPayload,
	Profile,
	SpeakerInviteStatus,
	Ticket,
	WizardPayload
} from '$lib/types';
import * as demo from './demo/seed';
import { newTicketCode } from '$lib/utils/qr';

const demoMeId = 'u-ada';

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
};

const demoPrivateConversations: DemoPrivateConversation[] = [];
const demoPrivateNotifications = new Map<string, NotificationItem[]>();

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
	getProfileEvents(profileId: string): Promise<EventItem[]>;
	respondToSpeakerInvite(inviteeId: string, eventSlug: string, accept: boolean): Promise<SpeakerInviteStatus>;
	createMessageRequest(requesterId: string, eventSlug: string, body: string): Promise<MessageRequest>;
	getIncomingMessageRequests(organizerId: string): Promise<MessageRequest[]>;
	getEventMessageRequest(requesterId: string, eventId: string): Promise<MessageRequest | undefined>;
	respondToMessageRequest(organizerId: string, requestId: string, accept: boolean): Promise<MessageRequest>;
	createOrder(userId: string, eventSlug: string, items: CheckoutItem[]): Promise<OrderResult>;
	sendMessage(conversationId: string, senderId: string, body: string): Promise<Message>;
	markConversationRead(conversationId: string): Promise<void>;
	markAllNotificationsRead(userId: string): Promise<void>;
	/* organizer side */
	getOrganizer(userId: string): Promise<OrganizerPayload>;
	getOrganizerEvent(eventId: string): Promise<EventItem | undefined>;
	getEventTickets(eventId: string): Promise<Ticket[]>;
	getEventOrders(eventId: string): Promise<Order[]>;
	getEventCheckins(eventId: string): Promise<Checkin[]>;
	checkInTicket(eventId: string, code: string, gate: string): Promise<Checkin>;
	createEvent(userId: string, payload: WizardPayload): Promise<EventItem>;
	recordEventView(slug: string): Promise<void>;
	updateEvent(
		userId: string,
		eventId: string,
		updates: { title?: string; venue?: string; city?: string; startsAt?: string; description?: string }
	): Promise<EventItem>;
	deleteEvent(userId: string, eventId: string): Promise<void>;
	broadcastEvent(userId: string, eventId: string, message: string): Promise<number>;
	transferTicket(userId: string, ticketId: string, recipientHandle: string): Promise<Ticket>;
	refundTicket(userId: string, ticketId: string, request?: { reason: string; details?: string }): Promise<Ticket>;
}

/* ────────────────────────────── demo mode ────────────────────────────── */

function matches(e: EventItem, f: EventFilters): boolean {
	if (f.category && f.category !== 'all' && e.category !== f.category) return false;
	if (f.freeOnly && e.tiers.some((t) => t.price > 0) === true && !e.tiers.some((t) => t.price === 0))
		return false;
	if (f.query) {
		const q = f.query.toLowerCase();
		const hay = `${e.title} ${e.venue} ${e.city} ${e.tags.join(' ')}`.toLowerCase();
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

export const demoSource: DataSource = {
	mode: 'demo',
	async listEvents(filters = {}) {
		return sortEvents(demo.events.filter((e) => matches(e, filters)), filters.sort);
	},
	async getEvent(slug) {
		return demo.events.find((e) => e.slug === slug);
	},
	async getTickets() {
		return [...demo.tickets];
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
				unread: c.requesterId === uid ? c.requesterUnread : c.organizerUnread
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
		return Object.values(demo.people).find((p) => p.handle === handle);
	},
	async searchProfiles(handlePrefix) {
		const prefix = handlePrefix.replace(/^@/, '').toLowerCase();
		if (!prefix) return [];
		return Object.values(demo.people)
			.filter((profile) => profile.handle.toLowerCase().startsWith(prefix))
			.slice(0, 8);
	},
	async getProfileEvents(profileId) {
		return demo.events.filter(
			(event) => event.organizer?.id === profileId || event.speakers?.some((speaker) =>
				speaker?.id === profileId &&
				!speaker.displayOnly &&
				(speaker.invited ? speaker.inviteStatus === 'accepted' : speaker.inviteStatus !== 'declined')
			)
		);
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
					organizerUnread: 0
				};
				demoPrivateConversations.push(dynamic);
				demo.messages[dynamic.id] = [];
			}
			conversationId = dynamic.id;
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
	async createOrder(userId, eventSlug, items) {
		const event = demo.events.find((e) => e.slug === eventSlug);
		if (!event) throw new Error('Event not found');
		const holder = 'Ada Obi';
		const created: Ticket[] = [];
		let total = 0;
		for (const item of items) {
			const tier = event.tiers.find((t) => t.id === item.tierId);
			if (!tier) throw new Error('Tier not found');
			if (tier.capacity - tier.sold < item.qty) throw new Error(`Only ${tier.capacity - tier.sold} ${tier.name} passes left`);
			tier.sold += item.qty;
			total += tier.price * item.qty;
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
	async markConversationRead(conversationId) {
		const conv = demo.conversations.find((c) => c.id === conversationId);
		if (conv) conv.unread = 0;
		const dynamic = demoPrivateConversations.find((c) => c.id === conversationId);
		if (dynamic) {
			dynamic.requesterUnread = 0;
			dynamic.organizerUnread = 0;
		}
	},
	async markAllNotificationsRead() {
		demo.notifications.forEach((n) => (n.read = true));
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
			faqs: [],
			policies: [],
			gates: payload.gates,
			viewsToday: 0,
			attendees: 0
		};
		demo.events.push(event);
		for (const speaker of event.speakers) {
			if (!speaker.invited || speaker.displayOnly || !speaker.id || speaker.id === organizer.id) continue;
			const inviteeNotifications = demoPrivateNotifications.get(speaker.id) ?? [];
			inviteeNotifications.unshift({
				id: `n-${Math.random().toString(36).slice(2, 10)}`,
				kind: 'event',
				title: `Speaker invitation · ${event.title}`,
				body: `${organizer.name} invited you as ${speaker.role ?? 'a speaker'} for this event.`,
				href: `/events/${event.slug}`,
				at: new Date().toISOString(),
				read: false
			});
			demoPrivateNotifications.set(speaker.id, inviteeNotifications);
		}
		return event;
	},
	async recordEventView(slug) {
		const event = demo.events.find((e) => e.slug === slug);
		if (event) event.viewsToday += 1;
	},
	async updateEvent(userId, eventId, updates) {
		const uid = userId === 'demo' ? demoMeId : userId;
		const event = demo.events.find((e) => e.id === eventId && e.organizer.id === uid);
		if (!event) throw new Error('Event not found');
		if (updates.title) event.title = updates.title;
		if (updates.venue) event.venue = updates.venue;
		if (updates.city) event.city = updates.city;
		if (updates.startsAt) event.startsAt = updates.startsAt;
		if (updates.description !== undefined) event.description = updates.description;
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
		demo.notifications.unshift({
			id: `n-${Math.random().toString(36).slice(2, 10)}`,
			kind: 'event',
			title: `Announcement · ${event.title}`,
			body: message.trim(),
			href: `/events/${event.slug}`,
			at: new Date().toISOString(),
			read: false
		});
		return 1;
	},
	async transferTicket(_userId, ticketId, recipientHandle) {
		const cleaned = recipientHandle.trim().replace(/^@/, '').toLowerCase();
		if (!cleaned) throw new Error('Enter a valid recipient @handle');
		const ticket = demo.tickets.find((t) => t.id === ticketId);
		if (!ticket) throw new Error('Ticket not found');
		if (ticket.status !== 'valid') throw new Error('Only active tickets can be transferred');
		const recipient = Object.values(demo.people).find((p) => p.handle.toLowerCase() === cleaned);
		ticket.holder = recipient?.name ?? `@${cleaned}`;
		ticket.code = newTicketCode();
		ticket.status = 'transferred';
		return ticket;
	},
	async refundTicket(userId, ticketId, request) {
		const ticket = demo.tickets.find((t) => t.id === ticketId);
		if (!ticket) throw new Error('Ticket not found');
		if (ticket.status !== 'valid') throw new Error('Only active tickets can be refunded');
		ticket.status = 'refunded';
		const uid = userId === 'demo' ? demoMeId : userId;
		const notifications = demoPrivateNotifications.get(uid) ?? [];
		notifications.unshift({
			id: `n-${Math.random().toString(36).slice(2, 10)}`,
			kind: 'ticket',
			title: `Refund Requested · ${ticket.eventTitle}`,
			body: `Your ${ticket.tierName} pass refund was submitted. Reason: ${request?.reason ?? 'Not specified'}.${request?.details ? ` Details: ${request.details}` : ''}`,
			href: `/tickets/${ticket.id}`,
			at: new Date().toISOString(),
			read: false
		});
		demoPrivateNotifications.set(uid, notifications);
		return ticket;
	}
};

function allDemoTickets(): Ticket[] {
	return [...demo.tickets, ...demo.rooftopTickets];
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
	cover: r.cover,
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
			let q = db.from('events').select('*, organizer:profiles(*)').order('starts_at');
			if (filters.category && filters.category !== 'all') q = q.eq('category', filters.category);
			if (filters.query) q = q.ilike('title', `%${filters.query}%`);
			if (filters.dateFrom) q = q.gte('starts_at', filters.dateFrom);
			const { data, error } = await q;
			if (error) throw error;
			return sortEvents((data ?? []).map((r) => toEvent(r, toProfile(r.organizer))), filters.sort);
		},
		async getEvent(slug) {
			const { data, error } = await db
				.from('events')
				.select('*, organizer:profiles(*)')
				.eq('slug', slug)
				.maybeSingle();
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
			return (data ?? []).map((r: Row) => ({
				id: r.id,
				peer: toProfile(r.user_id === userId ? r.peer : r.user),
				lastMessage: r.last_message ?? '',
				lastAt: r.last_at,
				unread: r.unread ?? 0
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
			const prefix = handlePrefix.replace(/^@/, '').toLowerCase();
			if (!prefix) return [];
			const { data, error } = await db.from('profiles').select('*').ilike('handle', `${prefix}%`).order('handle').limit(8);
			if (error) throw error;
			return (data ?? []).map(toProfile);
		},
		async getProfileEvents(profileId) {
			if (!isUuid(profileId)) return [];
			const { data, error } = await db
				.from('events')
				.select('*, organizer:profiles(*)')
				.order('starts_at');
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
		async createOrder(userId, eventSlug, items) {
			if (!isUuid(userId)) throw new Error('Sign in required to purchase tickets');
			const { data, error } = await db.rpc('create_order', {
				p_owner: userId,
				p_event_slug: eventSlug,
				p_items: items
			});
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
		async markConversationRead(conversationId) {
			if (!isUuid(conversationId)) return;
			await db.from('conversations').update({ unread: 0 }).eq('id', conversationId);
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
			const [t, o, c] = await Promise.all([
				db.from('tickets').select('*').in('event_id', ids),
				db.from('orders').select('*').in('event_id', ids),
				db.from('checkins').select('*').in('event_id', ids)
			]);
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
			return data ? toEvent(data, toProfile(data.organizer)) : undefined;
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
				.replace(/(^-|-$)/g, '');
			const { data, error } = await db
				.from('events')
				.insert({
					organizer_id: userId,
					slug,
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
					gates: payload.gates
				})
				.select('*, organizer:profiles(*)')
				.single();
			if (error) throw error;
			return toEvent(data, toProfile(data.organizer));
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
			const { data, error } = await db
				.from('events')
				.update(patch)
				.eq('id', eventId)
				.eq('organizer_id', userId)
				.select('*, organizer:profiles(*)')
				.single();
			if (error) throw error;
			return toEvent(data, toProfile(data.organizer));
		},
		async deleteEvent(userId, eventId) {
			if (!isUuid(userId) || !isUuid(eventId)) throw new Error('Invalid event or organizer ID');
			const { error } = await db.from('events').delete().eq('id', eventId).eq('organizer_id', userId);
			if (error) throw error;
		},
		async broadcastEvent(_userId, eventId, message) {
			if (!isUuid(eventId)) throw new Error('Invalid event ID');
			const { data, error } = await db.rpc('broadcast_to_event_holders', {
				p_event_id: eventId,
				p_body: message.trim()
			});
			if (error) throw error;
			return Number(data?.sent ?? 0);
		},
		async transferTicket(userId, ticketId, recipientHandle) {
			if (!isUuid(userId) || !isUuid(ticketId)) throw new Error('Invalid ticket or user ID');
			const cleaned = recipientHandle.trim().replace(/^@/, '').toLowerCase();
			if (!cleaned) throw new Error('Enter a valid recipient @handle');
			const { data: recipient } = await db
				.from('profiles')
				.select('*')
				.ilike('handle', cleaned)
				.maybeSingle();
			if (!recipient) throw new Error(`No member found with handle @${cleaned}`);
			if (recipient.id === userId) throw new Error('You already own this ticket');
			const rotatedCode = newTicketCode();
			const { data, error } = await db
				.from('tickets')
				.update({
					owner_id: recipient.id,
					holder_name: recipient.name,
					code: rotatedCode
				})
				.eq('id', ticketId)
				.eq('owner_id', userId)
				.select('*')
				.single();
			if (error) throw error;
			await db.from('notifications').insert({
				user_id: recipient.id,
				kind: 'ticket',
				title: `Pass Transferred · ${data.event_title}`,
				body: `A ${data.tier_name} pass for ${data.event_title} has been transferred to your wallet.`,
				action_url: `/tickets/${data.id}`
			});
			return toTicket(data);
		},
		async refundTicket(userId, ticketId, request) {
			if (!isUuid(userId) || !isUuid(ticketId)) throw new Error('Invalid ticket or user ID');
			const { data, error } = await db
				.from('tickets')
				.update({ status: 'refunded' })
				.eq('id', ticketId)
				.eq('owner_id', userId)
				.select('*')
				.single();
			if (error) throw error;
			await db.from('notifications').insert({
				user_id: userId,
				kind: 'ticket',
				title: `Refund Requested · ${data.event_title}`,
				body: `Your ${data.tier_name} pass refund was submitted. Reason: ${request?.reason ?? 'Not specified'}.${request?.details ? ` Details: ${request.details}` : ''}`,
				action_url: `/tickets/${data.id}`
			});
			return toTicket(data);
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
