import type {
	Checkin,
	Conversation,
	EventItem,
	Message,
	MessageRequest,
	NotificationItem,
	Order,
	Profile,
	Ticket
} from '$lib/types';

/**
 * In-memory demo database. Lives for the lifetime of the server process and
 * mirrors the Supabase schema 1:1 (see supabase/sql/).
 */

const now = Date.now();
const at = (days: number, hour = 12, min = 0): string => {
	const d = new Date(now + days * 86_400_000);
	d.setHours(hour, min, 0, 0);
	return d.toISOString();
};

export const people: Record<string, Profile> = {
	ada: {
		id: 'u-ada',
		handle: 'adaobi',
		name: 'Ada Obi',
		avatarColor: '#8083ff',
		bio: 'Chasing good sound and good software across Lagos.',
		link: 'https://adaobi.dev',
		city: 'Lagos',
		followers: 214,
		following: 189
	},
	amina: {
		id: 'u-amina',
		handle: 'drbello',
		name: 'Dr. Amina Bello',
		avatarColor: '#009eb9',
		bio: 'Public-health technologist • Keynote speaker • She/her',
		city: 'Abuja',
		verified: true,
		followers: 12_400,
		following: 310
	},
	tunde: {
		id: 'u-tunde',
		handle: 'tundeb',
		name: 'Tunde Bakare',
		avatarColor: '#f59e0b',
		bio: 'Weekend raver, weekday engineer.',
		city: 'Lagos',
		followers: 388,
		following: 402
	},
	chiamaka: {
		id: 'u-chiamaka',
		handle: 'chiamaka',
		name: 'Chiamaka Okafor',
		avatarColor: '#b50036',
		bio: 'Design leader. I teach product craft.',
		city: 'Lagos',
		verified: true,
		followers: 8_930,
		following: 122
	},
	femi: {
		id: 'u-femi',
		handle: 'femiade',
		name: 'Femi Adeyemi',
		avatarColor: '#10b981',
		bio: 'Promoter & selector. Beach season is every season.',
		city: 'Lagos',
		verified: true,
		followers: 22_100,
		following: 87
	},
	zainab: {
		id: 'u-zainab',
		handle: 'zainabm',
		name: 'Zainab Musa',
		avatarColor: '#4cd7f6',
		bio: 'Payments infrastructure for the next billion users.',
		city: 'Kano',
		verified: true,
		followers: 15_700,
		following: 240
	},
	segun: {
		id: 'u-segun',
		handle: 'seguna',
		name: 'Segun Alakija',
		avatarColor: '#494bd6',
		bio: 'Building the Pulse summit series.',
		city: 'Lagos',
		verified: true,
		followers: 5_310,
		following: 190
	},
	ngozi: {
		id: 'u-ngozi',
		handle: 'ngozie',
		name: 'Ngozi Eze',
		avatarColor: '#ffb2b7',
		bio: 'Product coach, ex-fintech, forever curious.',
		city: 'Enugu',
		followers: 4_020,
		following: 350
	}
};

export const events: EventItem[] = [
	{
		id: 'e-pulse-ai',
		slug: 'pulse-ai-summit-lagos',
		title: 'Pulse AI Summit Lagos',
		category: 'tech',
		tags: ['AI', 'Summit', 'Networking'],
		startsAt: at(9, 9),
		endsAt: at(9, 18),
		venue: 'Eko Convention Center',
		city: 'Victoria Island, Lagos',
		cover: { from: '#312e81', to: '#7c3aed', icon: 'brain-circuit' },
		description:
			'A full day of applied-AI talks, live build sessions and investor office hours. 40+ speakers across two stages, plus a rooftop networking lounge after dark.',
		organizer: people.segun,
		speakers: [people.amina, people.zainab, people.ngozi],
		agenda: [
			{ id: 'a1', start: at(9, 9), title: 'Registration & coffee', location: 'Main Foyer' },
			{ id: 'a2', start: at(9, 10), title: 'Keynote: AI for the African decade', location: 'Main Stage', speakerIds: ['u-amina'] },
			{ id: 'a3', start: at(9, 12), title: 'Panel: Payments × Agents', location: 'Main Stage', speakerIds: ['u-zainab', 'u-ngozi'] },
			{ id: 'a4', start: at(9, 15), title: 'Live build: RAG over NGN price data', location: 'Studio B' }
		],
		tiers: [
			{ id: 'tier-regular', name: 'Regular', price: 45_000, sold: 788, capacity: 800, benefits: 'All talks + expo floor' },
			{ id: 'tier-vip', name: 'VIP', price: 120_000, sold: 140, capacity: 200, benefits: 'Front rows, lounge, recordings' }
		],
		faqs: [
			{ q: 'Is there parking at Eko Convention Center?', a: 'Yes — paid parking on level B1/B2; arrive 45 min early for keynote.' },
			{ q: 'Will sessions be recorded?', a: 'Main stage yes; studio sessions are offline-only.' }
		],
		policies: ['No re-entry after 12:00', 'ID required for badge pickup'],
		featured: true,
		viewsToday: 2_310,
		attendees: 928
	},
	{
		id: 'e-afrobeats',
		slug: 'afrobeats-sound-sunset',
		title: 'Afrobeats & Sound Sunset',
		category: 'music',
		tags: ['Afrobeats', 'Live DJs', 'Beach'],
		startsAt: at(5, 16),
		endsAt: at(5, 23),
		venue: 'Landmark Beach',
		city: 'Oniru, Lagos',
		cover: { from: '#b45309', to: '#7c2d12', icon: 'audio-waveform' },
		description:
			'Golden-hour sets from Lagos\u2019 finest selectors, live percussion and a floating bar. Bring sunscreen; leave with new friends.',
		organizer: people.femi,
		speakers: [people.femi],
		agenda: [
			{ id: 'b1', start: at(5, 16), title: 'Gates open • welcome drink', location: 'Beach Gate' },
			{ id: 'b2', start: at(5, 18), title: 'Live percussion circle', location: 'Main Deck' },
			{ id: 'b3', start: at(5, 20), title: 'Headline DJ set', location: 'Main Deck' }
		],
		tiers: [
			{ id: 'tier-general', name: 'General', price: 15_000, sold: 1_140, capacity: 1_300, benefits: 'Beach access + one drink' },
			{ id: 'tier-vip', name: 'VIP Deck', price: 40_000, sold: 190, capacity: 200, benefits: 'Raised deck, open bar till 9pm' }
		],
		faqs: [{ q: 'Can I pay at the gate?', a: 'Only if passes remain — advance purchase is guaranteed.' }],
		policies: ['18+ only', 'No outside food or drinks'],
		trendingRank: 4,
		viewsToday: 1_870,
		attendees: 1_330
	},
	{
		id: 'e-hackathon',
		slug: 'deep-tech-hackathon-2026',
		title: 'Deep Tech Hackathon 2026',
		category: 'workshops',
		tags: ['Hackathon', 'Builders', '48h'],
		startsAt: at(1, 8),
		endsAt: at(3, 18),
		venue: 'Lagos Innovation Hub',
		city: 'Yaba, Lagos',
		cover: { from: '#065f46', to: '#0f172a', icon: 'terminal' },
		description:
			'48 hours, free jollof, GPUs on tap. Ship something that matters with 180 other builders. Prizes from three VCs.',
		organizer: people.segun,
		speakers: [people.ngozi],
		agenda: [{ id: 'h1', start: at(1, 8), title: 'Check-in & team formation', location: 'Atrium' }],
		tiers: [{ id: 'tier-free', name: 'Builder Pass', price: 0, sold: 180, capacity: 200, benefits: 'Desk, meals, swag' }],
		faqs: [{ q: 'Do I need a team?', a: 'No — team formation happens at kickoff.' }],
		policies: ['Laptops required', 'Venue sleeps 60 (first come)'],
		viewsToday: 640,
		attendees: 180
	},
	{
		id: 'e-gastro',
		slug: 'fusion-gastro-beer-fair',
		title: 'Fusion Gastro & Beer Fair',
		category: 'food',
		tags: ['Street food', 'Craft beer', 'Night market'],
		startsAt: at(17, 15),
		venue: 'Lekki Phase 1',
		city: 'Lekki, Lagos',
		cover: { from: '#9a3412', to: '#431407', icon: 'utensils-crossed' },
		description:
			'Forty kitchens, twelve craft brewers, one fiery night market. Wok flames, string lights and zero pretence.',
		organizer: people.femi,
		speakers: [],
		agenda: [{ id: 'g1', start: at(17, 15), title: 'Market opens', location: 'North Lawn' }],
		tiers: [{ id: 'tier-entry', name: 'Entry', price: 8_000, sold: 505, capacity: 1_500, benefits: 'Market access' }],
		faqs: [],
		policies: ['Family friendly till 8pm'],
		trendingRank: 3,
		viewsToday: 740,
		attendees: 505
	},
	{
		id: 'e-fintech',
		slug: 'africa-fintech-forum-26',
		title: "Africa FinTech Forum '26",
		category: 'conferences',
		tags: ['Payments', 'Policy', 'Networking'],
		startsAt: at(21, 9),
		venue: 'Eko Convention Center',
		city: 'Victoria Island, Lagos',
		cover: { from: '#1e3a8a', to: '#0ea5e9', icon: 'landmark' },
		description:
			'The continent\u2019s payments builders in one hall: rails, regulation, and the road to interoperability.',
		organizer: people.zainab,
		speakers: [people.zainab, people.amina],
		agenda: [{ id: 'f1', start: at(21, 9), title: 'Opening plenary', location: 'Hall A' }],
		tiers: [
			{ id: 'tier-standard', name: 'Standard', price: 35_000, sold: 640, capacity: 1_000 },
			{ id: 'tier-exec', name: 'Executive', price: 90_000, sold: 80, capacity: 120 }
		],
		faqs: [],
		policies: ['Business attire recommended'],
		trendingRank: 1,
		viewsToday: 1_400,
		attendees: 720
	},
	{
		id: 'e-subbase',
		slug: 'sub-bass-electronic-festival',
		title: 'Sub-Bass Electronic Festival',
		category: 'nightlife',
		tags: ['Electronic', 'Open air', '3 stages'],
		startsAt: at(37, 14),
		endsAt: at(38, 2),
		venue: 'Muri Okunola Park',
		city: 'Victoria Island, Lagos',
		cover: { from: '#0e7490', to: '#1e1b4b', icon: 'disc-3' },
		description:
			'Three open-air stages, a wall of subwoofers, and a skyline backdrop. The city\u2019s biggest electronic weekender.',
		organizer: people.femi,
		speakers: [],
		agenda: [],
		tiers: [
			{ id: 'tier-day', name: 'Day Pass', price: 18_500, sold: 2_100, capacity: 5_000 },
			{ id: 'tier-weekend', name: 'Weekend', price: 30_000, sold: 900, capacity: 2_000 }
		],
		faqs: [],
		policies: ['18+', 'Bags searched at gate'],
		trendingRank: 2,
		viewsToday: 980,
		attendees: 3_000
	},
	{
		id: 'e-craft',
		slug: 'product-craft-masterclass',
		title: 'Product Craft Masterclass',
		category: 'design',
		tags: ['Design', 'Hands-on', 'Small group'],
		startsAt: at(12, 10),
		venue: 'The Workshop Studio',
		city: 'Ikoyi, Lagos',
		cover: { from: '#831843', to: '#1e1b4b', icon: 'pen-tool' },
		description:
			'A hands-on, 30-seat masterclass on shipping polished product: critique, prototyping sprints and portfolio reviews.',
		organizer: people.chiamaka,
		speakers: [people.chiamaka, people.ngozi],
		agenda: [{ id: 'c1', start: at(12, 10), title: 'Critique circle', location: 'Studio' }],
		tiers: [{ id: 'tier-seat', name: 'Seat', price: 25_000, sold: 26, capacity: 30 }],
		faqs: [],
		policies: ['Laptops required'],
		viewsToday: 310,
		attendees: 26
	},
	{
		id: 'e-warehouse',
		slug: 'underground-warehouse-04',
		title: 'Underground Warehouse 04',
		category: 'nightlife',
		tags: ['Techno', 'Secret location', 'Live now'],
		startsAt: at(0, Math.max(0, new Date(now).getHours() - 2)),
		venue: 'Warehouse 04, Apapa Rd',
		city: 'Lagos',
		cover: { from: '#111827', to: '#312e81', icon: 'warehouse' },
		description:
			'Concrete, strobes, and a Funktion-One stack. Location revealed after checkout. 38 passes left.',
		organizer: people.femi,
		speakers: [],
		agenda: [],
		tiers: [{ id: 'tier-gate', name: 'Gate Pass', price: 10_000, sold: 262, capacity: 300 }],
		faqs: [],
		policies: ['No photos on the floor'],
		live: true,
		viewsToday: 1_120,
		attendees: 262
	},
	{
		id: 'e-artwalk',
		slug: 'surulere-street-art-walk',
		title: 'Surulere Street Art Walk',
		category: 'design',
		tags: ['Art', 'Walking tour', 'Free'],
		startsAt: at(8, 15),
		venue: 'Adeniran Ogunsanya St',
		city: 'Surulere, Lagos',
		cover: { from: '#3f6212', to: '#0f172a', icon: 'brush' },
		description:
			'A guided 3 km walk through Surulere\u2019s mural district with the painters themselves.',
		organizer: people.chiamaka,
		speakers: [people.chiamaka],
		agenda: [],
		tiers: [{ id: 'tier-free', name: 'Walker', price: 0, sold: 74, capacity: 120 }],
		faqs: [],
		policies: ['Wear comfortable shoes'],
		viewsToday: 220,
		attendees: 74
	}
];

/* ── Organizer-side seed: Ada runs "Yaba Rooftop Sessions" ─────────── */

export const attendeePool = [
	'Chioma Obi',
	'Tunde Bakare',
	'Bisi Alabi',
	'Kunle Adeyemo',
	'Amara Nwosu',
	'Emeka Ozo',
	'Lola Shittu',
	'Ibrahim Bello',
	'Tola Ogundana',
	'Mary Ene',
	'Dayo Akande',
	'Zainab Musa',
	'Ngozi Eze',
	'Femi Adeyemi'
];

export const rooftopEvent: EventItem = {
	id: 'e-rooftop',
	slug: 'yaba-rooftop-sessions',
	title: 'Yaba Rooftop Sessions',
	category: 'music',
	tags: ['Live', 'Rooftop', 'Alté'],
	startsAt: at(0, Math.max(0, new Date(now).getHours() - 1)),
	endsAt: at(0, 23),
	venue: 'Rooftop @44',
	city: 'Yaba, Lagos',
	cover: { from: '#7c2d12', to: '#312e81', icon: 'audio-waveform' },
	description:
		'A live alté & soul rooftop session over the Yaba skyline. Two stages, a record fair, and the best jollof in the mainland.',
	organizer: people.ada,
	speakers: [people.tunde],
	agenda: [
		{ id: 'r1', start: at(0, 17), title: 'Doors & soundcheck', location: 'Gate 1' },
		{ id: 'r2', start: at(0, 19), title: 'Live band set', location: 'Main Stage' }
	],
	tiers: [
		{ id: 'tier-gen', name: 'General', price: 12_000, sold: 320, capacity: 450, benefits: 'Roof access + one drink' },
		{ id: 'tier-vip', name: 'VIP Lounge', price: 30_000, sold: 84, capacity: 100, benefits: 'Lounge, open bar, meet the artists' }
	],
	faqs: [],
	policies: ['18+ only', 'No re-entry after 10pm'],
	live: true,
	viewsToday: 860,
	attendees: 404
};
events.push(rooftopEvent);

const rooftopCodes = [
	'EV-RT41-AAAA-0001',
	'EV-RT41-AAAA-0002',
	'EV-RT41-AAAA-0003',
	'EV-RT41-AAAA-0004',
	'EV-RT41-AAAA-0005',
	'EV-RT41-AAAA-0006',
	'EV-RT41-AAAA-0007',
	'EV-RT41-AAAA-0008',
	'EV-RT41-AAAA-0009',
	'EV-RT41-AAAA-0010',
	'EV-RT41-AAAA-0011',
	'EV-RT41-AAAA-0012'
];

export const rooftopTickets: Ticket[] = attendeePool.map((name, i) => ({
	id: `t-roof-${i + 1}`,
	code: rooftopCodes[i] ?? `EV-RT41-AAAA-${String(i + 1).padStart(4, '0')}`,
	eventId: 'e-rooftop',
	eventSlug: 'yaba-rooftop-sessions',
	eventTitle: 'Yaba Rooftop Sessions',
	eventStartsAt: rooftopEvent.startsAt,
	venue: 'Rooftop @44',
	tierName: i % 4 === 0 ? 'VIP Lounge' : 'General',
	holder: name,
	status: i < 6 ? 'used' : 'valid',
	purchasedAt: at(-2 - (i % 5), 10 + i),
	price: i % 4 === 0 ? 30_000 : 12_000,
	cover: rooftopEvent.cover
}));

export const checkins: Checkin[] = rooftopTickets
	.filter((t) => t.status === 'used')
	.map((t, i) => ({
		id: `ck-${i + 1}`,
		eventId: 'e-rooftop',
		ticketCode: t.code,
		holder: t.holder,
		tier: t.tierName,
		gate: i % 3 === 0 ? 'Gate 2 • Staff Scanner' : 'Gate 1 • Fast-Pass',
		at: at(0, Math.max(0, new Date(now).getHours() - 1) + Math.floor(i / 4)),
		result: 'verified'
	}));

export const orders: Order[] = [
	{ id: 'ord-1', reference: 'OWT-90412', eventId: 'e-rooftop', buyer: 'Chioma Obi', itemsLabel: '2x VIP Lounge', total: 60_000, status: 'paid', at: at(-6, 13) },
	{ id: 'ord-2', reference: 'OWT-90413', eventId: 'e-rooftop', buyer: 'Tunde Bakare', itemsLabel: '1x General', total: 12_000, status: 'paid', at: at(-5, 18) },
	{ id: 'ord-3', reference: 'OWT-90414', eventId: 'e-rooftop', buyer: 'Bisi Alabi', itemsLabel: '4x General', total: 48_000, status: 'paid', at: at(-4, 9) },
	{ id: 'ord-4', reference: 'OWT-90415', eventId: 'e-rooftop', buyer: 'Kunle Adeyemo', itemsLabel: '1x VIP Lounge', total: 30_000, status: 'refunded', at: at(-3, 21) }
];

export const tickets: Ticket[] = [
	{
		id: 't-afrobeats-ada',
		code: 'EV-7QK2-4M8P-9XRT',
		eventId: 'e-afrobeats',
		eventSlug: 'afrobeats-sound-sunset',
		eventTitle: 'Afrobeats & Sound Sunset',
		eventStartsAt: at(5, 16),
		venue: 'Landmark Beach',
		tierName: 'General',
		holder: 'Ada Obi',
		status: 'valid',
		purchasedAt: at(-3, 20),
		price: 15_000,
		cover: { from: '#b45309', to: '#7c2d12', icon: 'audio-waveform' }
	},
	{
		id: 't-warehouse-ada',
		code: 'EV-2NBD-8KQS-5WYZ',
		eventId: 'e-warehouse',
		eventSlug: 'underground-warehouse-04',
		eventTitle: 'Underground Warehouse 04',
		eventStartsAt: at(0, 20),
		venue: 'Warehouse 04, Apapa Rd',
		tierName: 'Gate Pass',
		holder: 'Ada Obi',
		status: 'valid',
		purchasedAt: at(-1, 12),
		price: 10_000,
		cover: { from: '#111827', to: '#312e81', icon: 'warehouse' }
	},
	{
		id: 't-meetup-ada',
		code: 'EV-9HTM-3XWC-7PLK',
		eventId: 'e-hackathon',
		eventSlug: 'deep-tech-hackathon-2026',
		eventTitle: 'Deep Tech Hackathon 2026',
		eventStartsAt: at(1, 8),
		venue: 'Lagos Innovation Hub',
		tierName: 'Builder Pass',
		holder: 'Ada Obi',
		status: 'valid',
		purchasedAt: at(-6, 9),
		price: 0,
		cover: { from: '#065f46', to: '#0f172a', icon: 'terminal' }
	}
];

export const conversations: Conversation[] = [
	{
		id: 'c-amina',
		peer: people.amina,
		lastMessage: 'See you at the gate — bring a valid ID for badge pickup 🙂',
		lastAt: at(0, 9, 42),
		unread: 2,
		online: true
	},
	{
		id: 'c-tunde',
		peer: people.tunde,
		lastMessage: 'Omo the warehouse set last night was mental 🔥',
		lastAt: at(-1, 22, 15),
		unread: 0
	},
	{
		id: 'c-support',
		peer: {
			id: 'u-support',
			handle: 'owltside',
			name: 'Owltside Support',
			avatarColor: '#4cd7f6',
			verified: true,
			followers: 0,
			following: 0
		},
		lastMessage: 'Your refund for Fusion Gastro was processed to your bank.',
		lastAt: at(-2, 11, 5),
		unread: 0
	}
];

export const messageRequests: MessageRequest[] = [];

export const messages: Record<string, Message[]> = {
	'c-amina': [
		{ id: 'm1', conversationId: 'c-amina', senderId: 'u-ada', body: 'Dr. Bello! Just grabbed a Regular pass for the Summit 🙌', sentAt: at(0, 9, 12) },
		{ id: 'm2', conversationId: 'c-amina', senderId: 'u-amina', body: 'Love to see it, Ada. The keynote will have a live demo this year.', sentAt: at(0, 9, 30) },
		{ id: 'm3', conversationId: 'c-amina', senderId: 'u-amina', body: 'See you at the gate — bring a valid ID for badge pickup 🙂', sentAt: at(0, 9, 42) }
	],
	'c-tunde': [
		{ id: 'm4', conversationId: 'c-tunde', senderId: 'u-tunde', body: 'Omo the warehouse set last night was mental 🔥', sentAt: at(-1, 22, 15) },
		{ id: 'm5', conversationId: 'c-tunde', senderId: 'u-ada', body: 'Tell me something I don\u2019t know. Next time you\u2019re not hiding in the smoking area.', sentAt: at(-1, 22, 40) }
	],
	'c-support': [
		{ id: 'm6', conversationId: 'c-support', senderId: 'u-support', body: 'Your refund for Fusion Gastro was processed to your bank.', sentAt: at(-2, 11, 5) }
	]
};

export const notifications: NotificationItem[] = [
	{ id: 'n1', kind: 'ticket', title: 'Pass issued', body: 'Your Gate Pass for Underground Warehouse 04 is in your wallet.', at: at(-1, 12, 2), read: false },
	{ id: 'n2', kind: 'event', title: 'Selling fast', body: 'Afrobeats & Sound Sunset: 86% of General passes are gone.', at: at(0, 8, 0), read: false },
	{ id: 'n3', kind: 'social', title: 'Dr. Amina Bello replied', body: '“See you at the gate — bring a valid ID…”', at: at(0, 9, 42), read: false },
	{ id: 'n4', kind: 'promo', title: 'Early-bird window', body: "Africa FinTech Forum '26 standard passes rise ₦5,000 on Friday.", at: at(-1, 17, 30), read: true },
	{ id: 'n5', kind: 'system', title: 'Offline wallet ready', body: 'Your passes verify at the gate without internet.', at: at(-3, 10, 0), read: true }
];
