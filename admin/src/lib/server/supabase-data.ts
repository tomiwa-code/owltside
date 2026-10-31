import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import type {
	AdminApprovalAttachment,
	AdminDashboard,
	AdminEvent,
	AdminOrder,
	AdminOrganizer,
	AdminTicket,
	AdminUser,
	AuditRecord,
	EventTier
} from '$admin/types';
import { extractApprovalAttachments } from './approvals';
import { hasAdminEventEnded } from '$admin/utils/status';
import { auditFor, type EventQuery, type OrganizerQuery, type Page, type UserQuery } from './store';

let localEnvLoaded = false;
function loadLocalEnvFiles(): void {
	if (localEnvLoaded || process.env.NODE_ENV === 'production') return;
	const cwd = process.cwd();
	const mode = process.env.NODE_ENV || 'development';
	const envFiles = [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env'];
	for (const file of envFiles) loadDotenv({ path: resolve(cwd, file), override: false });
	for (const file of envFiles) loadDotenv({ path: resolve(cwd, '..', file), override: false });
	localEnvLoaded = true;
}

export function createAdminClient(): SupabaseClient {
	loadLocalEnvFiles();
	const url = (process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
	const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
	if (!url || !key) {
		throw new Error(
			'Supabase admin client is not configured. Set PUBLIC_SUPABASE_URL and ' +
			'SUPABASE_SERVICE_ROLE_KEY (pointing at the public web app\'s database) ' +
			'before starting the admin control plane. The console no longer ships ' +
			'with demo seed data.'
		);
	}
	return createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
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
		sold: numberValue(tier.sold ?? tier.attendees),
		benefits: tier.benefits ? String(tier.benefits) : undefined
	}));
}

export function mapSupabaseEvent(
	row: Record<string, any>,
	organizerName = 'Organizer',
	extras?: {
		organizerHandle?: string;
		organizerEmail?: string;
		organizerPhone?: string;
		promos?: { code: string; percent: number; used: number; maxUses: number }[];
		now?: number;
	}
): AdminEvent {
	const tiers = parseTiers(row.tiers);
	const startsAt = String(row.starts_at ?? new Date(0).toISOString());
	const capacity = tiers.reduce((sum, tier) => sum + tier.capacity, 0);
	const tierSold = tiers.reduce((sum, tier) => sum + tier.sold, 0);
	const sold = tierSold || numberValue(row.attendees);
	const grossNgn = tiers.reduce((sum, tier) => sum + tier.sold * tier.priceNgn, 0);
	const cover = row.cover && typeof row.cover === 'object' ? (row.cover as Record<string, unknown>) : {};
	const rawEndsAt = typeof row.ends_at === 'string' && row.ends_at.trim() ? row.ends_at.trim() : null;
	const endsAt = rawEndsAt ?? startsAt;
	const now = extras?.now ?? Date.now();
	const ended = hasAdminEventEnded(startsAt, rawEndsAt, now);
	const rawStatus = String(row.status ?? 'published');
	let status: AdminEvent['status'];
	if (
		rawStatus === 'pending' ||
		rawStatus === 'draft' ||
		rawStatus === 'suspended' ||
		rawStatus === 'rejected'
	) {
		status = rawStatus;
	} else if (rawStatus === 'completed' || rawStatus === 'closed' || ended) {
		status = 'completed';
	} else {
		status = 'published';
	}

	const gatesList = Array.isArray(row.gates)
		? row.gates.map((gate: Record<string, any>) => ({
				name: String(gate?.name ?? 'Gate'),
				staffCount: Array.isArray(gate?.staff) ? gate.staff.length : numberValue(gate?.staffCount)
			}))
		: undefined;
	const speakersList = Array.isArray(row.speakers)
		? row.speakers.map((speaker: Record<string, any>) => ({
				name: String(speaker?.name ?? 'Speaker'),
				handle: speaker?.handle ? String(speaker.handle) : undefined,
				role: String(speaker?.role ?? ''),
				inviteStatus: speaker?.inviteStatus ? String(speaker.inviteStatus) : undefined
			}))
		: undefined;
	const agendaList = Array.isArray(row.agenda)
		? row.agenda.map((slot: Record<string, any>) => ({
				start: String(slot?.start ?? ''),
				title: String(slot?.title ?? ''),
				location: String(slot?.location ?? '')
			}))
		: undefined;

	return {
		id: String(row.id),
		ref: `EVT-${String(row.id).slice(0, 8).toUpperCase()}`,
		slug: String(row.slug ?? row.id),
		title: String(row.title ?? 'Untitled event'),
		category: String(row.category ?? 'Uncategorised'),
		description: row.description ? String(row.description) : undefined,
		organizerId: String(row.organizer_id ?? ''),
		organizerName,
		organizerHandle: extras?.organizerHandle,
		organizerEmail: extras?.organizerEmail,
		organizerPhone: extras?.organizerPhone,
		organizerTier: 1,
		status: status as AdminEvent['status'],
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
		coverIcon: String(cover.icon ?? 'calendar-days'),
		coverSrc: typeof cover.src === 'string' && cover.src ? cover.src : undefined,
		submittedAt: row.submitted_at ? String(row.submitted_at) : undefined,
		moderationNote: row.moderation_note ? String(row.moderation_note) : undefined,
		promos: extras?.promos,
		gatesList,
		speakersList,
		agendaList
	};
}

async function loadEvents(client: SupabaseClient): Promise<AdminEvent[]> {
	const records = await rowsFrom(
		client,
		'events',
		'id,slug,title,description,category,starts_at,ends_at,venue,city,cover,organizer_id,tiers,attendees,gates,speakers,agenda,status,submitted_at,moderation_note,created_at'
	);
	const organizerIds = [...new Set(records.map((row) => String(row.organizer_id ?? '')).filter(Boolean))];
	const organizers = new Map<string, { name: string; handle: string }>();
	for (let offset = 0; offset < organizerIds.length; offset += 500) {
		const ids = organizerIds.slice(offset, offset + 500);
		const { data, error } = await client.from('profiles').select('id,name,handle').in('id', ids);
		assertNoError(error, 'profiles');
		for (const profile of data ?? []) {
			organizers.set(String(profile.id), {
				name: String(profile.name ?? profile.handle ?? 'Organizer'),
				handle: String(profile.handle ?? '')
			});
		}
	}
	return records.map((row) => {
		const org = organizers.get(String(row.organizer_id));
		return mapSupabaseEvent(row, org?.name ?? 'Organizer', { organizerHandle: org?.handle });
	});
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

export async function listSupabaseEvents(query: EventQuery = {}): Promise<
	Page<AdminEvent> & {
		categories: string[];
		organizers: string[];
		organizerList: { id: string; name: string }[];
		counts: { total: number; published: number; completed: number; pending: number; draft: number; suspended: number };
	}
> {
	const client = createAdminClient();
	const events = await loadEvents(client);
	const q = (query.q ?? '').trim().toLowerCase();
	const filtered = events
		.filter((event) => !query.status || query.status === 'all' || event.status === query.status)
		.filter((event) => !query.category || query.category === 'all' || event.category === query.category)
		.filter((event) => !query.organizer || query.organizer === 'all' || event.organizerId === query.organizer || event.organizerName === query.organizer)
		.filter((event) => !q || [event.title, event.ref, event.organizerName, event.city, event.venue].some((value) => value.toLowerCase().includes(q)))
		.sort((a, b) => {
			if (query.sort === 'newest') return (b.submittedAt ?? b.startsAt).localeCompare(a.submittedAt ?? a.startsAt);
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
			published: events.filter((e) => e.status === 'published').length,
			completed: events.filter((e) => e.status === 'completed').length,
			pending: events.filter((e) => e.status === 'pending').length,
			draft: events.filter((e) => e.status === 'draft').length,
			suspended: events.filter((e) => e.status === 'suspended' || e.status === 'rejected').length
		}
	};
}

export async function getSupabaseEvent(id: string): Promise<AdminEvent | null> {
	const client = createAdminClient();
	const baseQuery = client
		.from('events')
		.select(
			'id,slug,title,description,category,starts_at,ends_at,venue,city,cover,organizer_id,tiers,attendees,gates,speakers,agenda,status,submitted_at,moderation_note,created_at'
		);
	const eventQuery = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
		? await baseQuery.eq('id', id).maybeSingle()
		: await baseQuery.eq('slug', id).maybeSingle();
	assertNoError(eventQuery.error, 'events');
	if (!eventQuery.data) return null;
	const organizerId = eventQuery.data.organizer_id ? String(eventQuery.data.organizer_id) : '';
	const [profileQuery, promosQuery, authQuery] = await Promise.all([
		organizerId
			? client.from('profiles').select('name,handle').eq('id', organizerId).maybeSingle()
			: Promise.resolve({ data: null, error: null }),
		client
			.from('event_promos')
			.select('code,percent,used,max_uses')
			.eq('event_id', eventQuery.data.id)
			.then((res) => res, () => ({ data: [], error: null })),
		organizerId
			? client.auth.admin
					.getUserById(organizerId)
					.then((res) => res.data?.user ?? null, () => null)
			: Promise.resolve(null)
	]);
	assertNoError(profileQuery.error, 'profiles');
	const promos = Array.isArray(promosQuery.data)
		? promosQuery.data.map((p: Record<string, any>) => ({
				code: String(p.code ?? ''),
				percent: numberValue(p.percent),
				used: numberValue(p.used),
				maxUses: numberValue(p.max_uses)
			}))
		: [];
	const meta = (authQuery?.user_metadata ?? {}) as Record<string, any>;
	return mapSupabaseEvent(
		eventQuery.data,
		profileQuery.data?.name ?? profileQuery.data?.handle ?? 'Organizer',
		{
			organizerHandle: profileQuery.data?.handle ? String(profileQuery.data.handle) : undefined,
			organizerEmail: authQuery?.email ?? undefined,
			organizerPhone:
				authQuery?.phone || (typeof meta.verified_phone === 'string' ? meta.verified_phone : undefined),
			promos
		}
	);
}

type DataProfile = Record<string, any>;
type DataAuthUser = Record<string, any>;
type UserApprovalSnapshot = {
	phone?: string;
	bank?: string;
	accountNumber?: string;
	accountHolder?: string;
	bankStatus?: string;
	kycDocument?: string;
	kycReference?: string;
	kycLegalName?: string;
	kycDateOfBirth?: string;
	kycStatus?: string;
	kycAttachments?: AdminApprovalAttachment[];
};

type PeopleBundle = {
	profiles: DataProfile[];
	authUsers: Map<string, DataAuthUser>;
	approvalsByUser: Map<string, UserApprovalSnapshot>;
	events: AdminEvent[];
	orders: Record<string, any>[];
	tickets: Record<string, any>[];
	ordersByOwner: Map<string, Record<string, any>[]>;
	ticketsByOwner: Map<string, Record<string, any>[]>;
	ticketsByEvent: Map<string, number>;
	paidGrossByEvent: Map<string, number>;
};

async function loadPeopleBundle(client: SupabaseClient): Promise<PeopleBundle> {
	const [profiles, events, orders, tickets, approvalsRes] = await Promise.all([
		rowsFrom(client, 'profiles', '*', (q) => q.order('created_at', { ascending: false }).order('id')),
		loadEvents(client),
		rowsFrom(client, 'orders', 'id,owner_id,owner_name,event_id,reference,total,items_label,status,gateway,created_at', (q) => q.order('created_at', { ascending: false }).order('id')),
		rowsFrom(client, 'tickets', 'id,owner_id,event_id,code,event_title,tier_name,holder_name,status,purchased_at,price,cover', (q) => q.order('purchased_at', { ascending: false }).order('id')),
		client
			.from('approval_requests')
			.select('requester_id,kind,status,payload,created_at')
			.order('created_at', { ascending: false })
			.limit(1000)
			.then((res) => res.data ?? [], () => [] as Record<string, any>[])
	]);
	const authUsers = new Map<string, DataAuthUser>();
	try {
		const perPage = 1000;
		for (let page = 1; ; page += 1) {
			const { data, error } = await client.auth.admin.listUsers({ page, perPage });
			if (error) {
				break;
			}
			for (const user of data.users as DataAuthUser[]) authUsers.set(user.id, user);
			if (data.users.length < perPage) break;
		}
	} catch {
		// Auth endpoint unavailable; continue without auth metadata.
	}

	const approvalsByUser = new Map<string, UserApprovalSnapshot>();
	for (const row of approvalsRes as Record<string, any>[]) {
		const uid = String(row.requester_id ?? '');
		if (!uid) continue;
		const snap = approvalsByUser.get(uid) ?? {};
		const payload = (row.payload ?? {}) as Record<string, any>;
		if (row.kind === 'verification') {
			const check = String(payload.check ?? 'identity');
			if (check === 'payoutAccount' && !snap.accountNumber && payload.accountNumber) {
				snap.bank = String(payload.bank ?? '');
				snap.accountNumber = String(payload.accountNumber ?? '');
				snap.accountHolder = payload.accountHolder ? String(payload.accountHolder) : undefined;
				snap.bankStatus = String(row.status ?? 'pending');
			} else if (check === 'phone' && !snap.phone && payload.phone) {
				snap.phone = String(payload.phone);
			} else if (check === 'identity' && !snap.kycReference && !snap.kycDocument) {
				snap.kycDocument = payload.document ? String(payload.document) : undefined;
				snap.kycReference = String(payload.fullReference ?? payload.reference ?? '');
				snap.kycLegalName = payload.legalName ? String(payload.legalName) : undefined;
				snap.kycDateOfBirth = payload.dateOfBirth ? String(payload.dateOfBirth) : undefined;
				snap.kycStatus = String(row.status ?? 'pending');
				snap.kycAttachments = extractApprovalAttachments(payload);
			}
		} else if (row.kind === 'payout' && !snap.accountNumber && payload.accountNumber) {
			snap.bank = String(payload.bank ?? '');
			snap.accountNumber = String(payload.accountNumber ?? '');
			snap.accountHolder = payload.accountHolder ? String(payload.accountHolder) : undefined;
		}
		approvalsByUser.set(uid, snap);
	}

	const ordersByOwner = new Map<string, Record<string, any>[]>();
	const ticketsByOwner = new Map<string, Record<string, any>[]>();
	const ticketsByEvent = new Map<string, number>();
	const paidGrossByEvent = new Map<string, number>();
	for (const order of orders) {
		const ownerId = String(order.owner_id ?? '');
		ordersByOwner.set(ownerId, [...(ordersByOwner.get(ownerId) ?? []), order]);
		if (order.status === 'paid') {
			const eventId = String(order.event_id ?? '');
			paidGrossByEvent.set(eventId, (paidGrossByEvent.get(eventId) ?? 0) + numberValue(order.total));
		}
	}
	for (const ticket of tickets) {
		const ownerId = String(ticket.owner_id ?? '');
		ticketsByOwner.set(ownerId, [...(ticketsByOwner.get(ownerId) ?? []), ticket]);
		const eventId = String(ticket.event_id ?? '');
		ticketsByEvent.set(eventId, (ticketsByEvent.get(eventId) ?? 0) + 1);
	}
	return {
		profiles,
		authUsers,
		approvalsByUser,
		events,
		orders,
		tickets,
		ordersByOwner,
		ticketsByOwner,
		ticketsByEvent,
		paidGrossByEvent
	};
}

export function isUserRecordBlocked(profile?: DataProfile, auth?: DataAuthUser): boolean {
	if (profile?.disabled === true) return true;
	const meta = (auth?.user_metadata ?? {}) as Record<string, any>;
	if (meta.account_disabled === true) return true;
	if (auth?.banned_until) {
		const until = new Date(String(auth.banned_until)).getTime();
		if (Number.isFinite(until) && until > Date.now()) return true;
	}
	return false;
}

function mapDataUser(profile: DataProfile, auth: DataAuthUser | undefined, bundle: PeopleBundle): AdminUser {
	const ownedOrders = bundle.ordersByOwner.get(profile.id) ?? [];
	const ownedTickets = bundle.ticketsByOwner.get(profile.id) ?? [];
	const snap = bundle.approvalsByUser.get(profile.id);
	const meta = (auth?.user_metadata ?? {}) as Record<string, any>;
	const isBlocked = isUserRecordBlocked(profile, auth);
	const isOrganizer = profile.operating_identity === 'organizer' || bundle.events.some((event) => event.organizerId === profile.id);
	const role: AdminUser['role'] = isOrganizer ? 'Organizer' : 'Attendee';
	const phone = String(auth?.phone || meta.verified_phone || meta.phone || snap?.phone || '');
	return {
		id: profile.id,
		handle: String(profile.handle ?? profile.id.slice(0, 8)),
		name: String(profile.name ?? 'Owltside user'),
		email: String(auth?.email ?? ''),
		phone,
		bio: profile.bio ? String(profile.bio) : undefined,
		link: profile.link ? String(profile.link) : undefined,
		operatingIdentity: profile.operating_identity ? String(profile.operating_identity) : 'attendee',
		disabledReason:
			(profile.disabled_reason ? String(profile.disabled_reason) : undefined) ||
			(meta.disabled_reason ? String(meta.disabled_reason) : undefined),
		role,
		kycTier: profile.verified ? 1 : 0,
		kycDocument: snap?.kycDocument,
		kycReference: snap?.kycReference,
		kycLegalName: snap?.kycLegalName,
		kycDateOfBirth: snap?.kycDateOfBirth,
		kycStatus: snap?.kycStatus,
		kycAttachments: snap?.kycAttachments,
		bankName: snap?.bank,
		bankAccountNumber: snap?.accountNumber,
		bankAccountHolder: snap?.accountHolder,
		bankStatus: snap?.bankStatus,
		spendNgn: ownedOrders.filter((order) => order.status === 'paid').reduce((sum, order) => sum + numberValue(order.total), 0),
		ticketsCount: ownedTickets.length,
		ordersCount: ownedOrders.length,
		status: isBlocked ? 'blocked' : 'active',
		city: String(profile.city ?? '—'),
		joinedAt: String(profile.created_at ?? auth?.created_at ?? new Date(0).toISOString()),
		lastSeenAt: String(auth?.last_sign_in_at ?? auth?.created_at ?? profile.created_at ?? new Date(0).toISOString())
	};
}

function mapDataTicket(ticket: Record<string, any>, profileById: Map<string, DataProfile>): AdminTicket {
	const profile = profileById.get(String(ticket.owner_id));
	const status = ['valid', 'used', 'refunded', 'transferred'].includes(ticket.status) ? (ticket.status as AdminTicket['status']) : 'void';
	return {
		id: String(ticket.id),
		code: String(ticket.code ?? ''),
		holderName: String(ticket.holder_name ?? profile?.name ?? 'Attendee'),
		holderHandle: String(profile?.handle ?? ''),
		eventId: String(ticket.event_id ?? ''),
		eventTitle: String(ticket.event_title ?? 'Event'),
		tierName: String(ticket.tier_name ?? 'Ticket'),
		status,
		priceNgn: numberValue(ticket.price),
		settlement: 'Paystack',
		orderRef: '',
		purchasedAt: String(ticket.purchased_at ?? new Date(0).toISOString())
	};
}

function mapDataOrder(
	order: Record<string, any>,
	profileById: Map<string, DataProfile>,
	eventById: Map<string, AdminEvent>,
	authUsers?: Map<string, DataAuthUser>
): AdminOrder {
	const ownerId = String(order.owner_id ?? '');
	const profile = profileById.get(ownerId);
	const auth = authUsers?.get(ownerId);
	const meta = (auth?.user_metadata ?? {}) as Record<string, any>;
	const event = eventById.get(String(order.event_id));
	const status: AdminOrder['status'] = order.status === 'paid'
		? 'settled'
		: order.status === 'failed' || order.status === 'refunded'
			? (order.status as AdminOrder['status'])
			: 'pending';
	return {
		id: String(order.id),
		reference: String(order.reference ?? order.id),
		customerName: String(order.owner_name ?? profile?.name ?? 'Attendee'),
		customerEmail: String(auth?.email ?? ''),
		customerPhone: String(auth?.phone || meta.verified_phone || meta.phone || ''),
		eventId: String(order.event_id ?? ''),
		eventTitle: event?.title ?? String(order.items_label ?? 'Event'),
		tierLabel: String(order.items_label ?? 'Ticket'),
		qty: 1,
		subtotalNgn: numberValue(order.total),
		feeNgn: 0,
		totalNgn: numberValue(order.total),
		gateway: order.gateway === 'paystack' ? 'paystack' : 'usd',
		method: String(order.gateway ?? 'paystack'),
		status,
		createdAt: String(order.created_at ?? new Date(0).toISOString()),
		items: []
	};
}

export async function listSupabaseUsers(query: UserQuery = {}, selectedId?: string): Promise<{
	page: Page<AdminUser>;
	counts: { total: number; active: number; flagged: number; blocked: number; verifiedOrganizers: number };
	selected: AdminUser | null;
	related: { tickets: AdminTicket[]; orders: AdminOrder[]; audit: AuditRecord[] };
}> {
	const client = createAdminClient();
	const bundle = await loadPeopleBundle(client);
	const profileById = new Map(bundle.profiles.map((profile) => [profile.id, profile]));
	const users = bundle.profiles.map((profile) => mapDataUser(profile, bundle.authUsers.get(profile.id), bundle));
	const roleMatches = (user: AdminUser) => query.role === 'all' || !query.role || user.role === query.role;
	const filtered = users
		.filter((user) => !query.status || query.status === 'all' || user.status === query.status)
		.filter(roleMatches)
		.filter((user) => !query.kyc || query.kyc === 'all' || String(user.kycTier) === query.kyc)
		.filter((user) => {
			const q = (query.q ?? '').trim().toLowerCase();
			return !q || [user.name, user.handle, user.email, user.phone, user.id].some((v) => v.toLowerCase().includes(q));
		})
		.sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));
	const page = paginate(filtered, query.page, query.perPage ?? 10);
	const selected = users.find((user) => user.id === selectedId) ?? page.rows[0] ?? null;
	const eventById = new Map(bundle.events.map((event) => [event.id, event]));
	const relatedTickets = selected ? (bundle.ticketsByOwner.get(selected.id) ?? []).slice(0, 8).map((ticket) => mapDataTicket(ticket, profileById)) : [];
	const relatedOrders = selected ? (bundle.ordersByOwner.get(selected.id) ?? []).slice(0, 8).map((order) => mapDataOrder(order, profileById, eventById, bundle.authUsers)) : [];
	return {
		page,
		counts: {
			total: users.length,
			active: users.filter((user) => user.status === 'active').length,
			flagged: 0,
			blocked: users.filter((user) => user.status === 'blocked').length,
			verifiedOrganizers: bundle.profiles.filter((profile) => profile.operating_identity === 'organizer' || bundle.events.some((event) => event.organizerId === profile.id)).length
		},
		selected,
		related: {
			tickets: relatedTickets,
			orders: relatedOrders,
			audit: selected ? auditFor(selected.id, 8) : []
		}
	};
}

export async function getSupabaseUser(id: string): Promise<{ user: AdminUser; tickets: AdminTicket[]; orders: AdminOrder[] } | null> {
	const result = await listSupabaseUsers({ page: 1, perPage: 1 }, id);
	if (!result.selected) return null;
	return { user: result.selected, tickets: result.related.tickets, orders: result.related.orders };
}

export async function listSupabaseTickets(query: { q?: string; status?: string; eventId?: string; page?: number; perPage?: number } = {}): Promise<{
	page: Page<AdminTicket>;
	events: { id: string; title: string }[];
	counts: { total: number; valid: number; revoked: number; valueNgn: number; avgPriceNgn: number };
}> {
	const client = createAdminClient();
	const bundle = await loadPeopleBundle(client);
	const profileById = new Map(bundle.profiles.map((p) => [p.id, p]));
	const tickets = bundle.tickets.map((t) => mapDataTicket(t, profileById));
	const q = (query.q ?? '').trim().toLowerCase();
	const filtered = tickets
		.filter((t) => !query.status || query.status === 'all' || t.status === query.status)
		.filter((t) => !query.eventId || query.eventId === 'all' || t.eventId === query.eventId)
		.filter((t) => !q || [t.code, t.holderName, t.holderHandle, t.orderRef, t.eventTitle].some((v) => v.toLowerCase().includes(q)))
		.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
	const revoked = filtered.filter((t) => ['void', 'refunded', 'transferred'].includes(t.status)).length;
	const valueNgn = filtered.reduce((sum, t) => sum + t.priceNgn, 0);
	return {
		page: paginate(filtered, query.page, query.perPage ?? 8),
		events: bundle.events.map((e) => ({ id: e.id, title: e.title })),
		counts: {
			total: filtered.length,
			valid: filtered.filter((t) => t.status === 'valid').length,
			revoked,
			valueNgn,
			avgPriceNgn: filtered.length ? Math.round(valueNgn / filtered.length) : 0
		}
	};
}

export async function listSupabaseOrders(query: { q?: string; status?: string; method?: string; page?: number; perPage?: number } = {}): Promise<{
	page: Page<AdminOrder>;
	methods: string[];
	counts: { total: number; settled: number; pending: number; failed: number; refunded: number; disputed: number };
	financials: { grossNgn: number; settledNgn: number; pendingNgn: number; failedNgn: number; settledPct: number };
}> {
	const client = createAdminClient();
	const bundle = await loadPeopleBundle(client);
	const profileById = new Map(bundle.profiles.map((p) => [p.id, p]));
	const eventById = new Map(bundle.events.map((e) => [e.id, e]));
	const orders = bundle.orders.map((o) => mapDataOrder(o, profileById, eventById, bundle.authUsers));
	const q = (query.q ?? '').trim().toLowerCase();
	const filtered = orders
		.filter((o) => !query.status || query.status === 'all' || o.status === query.status)
		.filter((o) => !query.method || query.method === 'all' || o.method === query.method)
		.filter((o) => !q || [o.reference, o.customerName, o.customerEmail, o.eventTitle, o.tierLabel].some((v) => v.toLowerCase().includes(q)))
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	const grossNgn = orders.filter((o) => o.status === 'settled' || o.status === 'pending').reduce((s, o) => s + o.totalNgn, 0);
	const settledNgn = orders.filter((o) => o.status === 'settled').reduce((s, o) => s + o.totalNgn, 0);
	const pendingNgn = orders.filter((o) => o.status === 'pending').reduce((s, o) => s + o.totalNgn, 0);
	const failedNgn = orders.filter((o) => o.status === 'failed').reduce((s, o) => s + o.totalNgn, 0);
	return {
		page: paginate(filtered, query.page, query.perPage ?? 10),
		methods: [...new Set(orders.map((o) => o.method))].sort(),
		counts: {
			total: orders.length,
			settled: orders.filter((o) => o.status === 'settled').length,
			pending: orders.filter((o) => o.status === 'pending').length,
			failed: orders.filter((o) => o.status === 'failed').length,
			refunded: orders.filter((o) => o.status === 'refunded').length,
			disputed: 0
		},
		financials: {
			grossNgn,
			settledNgn,
			pendingNgn,
			failedNgn,
			settledPct: grossNgn ? Math.round((settledNgn / grossNgn) * 1000) / 10 : 0
		}
	};
}

function mapDataOrganizer(profile: DataProfile, auth: DataAuthUser | undefined, bundle: PeopleBundle): AdminOrganizer {
	const ownEvents = bundle.events.filter((event) => event.organizerId === profile.id);
	const ticketsSold = ownEvents.reduce((sum, event) => sum + (bundle.ticketsByEvent.get(event.id) ?? 0), 0);
	const grossVolumeNgn = ownEvents.reduce((sum, event) => sum + (bundle.paidGrossByEvent.get(event.id) ?? 0), 0);
	const snap = bundle.approvalsByUser.get(profile.id);
	const meta = (auth?.user_metadata ?? {}) as Record<string, any>;
	const isBlocked = isUserRecordBlocked(profile, auth);
	const phone = String(auth?.phone || meta.verified_phone || meta.phone || snap?.phone || '');
	const accountNumber = snap?.accountNumber ?? '';
	return {
		id: profile.id,
		name: String(profile.name ?? 'Organizer'),
		legalName: String(snap?.kycLegalName || profile.name || 'Organizer'),
		slug: String(profile.handle ?? profile.id.slice(0, 8)),
		cacRegNumber: String(snap?.kycReference ?? ''),
		tier: 1,
		status: isBlocked ? 'suspended' : profile.verified ? 'verified' : 'pending',
		city: String(profile.city ?? '—'),
		state: '',
		contactName: String(profile.name ?? ''),
		contactEmail: String(auth?.email ?? ''),
		contactPhone: phone,
		bio: profile.bio ? String(profile.bio) : undefined,
		link: profile.link ? String(profile.link) : undefined,
		eventsCount: ownEvents.length,
		ticketsSold,
		grossVolumeNgn,
		escrowHeldNgn: 0,
		settlementBank: String(snap?.bank ?? ''),
		settlementAccountLast4: accountNumber ? accountNumber.slice(-4) : '',
		settlementAccountNumber: accountNumber || undefined,
		settlementAccountHolder: snap?.accountHolder || String(profile.name ?? ''),
		settlementState: isBlocked
			? 'frozen'
			: snap?.bankStatus === 'approved'
				? 'linked'
				: 'pending',
		risk: isBlocked ? 'high' : 'low',
		verifiedDocs: profile.verified ? 2 : (snap?.kycStatus === 'approved' ? 1 : 0) + (snap?.bankStatus === 'approved' ? 1 : 0),
		requiredDocs: 2,
		createdAt: String(profile.created_at ?? new Date(0).toISOString()),
		flagReason:
			(profile.disabled_reason ? String(profile.disabled_reason) : undefined) ||
			(meta.disabled_reason ? String(meta.disabled_reason) : undefined),
		kycDocument: snap?.kycDocument,
		kycReference: snap?.kycReference,
		kycLegalName: snap?.kycLegalName,
		kycDateOfBirth: snap?.kycDateOfBirth,
		kycStatus: snap?.kycStatus,
		kycAttachments: snap?.kycAttachments
	};
}

export async function listSupabaseOrganizers(query: OrganizerQuery = {}, selectedId?: string): Promise<{
	page: Page<AdminOrganizer>;
	counts: { total: number; pending: number; verified: number; flagged: number; tier1: number; payoutVolumeNgn: number };
	selected: AdminOrganizer | null;
	pipelines: Record<string, { id: string; title: string; sold: number }[]>;
}> {
	const client = createAdminClient();
	const bundle = await loadPeopleBundle(client);
	const eventOrganizerIds = new Set(bundle.events.map((event) => event.organizerId));
	const profiles = bundle.profiles.filter((profile) => profile.operating_identity === 'organizer' || eventOrganizerIds.has(profile.id));
	const organizers = profiles.map((profile) => mapDataOrganizer(profile, bundle.authUsers.get(profile.id), bundle));
	const filtered = organizers
		.filter((org) => !query.status || query.status === 'all' || org.status === query.status)
		.filter((org) => !query.tier || query.tier === 'all')
		.filter((org) => {
			const q = (query.q ?? '').trim().toLowerCase();
			return !q || [org.name, org.legalName, org.contactName, org.contactEmail, org.cacRegNumber].some((v) => v.toLowerCase().includes(q));
		})
		.sort((a, b) => b.grossVolumeNgn - a.grossVolumeNgn);
	const page = paginate(filtered, query.page, query.perPage ?? 10);
	const selected: AdminOrganizer | null = organizers.find((org: AdminOrganizer) => org.id === selectedId) ?? page.rows[0] ?? null;
	const pipelines = Object.fromEntries([...new Set([...page.rows.map((org) => org.id), selected?.id].filter(Boolean) as string[])].map((id) => [
		id,
		bundle.events.filter((event) => event.organizerId === id).slice(0, 3).map((event) => ({ id: event.id, title: event.title, sold: event.sold }))
	]));
	return {
		page,
		counts: {
			total: organizers.length,
			pending: organizers.filter((org) => org.status === 'pending').length,
			verified: organizers.filter((org) => org.status === 'verified').length,
			flagged: 0,
			tier1: organizers.filter((org) => org.tier === 1).length,
			payoutVolumeNgn: organizers.reduce((sum, org) => sum + org.grossVolumeNgn, 0)
		},
		selected,
		pipelines
	};
}

export async function getSupabaseOrganizer(id: string): Promise<{ organizer: AdminOrganizer; events: AdminEvent[] } | null> {
	const client = createAdminClient();
	const bundle = await loadPeopleBundle(client);
	const eventOrganizerIds = new Set(bundle.events.map((event) => event.organizerId));
	const profile = bundle.profiles.find((item) => item.id === id || item.handle === id);
	if (!profile || (profile.operating_identity !== 'organizer' && !eventOrganizerIds.has(profile.id))) return null;
	return {
		organizer: mapDataOrganizer(profile, bundle.authUsers.get(profile.id), bundle),
		events: bundle.events.filter((event) => event.organizerId === profile.id)
	};
}

function dayKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export async function listSupabaseRefunds(): Promise<{
	rows: { id: string; orderRef: string; customerId?: string; customerName: string; customerEmail?: string; eventId?: string; eventTitle: string; ticketCode?: string; amountNgn: number; originalNgn: number; reason: string; status: 'pending' | 'approved' | 'rejected' | 'processing' | 'settled'; requestedAt: string; slaHours: number; policyMatch: number; signals: string[]; note?: string; decidedAt?: string; decidedBy?: string }[];
	summary: { pending: number; total30dNgn: number; successRate: number; avgResolutionHours: number; escrowNgn: number };
}> {
	const client = createAdminClient();
	// NOTE: approval_requests.requester_id FKs to auth.users, not public.profiles,
	// so PostgREST cannot resolve an implicit join across schemas. Pull the
	// request rows first and resolve profile names by id, matching how the
	// approvals module already fetches them.
	const { data, error } = await client
		.from('approval_requests')
		.select('*')
		.eq('kind', 'refund')
		.order('created_at', { ascending: false })
		.limit(200);
	assertNoError(error, 'approval_requests');
	const requesterIds = [...new Set(((data ?? []) as Record<string, any>[]).map((r) => String(r.requester_id)).filter(Boolean))];
	const requesterMap = new Map<string, { name?: unknown; handle?: unknown }>();
	for (let offset = 0; offset < requesterIds.length; offset += 500) {
		const ids = requesterIds.slice(offset, offset + 500);
		const { data: people, error: peopleError } = await client.from('profiles').select('id,name,handle').in('id', ids);
		if (!peopleError) {
			for (const p of (people ?? []) as Record<string, any>[]) requesterMap.set(String(p.id), p);
		}
	}
	const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
	const rows = ((data ?? []) as Record<string, any>[]).map((row) => {
		const customerId = row.requester_id ? String(row.requester_id) : undefined;
		const requester = customerId ? requesterMap.get(customerId) : undefined;
		const payload = (row.payload ?? {}) as Record<string, any>;
		const status = (row.status === 'approved' ? 'processing' : row.status === 'rejected' ? 'rejected' : 'pending') as 'pending' | 'approved' | 'rejected' | 'processing' | 'settled';
		const customerEmail = typeof payload.requesterEmail === 'string' && payload.requesterEmail.trim()
			? payload.requesterEmail.trim()
			: undefined;
		const eventId = typeof payload.eventId === 'string' && payload.eventId.trim()
			? payload.eventId.trim()
			: undefined;
		const ticketCode = typeof payload.ticketCode === 'string' && payload.ticketCode.trim()
			? payload.ticketCode.trim()
			: row.subject_label
				? String(row.subject_label)
				: undefined;
		return {
			id: String(row.id),
			orderRef: String(row.subject_label ?? row.id),
			customerId,
			customerName: String(requester?.name ?? payload.requesterName ?? requester?.handle ?? 'Attendee'),
			customerEmail,
			eventId,
			eventTitle: String(payload.eventTitle ?? row.title ?? 'Refund request').replace(/^Refund · /, ''),
			ticketCode,
			amountNgn: numberValue(row.amount),
			originalNgn: numberValue(row.amount),
			reason: String(payload.reason ?? 'Refund requested'),
			status,
			requestedAt: String(row.created_at ?? new Date().toISOString()),
			slaHours: 8,
			policyMatch: 100,
			signals: ['Submitted from public app'],
			note: row.decision_note ? String(row.decision_note) : undefined,
			decidedAt: row.decided_at ? String(row.decided_at) : undefined,
			decidedBy: row.decided_by ? String(row.decided_by) : undefined
		};
	});
	const pending = rows.filter((r) => r.status === 'pending').length;
	const last30 = rows.filter((r) => new Date(r.requestedAt).getTime() >= thirtyDaysAgo.getTime());
	const total30 = last30.reduce((s, r) => s + r.amountNgn, 0);
	const decided = last30.filter((r) => r.status !== 'pending');
	const successRate = decided.length ? Math.round((decided.filter((r) => r.status === 'processing').length / decided.length) * 1000) / 10 : 100;
	return {
		rows,
		summary: { pending, total30dNgn: total30, successRate, avgResolutionHours: 0, escrowNgn: total30 }
	};
}

export async function getSupabaseDashboard(): Promise<AdminDashboard> {
	const client = createAdminClient();
	const now = new Date();
	const todayStart = new Date(now);
	todayStart.setUTCHours(0, 0, 0, 0);
	const thirtyDaysAgo = new Date(todayStart.getTime() - 29 * 86_400_000);
	const sixtyDaysAgo = new Date(thirtyDaysAgo.getTime() - 30 * 86_400_000);
	const [events, orders, tickets] = await Promise.all([
		loadEvents(client),
		rowsFrom(client, 'orders', 'total,status,created_at', (q) => q.gte('created_at', sixtyDaysAgo.toISOString()).order('created_at')),
		rowsFrom(client, 'tickets', 'status,purchased_at,price,tier_name', (q) => q.order('purchased_at'))
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
	const categoryMix = [...categoryGross.entries()].map(([category, gmvNgn]) => ({
		category,
		gmvNgn,
		share: categoryTotal ? (gmvNgn / categoryTotal) * 100 : 0
	})).sort((a, b) => b.gmvNgn - a.gmvNgn).slice(0, 3);

	const reviewQueue = events
		.filter((event) => event.status === 'pending')
		.slice(0, 3)
		.map((event) => ({
			id: event.id,
			ref: event.ref,
			title: event.title,
			organizer: event.organizerName,
			status: 'Under review',
			tone: 'warn' as const
		}));

	return {
		rangeLabel: 'Last 30 days',
		grossNgn,
		netNgn,
		grossDelta,
		passes: allPasses,
		passesDelta: 0,
		liveEvents: upcoming.length,
		eventsToday: events.filter((event) => dayKey(new Date(event.startsAt)) === today).length,
		pendingReview: events.filter((e) => e.status === 'pending').length,
		activePasses,
		refundsPending: 0,
		moderationOpen: events.filter((e) => e.status === 'pending').length,
		series,
		tierMix,
		categoryMix,
		topEvents: [...events].filter((e) => e.status === 'published').sort((a, b) => b.sold - a.sold).slice(0, 2).map((event) => ({
			id: event.id, title: event.title, venue: event.venue, sold: event.sold,
			capacity: event.capacity, grossNgn: event.grossNgn
		})),
		reviewQueue,
		recentOrders: [],
		systemHealth: [
			{ key: 'supabase', label: 'Supabase data', value: `${events.length.toLocaleString('en-NG')} events · connected`, ok: true },
			{ key: 'orders', label: '30-day order volume', value: `₦${grossNgn.toLocaleString('en-NG')}`, ok: true },
			{ key: 'refunds', label: '30-day refunded orders', value: `₦${refundsNgn.toLocaleString('en-NG')}`, ok: true },
			{ key: 'tickets', label: 'Ticket ledger', value: `${allPasses.toLocaleString('en-NG')} passes`, ok: true }
		]
	};
}

export type SettlementsRow = {
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
};

export interface SettlementsAnalytics {
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
	rows: SettlementsRow[];
	totalProfiles: number;
	totalSubaccounts: number;
	peakDay: { day: string; grossNgn: number; payoutNgn: number };
	avgDaily: number;
	onTimePct: number;
	batchWindow: string;
}

const COMMISSION_RATE = 0.08; // 8% platform fee

function initialsFrom(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((p) => p[0]?.toUpperCase() ?? '')
		.join('') || 'OW';
}

/**
 * Financial analytics computed from the existing orders/events/profiles tables.
 * Payout rails to Paystack subaccounts are not wired yet; per-organizer escrow
 * balances are therefore held in 'queued' state and bank details show as
 * 'Subaccount not linked' until Paystack subaccounts are provisioned.
 */
export async function getSupabaseSettlements(): Promise<SettlementsAnalytics> {
	const client = createAdminClient();
	const now = new Date();
	const todayStart = new Date(now);
	todayStart.setUTCHours(0, 0, 0, 0);
	const thirtyDaysAgo = new Date(todayStart.getTime() - 29 * 86_400_000);
	const sixtyDaysAgo = new Date(thirtyDaysAgo.getTime() - 30 * 86_400_000);

	const [events, orders, tickets] = await Promise.all([
		loadEvents(client),
		rowsFrom(client, 'orders', 'id,owner_id,owner_name,event_id,total,status,gateway,created_at', (q) =>
			q.gte('created_at', sixtyDaysAgo.toISOString()).order('created_at')
		),
		rowsFrom(client, 'tickets', 'id,owner_id,event_id,price,status,purchased_at', (q) =>
			q.gte('purchased_at', sixtyDaysAgo.toISOString()).order('purchased_at')
		)
	]);

	const eventById = new Map(events.map((e) => [e.id, e]));
	const organizerEvents = new Map<string, AdminEvent[]>();
	for (const e of events) {
		const list = organizerEvents.get(e.organizerId) ?? [];
		list.push(e);
		organizerEvents.set(e.organizerId, list);
	}

	const inLast30 = orders.filter((o) => new Date(o.created_at).getTime() >= thirtyDaysAgo.getTime());
	const prior30 = orders.filter((o) => {
		const t = new Date(o.created_at).getTime();
		return t < thirtyDaysAgo.getTime() && t >= sixtyDaysAgo.getTime();
	});

	const isSettled = (o: Record<string, any>) => o.status === 'paid' || o.status === 'settled';
	const isPending = (o: Record<string, any>) => o.status === 'pending';
	const isRefunded = (o: Record<string, any>) => o.status === 'refunded';

	const grossNgn = inLast30.filter((o) => isSettled(o) || isPending(o)).reduce((s, o) => s + numberValue(o.total), 0);
	const settledNgn = inLast30.filter(isSettled).reduce((s, o) => s + numberValue(o.total), 0);
	const pendingNgn = inLast30.filter(isPending).reduce((s, o) => s + numberValue(o.total), 0);
	const refundedNgn = inLast30.filter(isRefunded).reduce((s, o) => s + numberValue(o.total), 0);
	const priorGross = prior30.filter((o) => isSettled(o) || isPending(o)).reduce((s, o) => s + numberValue(o.total), 0);
	const grossDelta = priorGross ? ((grossNgn - priorGross) / priorGross) * 100 : 0;
	const commissionNgn = Math.round(settledNgn * COMMISSION_RATE);
	const commissionRate = COMMISSION_RATE * 100;
	const settledPct = grossNgn ? Math.round((settledNgn / grossNgn) * 1000) / 10 : 0;
	const refundedPct = grossNgn ? Math.round((refundedNgn / grossNgn) * 1000) / 10 : 0;

	const velocity: { day: string; grossNgn: number; payoutNgn: number }[] = Array.from({ length: 30 }, (_, i) => {
		const d = new Date(thirtyDaysAgo.getTime() + i * 86_400_000);
		const key = dayKey(d);
		return {
			day: key,
			grossNgn: inLast30
				.filter((o) => dayKey(new Date(o.created_at)) === key && (isSettled(o) || isPending(o)))
				.reduce((s, o) => s + numberValue(o.total), 0),
			// Without a real payout rail we approximate disbursed as the prior-day
			// settled amount (T+1 settlement assumption).
			payoutNgn: 0
		};
	});
	// Fill payoutNgn as the prior day's settled volume to mimic T+1 release.
	for (let i = 1; i < velocity.length; i += 1) {
		const prevKey = velocity[i - 1].day;
		velocity[i].payoutNgn = inLast30
			.filter((o) => dayKey(new Date(o.created_at)) === prevKey && isSettled(o))
			.reduce((s, o) => s + Math.round(numberValue(o.total) * (1 - COMMISSION_RATE)), 0);
	}

	// Per-organizer rows keyed off events owned.
	const organizerTotals = new Map<string, { gmv: number; fees: number; tickets: number; events: number }>();
	const bump = (id: string, gmvAdd: number, feesAdd: number, ticketsAdd: number, eventsAdd = 0) => {
		const cur = organizerTotals.get(id) ?? { gmv: 0, fees: 0, tickets: 0, events: 0 };
		cur.gmv += gmvAdd;
		cur.fees += feesAdd;
		cur.tickets += ticketsAdd;
		cur.events += eventsAdd;
		organizerTotals.set(id, cur);
	};
	for (const e of events) bump(e.organizerId, 0, 0, 0, 1);
	for (const o of orders) {
		if (!isSettled(o) && !isPending(o)) continue;
		const event = eventById.get(String(o.event_id));
		if (!event) continue;
		const total = numberValue(o.total);
		bump(event.organizerId, total, Math.round(total * COMMISSION_RATE), 0);
	}
	for (const t of tickets) {
		if (t.status === 'refunded' || t.status === 'void') continue;
		const event = eventById.get(String(t.event_id));
		if (!event) continue;
		bump(event.organizerId, 0, 0, 1);
	}

	const rows: SettlementsRow[] = [];
	const organizerProfileIds = new Set([...organizerEvents.keys()]);
	for (const o of orders) {
		if (o.owner_id) organizerProfileIds.add(String(o.owner_id));
	}
	const profileById = new Map<string, { name?: unknown; handle?: unknown }>();
	const allIds = [...organizerTotals.keys()];
	for (let offset = 0; offset < allIds.length; offset += 500) {
		const ids = allIds.slice(offset, offset + 500);
		const { data } = await client.from('profiles').select('id,name,handle').in('id', ids);
		for (const p of (data ?? []) as Record<string, any>[]) profileById.set(String(p.id), p);
	}
	for (const [orgId, totals] of organizerTotals.entries()) {
		const p = profileById.get(orgId);
		const name = String(p?.name ?? p?.handle ?? 'Organizer');
		const hasSettled = inLast30.some(
			(o) => eventById.get(String(o.event_id))?.organizerId === orgId && isSettled(o)
		);
		const hasPending = inLast30.some(
			(o) => eventById.get(String(o.event_id))?.organizerId === orgId && isPending(o)
		);
		const state: SettlementsRow['state'] = hasPending ? 'queued' : hasSettled ? 'next_batch' : 'queued';
		rows.push({
			organizerId: orgId,
			name,
			initials: initialsFrom(name),
			events: totals.events,
			tickets: totals.tickets,
			gmvNgn: totals.gmv,
			feeNgn: totals.fees,
			payoutNgn: Math.round(totals.gmv - totals.fees),
			state,
			bank: 'Subaccount not linked',
			accountLast4: '—'
		});
	}
	rows.sort((a, b) => b.gmvNgn - a.gmvNgn);

	const peakDay = velocity.reduce(
		(p, v) => (v.grossNgn > p.grossNgn ? v : p),
		velocity[0] ?? { day: dayKey(now), grossNgn: 0, payoutNgn: 0 }
	);
	const avgDaily = velocity.length ? Math.round(velocity.reduce((s, v) => s + v.grossNgn, 0) / velocity.length) : 0;
	const onTimePct = 100; // all T+1 releases modeled on-time

	return {
		range: { from: velocity[0]?.day ?? dayKey(thirtyDaysAgo), to: velocity[velocity.length - 1]?.day ?? dayKey(now) },
		grossNgn,
		grossDelta: Math.round(grossDelta * 10) / 10,
		settledNgn,
		settledPct,
		commissionNgn,
		commissionRate,
		escrowNgn: pendingNgn,
		escrowEvents: events.filter((e) => organizerTotals.get(e.organizerId)?.gmv && e.status !== 'draft').length,
		refundedNgn,
		refundedPct,
		velocity,
		rows,
		totalProfiles: organizerProfileIds.size,
		totalSubaccounts: 0, // Paystack subaccounts not yet provisioned
		peakDay,
		avgDaily,
		onTimePct,
		batchWindow: 'T+1 · 02:00 UTC'
	};
}
