import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AdminDashboard, AdminEvent, EventTier } from '$admin/types';
import type { EventQuery, Page } from './store';

export type AdminDataSource = 'supabase' | 'demo';

function createAdminClient(): SupabaseClient | null {
	const url = (process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
	// The public app's RLS policies are organizer/attendee scoped. Admin reads
	// must use a server-only key; never fall back to an anon key here.
	const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
	if (!url || !key) return null;
	return createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
}

export function adminDataSource(): AdminDataSource {
	return createAdminClient() ? 'supabase' : 'demo';
}

function assertNoError(error: { message: string } | null, resource: string): void {
	if (error) throw new Error(`Supabase admin ${resource} query failed: ${error.message}`);
}

async function rowsFrom(
	client: SupabaseClient,
	table: 'events' | 'profiles' | 'orders' | 'tickets',
	columns: string,
	configure?: (query: any) => any
): Promise<Record<string, any>[]> {
	const rows: Record<string, any>[] = [];
	const pageSize = 1000;
	for (let offset = 0; ; offset += pageSize) {
		let query = client.from(table).select(columns);
		if (configure) query = configure(query);
		const { data, error } = await query.range(offset, offset + pageSize - 1);
		assertNoError(error, table);
		const page = (data ?? []) as Record<string, any>[];
		rows.push(...page);
		if (page.length < pageSize) break;
	}
	return rows;
}

function numberValue(value: unknown): number {
	const number = typeof value === 'number' ? value : Number(value ?? 0);
	return Number.isFinite(number) ? number : 0;
}

function parseTiers(value: unknown): EventTier[] {
	if (!Array.isArray(value)) return [];
	return value.map((tier: Record<string, unknown>) => ({
		name: String(tier.name ?? 'General Access'),
		priceNgn: numberValue(tier.priceNgn ?? tier.price),
		capacity: numberValue(tier.capacity),
		sold: numberValue(tier.sold ?? tier.attendees)
	}));
}

export function mapSupabaseEvent(row: Record<string, any>, organizerName = 'Organizer'): AdminEvent {
	const tiers = parseTiers(row.tiers);
	const startsAt = String(row.starts_at ?? new Date(0).toISOString());
	const capacity = tiers.reduce((sum, tier) => sum + tier.capacity, 0);
	const tierSold = tiers.reduce((sum, tier) => sum + tier.sold, 0);
	const sold = tierSold || numberValue(row.attendees);
	const grossNgn = tiers.reduce((sum, tier) => sum + tier.sold * tier.priceNgn, 0);
	const cover = row.cover && typeof row.cover === 'object' ? row.cover as Record<string, unknown> : {};
	const endsAt = String(row.ends_at ?? startsAt);
	const now = Date.now();
	const status = new Date(endsAt).getTime() < now ? 'completed' : 'published';
	return {
		id: String(row.id),
		ref: `EVT-${String(row.id).slice(0, 8).toUpperCase()}`,
		slug: String(row.slug ?? row.id),
		title: String(row.title ?? 'Untitled event'),
		category: String(row.category ?? 'Uncategorised'),
		organizerId: String(row.organizer_id ?? ''),
		organizerName,
		organizerTier: 1,
		status,
		startsAt,
		endsAt,
		venue: String(row.venue ?? ''),
		city: String(row.city ?? ''),
		capacity,
		sold,
		grossNgn,
		tiers,
		coverFrom: String(cover.from ?? '#1b2a4a'),
		coverTo: String(cover.to ?? '#43318a'),
		coverIcon: String(cover.icon ?? 'calendar-days')
	};
}

async function loadEvents(client: SupabaseClient): Promise<AdminEvent[]> {
	const records = await rowsFrom(
		client,
		'events',
		'id,slug,title,category,starts_at,ends_at,venue,city,cover,organizer_id,tiers,attendees,live,created_at'
	);
	const organizerIds = [...new Set(records.map((row) => String(row.organizer_id ?? '')).filter(Boolean))];
	const organizers = new Map<string, string>();
	for (let offset = 0; offset < organizerIds.length; offset += 500) {
		const ids = organizerIds.slice(offset, offset + 500);
		const { data, error } = await client.from('profiles').select('id,name,handle').in('id', ids);
		assertNoError(error, 'profiles');
		for (const profile of data ?? []) {
			organizers.set(String(profile.id), String(profile.name ?? profile.handle ?? 'Organizer'));
		}
	}
	return records.map((row) => mapSupabaseEvent(row, organizers.get(String(row.organizer_id)) ?? 'Organizer'));
}

function paginate<T>(items: T[], page = 1, perPage = 12): Page<T> {
	const safePerPage = Math.min(100, Math.max(1, perPage));
	const pages = Math.max(1, Math.ceil(items.length / safePerPage));
	const safePage = Math.min(Math.max(1, page), pages);
	return {
		rows: items.slice((safePage - 1) * safePerPage, safePage * safePerPage),
		total: items.length,
		page: safePage,
		perPage: safePerPage,
		pages
	};
}

export async function listSupabaseEvents(query: EventQuery = {}): Promise<Page<AdminEvent> & { categories: string[]; organizers: string[]; organizerList: { id: string; name: string }[]; counts: { total: number; published: number; pending: number; draft: number; suspended: number } }> {
	const client = createAdminClient();
	if (!client) throw new Error('Supabase admin client is not configured.');
	const events = await loadEvents(client);
	const q = (query.q ?? '').trim().toLowerCase();
	const filtered = events
		.filter((event) => !query.status || query.status === 'all' || event.status === query.status)
		.filter((event) => !query.category || query.category === 'all' || event.category === query.category)
		.filter((event) => !query.organizer || query.organizer === 'all' || event.organizerId === query.organizer || event.organizerName === query.organizer)
		.filter((event) => !q || [event.title, event.ref, event.organizerName, event.city, event.venue].some((value) => value.toLowerCase().includes(q)))
		.sort((a, b) => {
			if (query.sort === 'newest') return b.startsAt.localeCompare(a.startsAt);
			if (query.sort === 'gmv') return b.grossNgn - a.grossNgn;
			return a.startsAt.localeCompare(b.startsAt);
		});
	const organizers = new Map(events.map((event) => [event.organizerId, event.organizerName]));
	return {
		...paginate(filtered, query.page, query.perPage ?? 8),
		categories: [...new Set(events.map((event) => event.category))].sort(),
		organizers: [...new Set(events.map((event) => event.organizerName))].sort(),
		organizerList: [...organizers].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
		counts: {
			total: events.length,
			published: events.filter((event) => event.status === 'published').length,
			pending: 0,
			draft: 0,
			suspended: 0
		}
	};
}

function dayKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export async function getSupabaseDashboard(): Promise<AdminDashboard> {
	const client = createAdminClient();
	if (!client) throw new Error('Supabase admin client is not configured.');
	const now = new Date();
	const todayStart = new Date(now);
	todayStart.setUTCHours(0, 0, 0, 0);
	const thirtyDaysAgo = new Date(todayStart.getTime() - 29 * 86_400_000);
	const sixtyDaysAgo = new Date(thirtyDaysAgo.getTime() - 30 * 86_400_000);
	const [events, orders, tickets] = await Promise.all([
		loadEvents(client),
		rowsFrom(client, 'orders', 'total,status,created_at', (query) => query.gte('created_at', sixtyDaysAgo.toISOString()).order('created_at')),
		rowsFrom(client, 'tickets', 'status,purchased_at,price,tier_name', (query) => query.order('purchased_at'))
	]);

	const paidOrPending = (order: Record<string, any>) => order.status === 'paid' || order.status === 'pending';
	const inLast30 = orders.filter((order) => new Date(order.created_at).getTime() >= thirtyDaysAgo.getTime());
	const grossNgn = inLast30.filter(paidOrPending).reduce((sum, order) => sum + numberValue(order.total), 0);
	const netNgn = inLast30.filter((order) => order.status === 'paid').reduce((sum, order) => sum + numberValue(order.total), 0);
	const refundsNgn = inLast30.filter((order) => order.status === 'refunded').reduce((sum, order) => sum + numberValue(order.total), 0);
	const priorGross = orders
		.filter((order) => new Date(order.created_at).getTime() < thirtyDaysAgo.getTime() && paidOrPending(order))
		.reduce((sum, order) => sum + numberValue(order.total), 0);
	const grossDelta = priorGross ? ((grossNgn - priorGross) / priorGross) * 100 : 0;
	const allPasses = tickets.length;
	const activePasses = tickets.filter((ticket) => ticket.status === 'valid').length;
	const series = Array.from({ length: 30 }, (_, index) => {
		const date = new Date(thirtyDaysAgo.getTime() + index * 86_400_000);
		const key = dayKey(date);
		return {
			day: key,
			grossNgn: inLast30.filter((order) => dayKey(new Date(order.created_at)) === key && paidOrPending(order)).reduce((sum, order) => sum + numberValue(order.total), 0),
			passes: tickets.filter((ticket) => ticket.purchased_at && dayKey(new Date(ticket.purchased_at)) === key).length
		};
	});
	const today = dayKey(now);
	const upcoming = events.filter((event) => event.status === 'published');
	const tierCounts = new Map<string, { count: number; value: number }>();
	for (const ticket of tickets) {
		const tier = String(ticket.tier_name ?? 'Ticket');
		const current = tierCounts.get(tier) ?? { count: 0, value: 0 };
		current.count += 1;
		current.value += numberValue(ticket.price);
		tierCounts.set(tier, current);
	}
	const tierMix = [...tierCounts.entries()].map(([tier, value]) => ({
		tier,
		count: value.count,
		share: allPasses ? (value.count / allPasses) * 100 : 0,
		avgNgn: value.count ? value.value / value.count : 0
	}));
	const categoryGross = new Map<string, number>();
	for (const event of events) categoryGross.set(event.category, (categoryGross.get(event.category) ?? 0) + event.grossNgn);
	const categoryTotal = [...categoryGross.values()].reduce((sum, value) => sum + value, 0);
	const categoryMix = [...categoryGross.entries()].map(([category, value]) => ({
		category,
		gmvNgn: value,
		share: categoryTotal ? (value / categoryTotal) * 100 : 0
	})).sort((a, b) => b.gmvNgn - a.gmvNgn).slice(0, 3);

	return {
		rangeLabel: 'Last 30 days',
		grossNgn,
		netNgn,
		grossDelta,
		passes: allPasses,
		passesDelta: 0,
		liveEvents: upcoming.length,
		eventsToday: events.filter((event) => dayKey(new Date(event.startsAt)) === today).length,
		pendingReview: 0,
		activePasses,
		refundsPending: 0,
		moderationOpen: 0,
		series,
		tierMix,
		categoryMix,
		topEvents: [...events].sort((a, b) => b.sold - a.sold).slice(0, 2).map((event) => ({
			id: event.id, title: event.title, venue: event.venue, sold: event.sold,
			capacity: event.capacity, grossNgn: event.grossNgn
		})),
		reviewQueue: [],
		recentOrders: [],
		systemHealth: [
			{ key: 'supabase', label: 'Supabase data', value: `${events.length.toLocaleString('en-NG')} events · connected`, ok: true },
			{ key: 'orders', label: '30-day order volume', value: `₦${grossNgn.toLocaleString('en-NG')}`, ok: true },
			{ key: 'refunds', label: '30-day refunded orders', value: `₦${refundsNgn.toLocaleString('en-NG')}`, ok: true },
			{ key: 'tickets', label: 'Ticket ledger', value: `${allPasses.toLocaleString('en-NG')} passes`, ok: true }
		]
	};
}

export async function getSupabaseEvent(id: string): Promise<AdminEvent | null> {
	const client = createAdminClient();
	if (!client) return null;
	const baseQuery = client.from('events').select('id,slug,title,category,starts_at,ends_at,venue,city,cover,organizer_id,tiers,attendees,live,created_at');
	const eventQuery = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
		? await baseQuery.eq('id', id).maybeSingle()
		: await baseQuery.eq('slug', id).maybeSingle();
	assertNoError(eventQuery.error, 'events');
	if (!eventQuery.data) return null;
	const profileQuery = eventQuery.data.organizer_id
		? await client.from('profiles').select('name,handle').eq('id', eventQuery.data.organizer_id).maybeSingle()
		: { data: null, error: null };
	assertNoError(profileQuery.error, 'profiles');
	return mapSupabaseEvent(eventQuery.data, profileQuery.data?.name ?? profileQuery.data?.handle ?? 'Organizer');
}
