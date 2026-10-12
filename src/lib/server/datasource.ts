import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Checkin,
	CheckoutItem,
	Conversation,
	EventFilters,
	EventItem,
	Message,
	NotificationItem,
	Order,
	OrganizerPayload,
	Profile,
	Ticket,
	WizardPayload
} from '$lib/types';
import * as demo from './demo/seed';
import { newTicketCode } from '$lib/utils/qr';

const demoMeId = 'u-ada';

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
	getProfileEvents(profileId: string): Promise<EventItem[]>;
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
	async getConversations() {
		return [...demo.conversations];
	},
	async getMessages(conversationId) {
		return [...(demo.messages[conversationId] ?? [])];
	},
	async getNotifications() {
		return [...demo.notifications];
	},
	async getProfile(handle) {
		return Object.values(demo.people).find((p) => p.handle === handle);
	},
	async getProfileEvents(profileId) {
		return demo.events.filter(
			(e) => e.organizer?.id === profileId || e.speakers?.some((s) => s?.id === profileId)
		);
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
		};
		push(msg);

		// Demo "realtime": the peer types back after a human-ish delay.
		if (senderId === demoMeId) {
			const conv = demo.conversations.find((c) => c.id === conversationId);
			const peerId = conv?.peer.id ?? 'u-support';
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
			venue: payload.venue,
			city: payload.city,
			cover: payload.cover,
			description: payload.description,
			organizer,
			speakers: payload.speakers.map((id) => demo.people[id]).filter(Boolean),
			agenda: payload.agenda.map((a, i) => ({ id: `ag-${i}`, ...a })),
			tiers: payload.tiers.map((t, i) => ({ id: `tier-${i}`, sold: 0, ...t })),
			faqs: [],
			policies: [],
			gates: payload.gates,
			viewsToday: 0,
			attendees: 0
		};
		demo.events.push(event);
		return event;
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

const toProfile = (r: Row): Profile => ({
	id: r.id,
	handle: r.handle,
	name: r.name,
	avatarColor: r.avatar_color ?? '#8083ff',
	avatarUrl: r.avatar_url,
	bio: r.bio,
	link: r.link,
	city: r.city,
	verified: !!r.verified,
	followers: r.followers ?? 0,
	following: r.following ?? 0
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
	speakers: r.speakers ?? [],
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
			const { data, error } = await db.from('tickets').select('*').eq('owner_id', userId);
			if (error) throw error;
			return (data ?? []).map(toTicket);
		},
		async getConversations(userId) {
			const { data, error } = await db
				.from('conversations')
				.select('*, peer:profiles!conversations_peer_id_fkey(*)')
				.or(`user_id.eq.${userId},peer_id.eq.${userId}`);
			if (error) throw error;
			return (data ?? []).map((r: Row) => ({
				id: r.id,
				peer: toProfile(r.peer_id === userId ? r.user : r.peer),
				lastMessage: r.last_message ?? '',
				lastAt: r.last_at,
				unread: r.unread ?? 0
			}));
		},
		async getMessages(conversationId) {
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
				at: r.at,
				read: !!r.read
			}));
		},
		async getProfile(handle) {
			const { data, error } = await db.from('profiles').select('*').eq('handle', handle).maybeSingle();
			if (error) throw error;
			return data ? toProfile(data) : undefined;
		},
		async getProfileEvents(profileId) {
			const { data, error } = await db
				.from('events')
				.select('*, organizer:profiles(*)')
				.eq('organizer_id', profileId)
				.order('starts_at');
			if (error) throw error;
			return (data ?? []).map((r) => toEvent(r, toProfile(r.organizer)));
		},
		async createOrder(userId, eventSlug, items) {
			const { data, error } = await db.rpc('create_order', {
				p_owner: userId,
				p_event_slug: eventSlug,
				p_items: items
			});
			if (error) throw error;
			return data as OrderResult;
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
			await db.from('conversations').update({ unread: 0 }).eq('id', conversationId);
		},
		async markAllNotificationsRead(userId) {
			await db.from('notifications').update({ read: true }).eq('user_id', userId);
		},

		/* ── organizer side ── */
		async getOrganizer(userId) {
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
			const { data } = await db
				.from('events')
				.select('*, organizer:profiles(*)')
				.eq('id', eventId)
				.maybeSingle();
			return data ? toEvent(data, toProfile(data.organizer)) : undefined;
		},
		async getEventTickets(eventId) {
			const { data, error } = await db.from('tickets').select('*').eq('event_id', eventId);
			if (error) throw error;
			return (data ?? []).map(toTicket);
		},
		async getEventOrders(eventId) {
			const { data, error } = await db.from('orders').select('*').eq('event_id', eventId);
			if (error) throw error;
			return (data ?? []).map(toOrder);
		},
		async getEventCheckins(eventId) {
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
			const base = {
				eventId,
				ticketCode: code,
				gate,
				at,
				holder: ticket?.holder_name ?? 'Unknown pass',
				tier: ticket?.tier_name ?? '—'
			};
			if (!ticket) {
				const ck = { ...base, result: 'invalid' as const };
				await db.from('checkins').insert(ck);
				return { id: `ck-${code}`, ...ck };
			}
			if (ticket.status === 'used') {
				const ck = { ...base, result: 'duplicate' as const };
				await db.from('checkins').insert(ck);
				return { id: `ck-${code}`, ...ck };
			}
			await db.from('tickets').update({ status: 'used' }).eq('id', ticket.id);
			const ck = { ...base, result: 'verified' as const };
			await db.from('checkins').insert(ck);
			return { id: `ck-${code}`, ...ck };
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
					venue: payload.venue,
					city: payload.city,
					cover: payload.cover,
					description: payload.description,
					speakers: payload.speakers,
					agenda: payload.agenda.map((a, i) => ({ id: `ag-${i}`, ...a })),
					tiers: payload.tiers.map((t, i) => ({ id: `tier-${i}`, sold: 0, ...t })),
					gates: payload.gates
				})
				.select('*, organizer:profiles(*)')
				.single();
			if (error) throw error;
			return toEvent(data, toProfile(data.organizer));
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
