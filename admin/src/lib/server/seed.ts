import type {
	AdminApproval,
	AdminCase,
	AdminReport,
	AdminEvent,
	AdminOrder,
	AdminOrganizer,
	AdminRefund,
	AdminStaff,
	AdminTicket,
	AdminUser,
	AuditRecord,
	PlatformStatus,
	SettingsData
} from '$admin/types';

/**
 * Deterministic platform seed for the Owltside control plane.
 *
 * Every record is generated from a fixed PRNG seed anchored to the current
 * request day, so the demo behaves like a live platform: pagination, search,
 * filters and mutations all operate on a realistic 18k-user / 4.8k-ticket
 * dataset. Mutations live in memory for the lifetime of the server process.
 */

const HOUR = 3_600_000;

export interface StoreState {
	organizers: AdminOrganizer[];
	events: AdminEvent[];
	tickets: AdminTicket[];
	orders: AdminOrder[];
	users: AdminUser[];
	refunds: AdminRefund[];
	approvals: AdminApproval[];
	reports: AdminReport[];
	cases: AdminCase[];
	staff: AdminStaff[];
	audit: AuditRecord[];
	settings: SettingsData;
}

/** Financial snapshot behind the headline KPIs (30-day window). */
export const FINANCIALS = {
	grossNgn: 142_850_000,
	settledNgn: 136_420_000,
	commissionNgn: 9_285_250,
	escrowNgn: 127_134_750,
	refundedNgn: 6_430_000,
	feeRatePct: 6.5,
	grossDeltaPct: 14.8,
	settledPct: 95.5,
	pendingNgn: 4_830_000,
	failedNgn: 1_600_000,
	disputeRatePct: 0.02,
	grossTxnCount: 4_912
};

type Rand = () => number;

function mulberry32(seed: number): Rand {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
}

const rand = mulberry32(0x4f574c54);
const rint = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const chance = (p: number) => rand() < p;

function lagosWallClock(now: Date): Date {
	return new Date(now.getTime() + HOUR);
}

function atLocal(now: Date, dayOffset: number, hour: number, minute = 0): string {
	const wall = lagosWallClock(now);
	return new Date(
		Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + dayOffset, hour - 1, minute, 0)
	).toISOString();
}

function minutesAgo(now: Date, minutes: number): string {
	return new Date(now.getTime() - minutes * 60_000).toISOString();
}

function daysAgo(now: Date, days: number, hour = 12): string {
	return atLocal(now, -days, hour, 0);
}

const CATEGORY_ART: Record<string, { from: string; to: string; icon: string }> = {
	'Tech & AI': { from: '#1b2a4a', to: '#43318a', icon: 'cpu' },
	Music: { from: '#3a1428', to: '#7c2246', icon: 'music' },
	Conferences: { from: '#142a2e', to: '#155e63', icon: 'presentation' },
	Meetups: { from: '#1f2a1c', to: '#2f5d3a', icon: 'users' },
	Nightlife: { from: '#2b1733', to: '#5b2a7a', icon: 'moon-star' },
	Workshops: { from: '#2e2414', to: '#6b4a17', icon: 'wrench' },
	Founders: { from: '#2a1d16', to: '#6b3a1e', icon: 'rocket' },
	Weddings: { from: '#2a1f2b', to: '#6d4a67', icon: 'heart' }
};

const PALETTE = ['#c6bcff', '#8dd3c7', '#f2b880', '#b5a4ff', '#7dd3fc', '#f7a1a1', '#a3e635', '#f0abfc'];

const FIRST = [
	'Alex', 'Amina', 'Chinelo', 'Tunde', 'Folake', 'Emeka', 'Kelechi', 'Babatunde', 'Joy', 'Chukwudi',
	'Victor', 'Damilola', 'Ngozi', 'Ibrahim', 'Zainab', 'Aisha', 'Bola', 'Simi', 'Amara', 'Mide',
	'Sade', 'Tobi', 'Uche', 'Nneka', 'Segun', 'Lamide', 'Funmi', 'Efe', 'Osaze', 'Ifeoma',
	'Kofi', 'Adaeze', 'Femi', 'Yemi', 'Chinedu', 'Halima', 'Obi', 'Ruth', 'Samuel', 'Grace',
	'Daniel', 'Peace', 'Kelvin', 'Esther', 'Musa', 'Tolu', 'Nkem', 'Ayo', 'Bisi', 'Chris'
];
const LAST = [
	'Adeyemi', 'Okonkwo', 'Balogun', 'Eze', 'Okafor', 'Bello', 'Sanusi', 'Okeke', 'Ogunleye', 'Nwosu',
	'Abubakar', 'Adeleke', 'Rivera', 'Mensah', 'Osei', 'Achebe', 'Obi', 'Ibrahim', 'Onwudiwe', 'Fashola',
	'Aluko', 'Ekwueme', 'Ojo', 'Ezeani', 'Yusuf', 'Ogbonna', 'Ajayi', 'Olawale', 'Umeh', 'Oyelaran'
];

const CITIES = [
	{ city: 'Lagos', state: 'Lagos' },
	{ city: 'Abuja', state: 'FCT' },
	{ city: 'Port Harcourt', state: 'Rivers' },
	{ city: 'Ibadan', state: 'Oyo' },
	{ city: 'Kano', state: 'Kano' },
	{ city: 'Enugu', state: 'Enugu' },
	{ city: 'Benin City', state: 'Edo' },
	{ city: 'Accra', state: 'Greater Accra' },
	{ city: 'Kigali', state: 'Kigali' },
	{ city: 'Lekki', state: 'Lagos' },
	{ city: 'Ikeja', state: 'Lagos' },
	{ city: 'Uyo', state: 'Akwa Ibom' }
];

const DOMAINS = ['gmail.com', 'outlook.com', 'yahoo.com', 'proton.me', 'hey.com', 'icloud.com'];

const VENUES = [
	{ venue: 'Landmark Centre', city: 'Victoria Island, Lagos' },
	{ venue: 'Eko Atlantic Convention Hall', city: 'Victoria Island, Lagos' },
	{ venue: 'Landmark Hall 1', city: 'Victoria Island, Lagos' },
	{ venue: 'Nike Art Gallery', city: 'Lekki, Lagos' },
	{ venue: 'Terra Kulture', city: 'Victoria Island, Lagos' },
	{ venue: 'The Wheatbaker', city: 'Ikoyi, Lagos' },
	{ venue: 'Muri Okunola Park', city: 'Victoria Island, Lagos' },
	{ venue: 'Federal Palace Hotel', city: 'Victoria Island, Lagos' },
	{ venue: 'Zone Tech Park', city: 'Gbagada, Lagos' },
	{ venue: 'Yaba Tech Hub', city: 'Yaba, Lagos' },
	{ venue: 'Abuja International Conference Centre', city: 'Abuja' },
	{ venue: 'Kigali Convention Centre', city: 'Kigali, Rwanda' }
];

const EVENT_WORDS_A = [
	'Pulse', 'Autonomous', 'Lagos', 'DevOps', 'AfroBeats', 'Crypto', 'Eko', 'AI', 'CloudOps', 'Founders',
	'Design', 'Tech', 'Product', 'Growth', 'Data', 'Fintech', 'Web3', 'Creative', 'Media', 'Startup',
	'Future', 'Digital', 'Brand', 'Retail', 'Health', 'Climate', 'Music', 'Film', 'Gaming', 'Talent'
];
const EVENT_WORDS_B = [
	'Summit', 'Night', 'Expo', 'Meetup', 'Conference', 'Bootcamp', 'Festival', 'Forum', 'Showcase', 'Roundtable',
	'Week', 'Gala', 'Workshop', 'Mixer', 'Awards', 'Clinic', 'Retreat', 'Series', 'Live', 'Sessions'
];

const ORG_PREFIX = [
	'Sahara', 'Mavrix', 'CloudOps', 'LagosAI', 'Apex', 'SoundGate', 'Eko', 'Kigali', 'Zenith', 'TechHub',
	'AMA', 'GreenField', 'Naija Sound', 'Pixel Forge', 'Zuri', 'Surulere', 'Kano Creative', 'Bluewave',
	'Octave', 'Northline', 'Village', 'Harmony', 'Brightline', 'Cedar', 'Elevate', 'Momentum', 'Anchor',
	'Cavalry', 'Drift', 'Ember', 'Falcon', 'Grove', 'Harbor', 'Indigo', 'Juniper', 'Kiln', 'Lumen'
];
const ORG_SUFFIX = ['Labs', 'Entertainment', 'Events', 'Collective', 'Studios', 'Alliance', 'Network', 'Group', 'Live', 'Productions'];

const TIER_BY_CATEGORY: Record<string, { name: string; priceNgn: number }[]> = {
	'Tech & AI': [
		{ name: 'Early Bird', priceNgn: 15_000 },
		{ name: 'Regular Access', priceNgn: 25_000 },
		{ name: 'VIP Full Access', priceNgn: 65_000 }
	],
	Conferences: [
		{ name: 'Early Bird', priceNgn: 25_000 },
		{ name: 'General Pass', priceNgn: 45_000 },
		{ name: 'VIP Delegate', priceNgn: 120_000 }
	],
	Meetups: [
		{ name: 'General Pass', priceNgn: 10_000 },
		{ name: 'Supporter', priceNgn: 25_000 },
		{ name: 'Founder Table', priceNgn: 60_000 }
	],
	Music: [
		{ name: 'Regular Pass', priceNgn: 25_000 },
		{ name: 'Backstage', priceNgn: 35_000 },
		{ name: 'VIP Table', priceNgn: 80_000 }
	],
	Nightlife: [
		{ name: 'Entry', priceNgn: 15_000 },
		{ name: 'Premium', priceNgn: 40_000 },
		{ name: 'Table Service', priceNgn: 100_000 }
	],
	Workshops: [
		{ name: 'Workshop Pass', priceNgn: 20_000 },
		{ name: 'Team of 3', priceNgn: 50_000 }
	],
	Founders: [
		{ name: 'Founder Access', priceNgn: 75_000 },
		{ name: 'Investor Table', priceNgn: 150_000 }
	],
	Weddings: [
		{ name: 'General Entry', priceNgn: 10_000 },
		{ name: 'VIP Couple', priceNgn: 45_000 }
	]
};

function personName(): string {
	return `${pick(FIRST)} ${pick(LAST)}`;
}

function handleFor(name: string, n: number): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z\s]/g, '')
			.trim()
			.split(/\s+/)
			.join('_') + (n % 3 === 0 ? String(10 + (n % 89)) : '')
	);
}

function emailFor(name: string, domain?: string): string {
	const slug = name.toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '.');
	return `${slug}@${domain ?? pick(DOMAINS)}`;
}

function phoneFor(n: number): string {
	const prefix = pick(['803', '806', '810', '814', '816', '703', '706', '813', '903', '909']);
	const a = String(100 + (n % 900)).padStart(3, '0');
	const b = String(1000 + ((n * 37) % 9000));
	return `+234 ${prefix} ${a} ${b}`;
}

function ngnK(n: number): number {
	return n * 1000;
}

function coverFor(category: string) {
	return CATEGORY_ART[category] ?? CATEGORY_ART['Tech & AI'];
}

function orgInitials(name: string): string {
	const words = name.split(/\s+/);
	return ((words[0]?.[0] ?? 'O') + (words[1]?.[0] ?? '')).toUpperCase();
}

// ── Organizers ──────────────────────────────────────────────────────────────

function makeOrganizers(now: Date): AdminOrganizer[] {
	const explicit: AdminOrganizer[] = [
		{
			id: 'org-sahara',
			name: 'SaharaTech Labs',
			legalName: 'SaharaTech Labs Ltd',
			slug: 'saharatech',
			cacRegNumber: 'RC-1049284',
			tin: 'TIN-2918472-001',
			tier: 1,
			status: 'verified',
			city: 'Lagos',
			state: 'Lagos',
			contactName: 'Dr. Amina Bello',
			contactEmail: 'ops@saharatech.io',
			contactPhone: '+234 802 111 9020',
			eventsCount: 6,
			ticketsSold: 1840,
			grossVolumeNgn: 420_000_000,
			escrowHeldNgn: 3_420_000,
			settlementBank: 'Zenith Bank',
			settlementAccountLast4: '9012',
			settlementState: 'linked',
			risk: 'low',
			verifiedDocs: 4,
			requiredDocs: 4,
			lastPayoutAt: daysAgo(now, 2, 10),
			createdAt: daysAgo(now, 840, 10)
		},
		{
			id: 'org-mavrix',
			name: 'Mavrix Entertainment',
			legalName: 'Mavrix Entertainment Ltd',
			slug: 'mavrix',
			cacRegNumber: 'RC-1049281',
			tin: 'TIN-3382910-002',
			tier: 1,
			status: 'verified',
			city: 'Lagos',
			state: 'Lagos',
			contactName: 'Chidi Eke',
			contactEmail: 'c.eke@mavrixlive.com',
			contactPhone: '+234 806 442 1180',
			eventsCount: 12,
			ticketsSold: 1420,
			grossVolumeNgn: 240_000_000,
			escrowHeldNgn: 12_800_000,
			settlementBank: 'Access Bank',
			settlementAccountLast4: '4821',
			settlementState: 'linked',
			risk: 'low',
			verifiedDocs: 4,
			requiredDocs: 4,
			lastPayoutAt: daysAgo(now, 5, 9),
			createdAt: daysAgo(now, 1240, 11)
		},
		{
			id: 'org-cloudops',
			name: 'CloudOps Alliance',
			legalName: 'CloudOps Alliance Ltd',
			slug: 'cloudops',
			cacRegNumber: 'RC-1400219',
			tin: 'TIN-8821043-001',
			tier: 1,
			status: 'verified',
			city: 'Port Harcourt',
			state: 'Rivers',
			contactName: 'Damilola Adegboke',
			contactEmail: 'infra@cloudops.africa',
			contactPhone: '+234 703 290 6712',
			eventsCount: 4,
			ticketsSold: 820,
			grossVolumeNgn: 112_000_000,
			escrowHeldNgn: 0,
			settlementBank: 'GTBank',
			settlementAccountLast4: '1109',
			settlementState: 'linked',
			risk: 'low',
			verifiedDocs: 4,
			requiredDocs: 4,
			lastPayoutAt: daysAgo(now, 1, 14),
			createdAt: daysAgo(now, 690, 15)
		},
		{
			id: 'org-lagosai',
			name: 'LagosAI Community',
			legalName: 'LagosAI Community Initiative',
			slug: 'lagosai',
			cacRegNumber: 'NGO-829104',
			tier: 2,
			status: 'verified',
			city: 'Lagos',
			state: 'Lagos',
			contactName: 'Fisayo Peters',
			contactEmail: 'fisayo@lagosai.org',
			contactPhone: '+234 814 802 3390',
			eventsCount: 9,
			ticketsSold: 540,
			grossVolumeNgn: 85_000_000,
			escrowHeldNgn: 0,
			settlementBank: 'Kuda MFB',
			settlementAccountLast4: '7401',
			settlementState: 'linked',
			risk: 'low',
			verifiedDocs: 3,
			requiredDocs: 3,
			lastPayoutAt: daysAgo(now, 3, 12),
			createdAt: daysAgo(now, 920, 9)
		},
		{
			id: 'org-apex',
			name: 'Apex Yield Ventures',
			legalName: 'Apex Yield Ventures Ltd',
			slug: 'apex-yield',
			cacRegNumber: 'RC-928194',
			tin: 'TIN-2849102-0001',
			tier: 2,
			status: 'flagged',
			city: 'Lagos',
			state: 'Lagos',
			contactName: 'Kelechi Okafor',
			contactEmail: 'kelechi@apexyield.ng',
			contactPhone: '+234 802 774 5120',
			eventsCount: 1,
			ticketsSold: 200,
			grossVolumeNgn: 75_000_000,
			escrowHeldNgn: 10_752_500,
			settlementBank: 'Zenith Bank PLC',
			settlementAccountLast4: '1920',
			settlementState: 'conflict',
			risk: 'high',
			verifiedDocs: 3,
			requiredDocs: 4,
			createdAt: daysAgo(now, 240, 16),
			flagReason: 'Beneficiary name mismatch',
			beneficiaryMismatch: true
		},
		{
			id: 'org-soundgate',
			name: 'SoundGate Promoters',
			legalName: 'SoundGate Promotions Ltd',
			slug: 'soundgate',
			cacRegNumber: 'RC-772041',
			tier: 1,
			status: 'pending',
			city: 'Lagos',
			state: 'Lagos',
			contactName: 'Segun Alabi',
			contactEmail: 'segun@soundgate.africa',
			contactPhone: '+234 810 119 4402',
			eventsCount: 4,
			ticketsSold: 260,
			grossVolumeNgn: 18_500_000,
			escrowHeldNgn: 1_980_000,
			settlementBank: 'Wema Bank',
			settlementAccountLast4: '6620',
			settlementState: 'pending',
			risk: 'high',
			verifiedDocs: 2,
			requiredDocs: 4,
			createdAt: daysAgo(now, 150, 11)
		},
		{
			id: 'org-ekovibes',
			name: 'Eko Vibes Ltd',
			legalName: 'Eko Vibes Entertainment Ltd',
			slug: 'eko-vibes',
			cacRegNumber: 'RC-1992841',
			tier: 2,
			status: 'verified',
			city: 'Lagos',
			state: 'Lagos',
			contactName: 'Tolu Adebayo',
			contactEmail: 'hello@ekovibes.com',
			contactPhone: '+234 806 223 9910',
			eventsCount: 7,
			ticketsSold: 610,
			grossVolumeNgn: 96_000_000,
			escrowHeldNgn: 0,
			settlementBank: 'First Bank',
			settlementAccountLast4: '3392',
			settlementState: 'linked',
			risk: 'low',
			verifiedDocs: 4,
			requiredDocs: 4,
			lastPayoutAt: daysAgo(now, 4, 13),
			createdAt: daysAgo(now, 580, 10)
		},
		{
			id: 'org-kigali',
			name: 'Kigali Mesh Research',
			legalName: 'Kigali Mesh Research Ltd',
			slug: 'kigali-mesh',
			cacRegNumber: 'RDB-1092841',
			tier: 2,
			status: 'verified',
			city: 'Kigali',
			state: 'Kigali',
			contactName: 'Eric Niyonsaba',
			contactEmail: 'eric@kigalimesh.rw',
			contactPhone: '+250 788 290 114',
			eventsCount: 3,
			ticketsSold: 220,
			grossVolumeNgn: 42_000_000,
			escrowHeldNgn: 0,
			settlementBank: 'Access Bank',
			settlementAccountLast4: '1120',
			settlementState: 'linked',
			risk: 'low',
			verifiedDocs: 4,
			requiredDocs: 4,
			lastPayoutAt: daysAgo(now, 6, 9),
			createdAt: daysAgo(now, 470, 15)
		},
		{
			id: 'org-zenithlive',
			name: 'Zenith Live Experiences',
			legalName: 'Zenith Live Experiences Ltd',
			slug: 'zenith-live',
			cacRegNumber: 'RC-1840292',
			tier: 1,
			status: 'verified',
			city: 'Abuja',
			state: 'FCT',
			contactName: 'Halima Yusuf',
			contactEmail: 'halima@zenithlive.ng',
			contactPhone: '+234 803 552 7810',
			eventsCount: 5,
			ticketsSold: 340,
			grossVolumeNgn: 38_000_000,
			escrowHeldNgn: 0,
			settlementBank: 'UBA',
			settlementAccountLast4: '2081',
			settlementState: 'linked',
			risk: 'low',
			verifiedDocs: 4,
			requiredDocs: 4,
			lastPayoutAt: daysAgo(now, 7, 10),
			createdAt: daysAgo(now, 1020, 12)
		},
		{
			id: 'org-techhub',
			name: 'TechHub Yaba',
			legalName: 'TechHub Yaba Foundation',
			slug: 'techhub-yaba',
			cacRegNumber: 'NGO-402118',
			tier: 2,
			status: 'verified',
			city: 'Lagos',
			state: 'Lagos',
			contactName: 'Nnamdi Obi',
			contactEmail: 'team@techhubyaba.org',
			contactPhone: '+234 814 771 0932',
			eventsCount: 11,
			ticketsSold: 900,
			grossVolumeNgn: 54_000_000,
			escrowHeldNgn: 0,
			settlementBank: 'Stanbic IBTC',
			settlementAccountLast4: '5510',
			settlementState: 'linked',
			risk: 'low',
			verifiedDocs: 3,
			requiredDocs: 3,
			lastPayoutAt: daysAgo(now, 9, 11),
			createdAt: daysAgo(now, 1310, 9)
		},
		{
			id: 'org-naijasound',
			name: 'Naija Sound Collective',
			legalName: 'Naija Sound Collective Ltd',
			slug: 'naija-sound',
			cacRegNumber: 'RC-7740192',
			tier: 3,
			status: 'pending',
			city: 'Ibadan',
			state: 'Oyo',
			contactName: 'Yemi Oyelaran',
			contactEmail: 'yemi@naijasound.fm',
			contactPhone: '+234 706 812 7712',
			eventsCount: 2,
			ticketsSold: 90,
			grossVolumeNgn: 9_500_000,
			escrowHeldNgn: 640_000,
			settlementBank: 'Kuda MFB',
			settlementAccountLast4: '8812',
			settlementState: 'pending',
			risk: 'medium',
			verifiedDocs: 1,
			requiredDocs: 3,
			createdAt: daysAgo(now, 60, 14)
		},
		{
			id: 'org-pixelforge',
			name: 'Pixel Forge Studio',
			legalName: 'Pixel Forge Studio Ltd',
			slug: 'pixel-forge',
			cacRegNumber: 'RC-6652910',
			tier: 2,
			status: 'suspended',
			city: 'Enugu',
			state: 'Enugu',
			contactName: 'Ruth Ezeani',
			contactEmail: 'ruth@pixelforge.studio',
			contactPhone: '+234 810 662 4180',
			eventsCount: 1,
			ticketsSold: 60,
			grossVolumeNgn: 4_200_000,
			escrowHeldNgn: 0,
			settlementBank: 'Polaris Bank',
			settlementAccountLast4: '1190',
			settlementState: 'frozen',
			risk: 'medium',
			verifiedDocs: 2,
			requiredDocs: 4,
			createdAt: daysAgo(now, 210, 12)
		}
	];

	const generated: AdminOrganizer[] = [];
	let i = explicit.length;
	while (explicit.length + generated.length < 842) {
		i += 1;
		const prefix = pick(ORG_PREFIX);
		const suffix = pick(ORG_SUFFIX);
		const name = `${prefix} ${suffix}`;
		const person = personName();
		const place = pick(CITIES);
		const tier = (chance(0.18) ? 1 : chance(0.75) ? 2 : 3) as 1 | 2 | 3;
		const eventsCount = rint(0, 14);
		const sold = eventsCount === 0 ? 0 : rint(20, 2600);
		const gross = sold * rint(15, 46) * 1000;
		const status: AdminOrganizer['status'] = chance(0.86)
			? 'verified'
			: chance(0.55)
				? 'pending'
				: chance(0.7)
					? 'flagged'
					: 'suspended';
		const settlementState: AdminOrganizer['settlementState'] =
			status === 'verified' && chance(0.92) ? 'linked' : chance(0.5) ? 'pending' : chance(0.7) ? 'conflict' : 'frozen';
		generated.push({
			id: `org-${i}`,
			name,
			legalName: `${name} ${chance(0.5) ? 'Ltd' : 'Limited'}`,
			slug: `${prefix.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${i}`,
			cacRegNumber: chance(0.15) ? `NGO-${rint(100000, 999999)}` : `RC-${rint(100000, 9999999)}`,
			tier,
			status,
			city: place.city,
			state: place.state,
			contactName: person,
			contactEmail: emailFor(person, `${prefix.toLowerCase().replace(/[^a-z0-9]+/g, '')}.${chance(0.5) ? 'com' : 'africa'}`),
			contactPhone: phoneFor(i),
			eventsCount,
			ticketsSold: sold,
			grossVolumeNgn: gross,
			escrowHeldNgn: status === 'verified' ? rint(0, 12) * 250_000 : rint(1, 8) * 350_000,
			settlementBank: pick(['Zenith Bank', 'GTBank', 'Access Bank', 'UBA', 'First Bank', 'Kuda MFB', 'Wema Bank', 'Sterling']),
			settlementAccountLast4: String(rint(1000, 9999)),
			settlementState,
			risk: status === 'flagged' || status === 'suspended' ? (chance(0.5) ? 'high' : 'medium') : chance(0.08) ? 'medium' : 'low',
			verifiedDocs: status === 'verified' ? 4 : status === 'pending' ? rint(1, 3) : rint(2, 3),
			requiredDocs: 4,
			lastPayoutAt: status === 'verified' ? daysAgo(now, rint(1, 20), 10) : undefined,
			createdAt: daysAgo(now, rint(10, 1500), rint(8, 17)),
			flagReason: status === 'flagged' ? pick(['Beneficiary name mismatch', 'Chargeback spike', 'Duplicate CAC filing', 'KYC document expired']) : undefined,
			beneficiaryMismatch: status === 'flagged' && chance(0.4)
		});
	}
	return [...explicit, ...generated];
}

// ── Events ──────────────────────────────────────────────────────────────────

function eventTiers(category: string, capacity: number, sold: number, base?: { name: string; priceNgn: number }[]) {
	const catalog = base ?? TIER_BY_CATEGORY[category] ?? TIER_BY_CATEGORY['Tech & AI'];
	const tiers = catalog.map((t, index) => ({
		name: t.name,
		priceNgn: t.priceNgn,
		capacity: index === 0 ? Math.round(capacity * 0.2) : index === 1 ? Math.round(capacity * 0.65) : Math.max(20, capacity - Math.round(capacity * 0.85)),
		sold: 0
	}));
	let remaining = Math.min(sold, tiers.reduce((sum, t) => sum + t.capacity, 0));
	for (const tier of tiers) {
		const take = Math.min(tier.capacity, Math.round(remaining * (chance(0.5) ? 0.6 : 0.4)));
		tier.sold = take;
		remaining -= take;
	}
	if (remaining > 0) tiers[tiers.length - 1].sold = Math.min(tiers[tiers.length - 1].capacity, tiers[tiers.length - 1].sold + remaining);
	return tiers;
}

function makeEvents(now: Date, organizers: AdminOrganizer[]): AdminEvent[] {
	const byId = new Map(organizers.map((o) => [o.id, o]));
	const explicit: AdminEvent[] = [
		{
			id: 'evt-pulse',
			ref: 'EVT-2026-PULSE',
			slug: 'pulse-ai-web-summit-2026',
			title: 'Pulse AI & Web Summit 2026',
			category: 'Tech & AI',
			organizerId: 'org-sahara',
			organizerName: 'SaharaTech Labs',
			organizerTier: 1,
			status: 'published',
			startsAt: atLocal(now, 0, 9),
			endsAt: atLocal(now, 0, 18),
			venue: 'Landmark Centre',
			city: 'Victoria Island, Lagos',
			capacity: 1200,
			sold: 950,
			grossNgn: 61_500_000,
			tiers: [
				{ name: 'Early Bird', priceNgn: 15_000, capacity: 150, sold: 150 },
				{ name: 'Regular Access', priceNgn: 25_000, capacity: 850, sold: 700 },
				{ name: 'VIP Full Access', priceNgn: 65_000, capacity: 200, sold: 100 }
			],
			coverFrom: '#1b2a4a',
			coverTo: '#43318a',
			coverIcon: 'cpu'
		},
		{
			id: 'evt-autonomous',
			ref: 'EVT-2027-AADS',
			slug: 'autonomous-agents-distributed-systems-2027',
			title: 'Autonomous Agents & Distributed Systems 2027',
			category: 'Conferences',
			organizerId: 'org-kigali',
			organizerName: 'Kigali Mesh Research',
			organizerTier: 2,
			status: 'published',
			startsAt: atLocal(now, 84, 10),
			endsAt: atLocal(now, 86, 17),
			venue: 'Kigali Convention Centre',
			city: 'Kigali, Rwanda',
			capacity: 800,
			sold: 320,
			grossNgn: 18_400_000,
			tiers: [
				{ name: 'Early Bird', priceNgn: 25_000, capacity: 200, sold: 160 },
				{ name: 'General Pass', priceNgn: 45_000, capacity: 500, sold: 140 },
				{ name: 'VIP Delegate', priceNgn: 120_000, capacity: 100, sold: 20 }
			],
			coverFrom: '#142a2e',
			coverTo: '#155e63',
			coverIcon: 'presentation'
		},
		{
			id: 'evt-lagostech',
			ref: 'EVT-2026-LTTS',
			slug: 'lagos-tech-tribe-summit-2026',
			title: 'Lagos Tech Tribe Summit: Scaling Real-Time Inference',
			category: 'Meetups',
			organizerId: 'org-lagosai',
			organizerName: 'LagosAI Community',
			organizerTier: 2,
			status: 'published',
			startsAt: atLocal(now, 40, 11),
			endsAt: atLocal(now, 40, 18),
			venue: 'Zone Tech Park',
			city: 'Gbagada, Lagos',
			capacity: 700,
			sold: 410,
			grossNgn: 12_150_000,
			tiers: [
				{ name: 'General Pass', priceNgn: 10_000, capacity: 300, sold: 210 },
				{ name: 'Supporter', priceNgn: 25_000, capacity: 300, sold: 150 },
				{ name: 'Founder Table', priceNgn: 60_000, capacity: 100, sold: 50 }
			],
			coverFrom: '#1f2a1c',
			coverTo: '#2f5d3a',
			coverIcon: 'users'
		},
		{
			id: 'evt-devops',
			ref: 'EVT-2026-DEVCL',
			slug: 'devops-cloud-native-west-africa-2026',
			title: 'DevOps & Cloud Native West Africa 2026',
			category: 'Tech & AI',
			organizerId: 'org-cloudops',
			organizerName: 'CloudOps Alliance',
			organizerTier: 1,
			status: 'published',
			startsAt: atLocal(now, 52, 9),
			endsAt: atLocal(now, 52, 17),
			venue: 'Federal Palace Hotel',
			city: 'Victoria Island, Lagos',
			capacity: 500,
			sold: 265,
			grossNgn: 8_420_000,
			tiers: [
				{ name: 'Early Bird', priceNgn: 15_000, capacity: 100, sold: 80 },
				{ name: 'Regular Access', priceNgn: 25_000, capacity: 300, sold: 165 },
				{ name: 'VIP Full Access', priceNgn: 65_000, capacity: 100, sold: 20 }
			],
			coverFrom: '#1b2a4a',
			coverTo: '#43318a',
			coverIcon: 'cpu'
		},
		{
			id: 'evt-afrobeats',
			ref: 'EVT-2026-AFRO',
			slug: 'afrobeats-soundstage-night-2026',
			title: 'AfroBeats Soundstage Night',
			category: 'Music',
			organizerId: 'org-mavrix',
			organizerName: 'Mavrix Entertainment',
			organizerTier: 1,
			status: 'published',
			startsAt: atLocal(now, 66, 20),
			endsAt: atLocal(now, 67, 2),
			venue: 'Eko Atlantic Convention Hall',
			city: 'Victoria Island, Lagos',
			capacity: 1500,
			sold: 1180,
			grossNgn: 42_900_000,
			tiers: [
				{ name: 'Regular Pass', priceNgn: 25_000, capacity: 900, sold: 820 },
				{ name: 'Backstage', priceNgn: 35_000, capacity: 400, sold: 280 },
				{ name: 'VIP Table', priceNgn: 80_000, capacity: 200, sold: 80 }
			],
			coverFrom: '#3a1428',
			coverTo: '#7c2246',
			coverIcon: 'music'
		},
		{
			id: 'evt-crypto',
			ref: 'EVT-2026-W3FLG',
			slug: 'crypto-web3-summit-2026',
			title: 'Crypto Web3 Summit',
			category: 'Tech & AI',
			organizerId: 'org-apex',
			organizerName: 'Apex Yield Ventures',
			organizerTier: 2,
			status: 'suspended',
			startsAt: atLocal(now, -21, 9),
			endsAt: atLocal(now, -21, 18),
			venue: 'The Wheatbaker',
			city: 'Ikoyi, Lagos',
			capacity: 900,
			sold: 420,
			grossNgn: 21_000_000,
			tiers: [
				{ name: 'General Pass', priceNgn: 45_000, capacity: 600, sold: 300 },
				{ name: 'VIP Delegate', priceNgn: 120_000, capacity: 300, sold: 120 }
			],
			coverFrom: '#1b2a4a',
			coverTo: '#43318a',
			coverIcon: 'cpu',
			moderationNote: 'Policy violation — unverified payout beneficiary. Ticket sales frozen, escrow held.',
			policyFlags: ['Unverified subaccount', 'Beneficiary mismatch']
		},
		{
			id: 'evt-eko',
			ref: 'EVT-2026-EKOS',
			slug: 'eko-soundscape-experience-2026',
			title: 'Eko Soundscape Experience',
			category: 'Nightlife',
			organizerId: 'org-ekovibes',
			organizerName: 'Eko Vibes Ltd',
			organizerTier: 2,
			status: 'published',
			startsAt: atLocal(now, 30, 21),
			endsAt: atLocal(now, 31, 3),
			venue: 'Muri Okunola Park',
			city: 'Victoria Island, Lagos',
			capacity: 600,
			sold: 380,
			grossNgn: 9_800_000,
			tiers: [
				{ name: 'Entry', priceNgn: 15_000, capacity: 300, sold: 240 },
				{ name: 'Premium', priceNgn: 40_000, capacity: 250, sold: 120 },
				{ name: 'Table Service', priceNgn: 100_000, capacity: 50, sold: 20 }
			],
			coverFrom: '#2b1733',
			coverTo: '#5b2a7a',
			coverIcon: 'moon-star'
		},
		{
			id: 'evt-aifounders',
			ref: 'EVT-2026-AIFD',
			slug: 'ai-founders-masterclass-2026',
			title: 'AI Founders Masterclass',
			category: 'Workshops',
			organizerId: 'org-soundgate',
			organizerName: 'SoundGate Promoters',
			organizerTier: 1,
			status: 'pending',
			startsAt: atLocal(now, 18, 10),
			endsAt: atLocal(now, 18, 16),
			venue: 'Yaba Tech Hub',
			city: 'Yaba, Lagos',
			capacity: 300,
			sold: 0,
			grossNgn: 0,
			tiers: [
				{ name: 'Workshop Pass', priceNgn: 20_000, capacity: 200, sold: 0 },
				{ name: 'Team of 3', priceNgn: 50_000, capacity: 100, sold: 0 }
			],
			coverFrom: '#2e2414',
			coverTo: '#6b4a17',
			coverIcon: 'wrench',
			submittedAt: minutesAgo(now, 340),
			moderationNote: 'Ticket tier benefits claim must match the advertised workshop deliverables.'
		},
		{
			id: 'evt-cloudops-meetup',
			ref: 'EVT-2026-COML',
			slug: 'cloudops-meetup-lagos-2026',
			title: 'CloudOps Meetup Lagos — Incident Response',
			category: 'Meetups',
			organizerId: 'org-cloudops',
			organizerName: 'CloudOps Alliance',
			organizerTier: 1,
			status: 'pending',
			startsAt: atLocal(now, 12, 18),
			endsAt: atLocal(now, 12, 21),
			venue: 'Yaba Tech Hub',
			city: 'Yaba, Lagos',
			capacity: 250,
			sold: 0,
			grossNgn: 0,
			tiers: [{ name: 'General Pass', priceNgn: 10_000, capacity: 250, sold: 0 }],
			coverFrom: '#1f2a1c',
			coverTo: '#2f5d3a',
			coverIcon: 'users',
			submittedAt: minutesAgo(now, 120),
			moderationNote: 'Possible duplicate of an existing CloudOps listing.'
		},
		{
			id: 'evt-founders-dinner',
			ref: 'EVT-2026-FDNR',
			slug: 'founders-dinner-2026',
			title: 'Founders Dinner — Lagos',
			category: 'Founders',
			organizerId: 'org-techhub',
			organizerName: 'TechHub Yaba',
			organizerTier: 2,
			status: 'published',
			startsAt: atLocal(now, 0, 19),
			endsAt: atLocal(now, 0, 23),
			venue: 'The Wheatbaker',
			city: 'Ikoyi, Lagos',
			capacity: 120,
			sold: 84,
			grossNgn: 6_300_000,
			tiers: [
				{ name: 'Founder Access', priceNgn: 75_000, capacity: 90, sold: 74 },
				{ name: 'Investor Table', priceNgn: 150_000, capacity: 30, sold: 10 }
			],
			coverFrom: '#2a1d16',
			coverTo: '#6b3a1e',
			coverIcon: 'rocket'
		},
		{
			id: 'evt-design-systems',
			ref: 'EVT-2026-DSYS',
			slug: 'design-systems-bootcamp-2026',
			title: 'Design Systems Bootcamp',
			category: 'Workshops',
			organizerId: 'org-pixelforge',
			organizerName: 'Pixel Forge Studio',
			organizerTier: 2,
			status: 'published',
			startsAt: atLocal(now, -32, 9),
			endsAt: atLocal(now, -31, 17),
			venue: 'Nike Art Gallery',
			city: 'Lekki, Lagos',
			capacity: 260,
			sold: 140,
			grossNgn: 2_800_000,
			tiers: [
				{ name: 'Workshop Pass', priceNgn: 20_000, capacity: 200, sold: 140 },
				{ name: 'Team of 3', priceNgn: 50_000, capacity: 60, sold: 0 }
			],
			coverFrom: '#2e2414',
			coverTo: '#6b4a17',
			coverIcon: 'wrench'
		},
		{
			id: 'evt-talent',
			ref: 'EVT-2026-TTJF',
			slug: 'tech-talent-job-fair-2026',
			title: 'Tech Talent Job Fair',
			category: 'Conferences',
			organizerId: 'org-zenithlive',
			organizerName: 'Zenith Live Experiences',
			organizerTier: 1,
			status: 'published',
			startsAt: atLocal(now, -12, 9),
			endsAt: atLocal(now, -12, 17),
			venue: 'Abuja International Conference Centre',
			city: 'Abuja',
			capacity: 900,
			sold: 610,
			grossNgn: 15_250_000,
			tiers: [
				{ name: 'Early Bird', priceNgn: 25_000, capacity: 200, sold: 200 },
				{ name: 'General Pass', priceNgn: 45_000, capacity: 700, sold: 410 }
			],
			coverFrom: '#142a2e',
			coverTo: '#155e63',
			coverIcon: 'presentation'
		},
		{
			id: 'evt-pixel-night',
			ref: 'EVT-2026-PFNL',
			slug: 'pixel-forge-portfolio-night-2026',
			title: 'Pixel Forge Portfolio Night',
			category: 'Workshops',
			organizerId: 'org-pixelforge',
			organizerName: 'Pixel Forge Studio',
			organizerTier: 2,
			status: 'suspended',
			startsAt: atLocal(now, 24, 18),
			endsAt: atLocal(now, 24, 22),
			venue: 'Terra Kulture',
			city: 'Victoria Island, Lagos',
			capacity: 200,
			sold: 60,
			grossNgn: 1_200_000,
			tiers: [{ name: 'Workshop Pass', priceNgn: 20_000, capacity: 200, sold: 60 }],
			coverFrom: '#2e2414',
			coverTo: '#6b4a17',
			coverIcon: 'wrench',
			moderationNote: 'Organizer suspended pending compliance review. Sales paused.'
		},
		{
			id: 'evt-ai-clinic',
			ref: 'EVT-2026-AICL',
			slug: 'ai-product-clinic-2026',
			title: 'AI Product Clinic — Prototype Reviews',
			category: 'Workshops',
			organizerId: 'org-lagosai',
			organizerName: 'LagosAI Community',
			organizerTier: 2,
			status: 'draft',
			startsAt: atLocal(now, 34, 15),
			endsAt: atLocal(now, 34, 19),
			venue: 'Yaba Tech Hub',
			city: 'Yaba, Lagos',
			capacity: 150,
			sold: 0,
			grossNgn: 0,
			tiers: [{ name: 'Workshop Pass', priceNgn: 20_000, capacity: 150, sold: 0 }],
			coverFrom: '#2e2414',
			coverTo: '#6b4a17',
			coverIcon: 'wrench'
		},
		{
			id: 'evt-startup-week',
			ref: 'EVT-2026-LSWK',
			slug: 'lagos-startup-week-2026',
			title: 'Lagos Startup Week',
			category: 'Founders',
			organizerId: 'org-sahara',
			organizerName: 'SaharaTech Labs',
			organizerTier: 1,
			status: 'published',
			startsAt: atLocal(now, -74, 9),
			endsAt: atLocal(now, -70, 18),
			venue: 'Landmark Centre',
			city: 'Victoria Island, Lagos',
			capacity: 2000,
			sold: 1420,
			grossNgn: 44_000_000,
			tiers: [
				{ name: 'Founder Access', priceNgn: 75_000, capacity: 200, sold: 180 },
				{ name: 'Investor Table', priceNgn: 150_000, capacity: 100, sold: 40 }
			],
			coverFrom: '#2a1d16',
			coverTo: '#6b3a1e',
			coverIcon: 'rocket'
		},
		{
			id: 'evt-green-wedding',
			ref: 'EVT-2026-GWEX',
			slug: 'greenfield-wedding-expo-2026',
			title: 'GreenField Wedding Expo',
			category: 'Weddings',
			organizerId: 'org-ekovibes',
			organizerName: 'Eko Vibes Ltd',
			organizerTier: 2,
			status: 'published',
			startsAt: atLocal(now, 44, 10),
			endsAt: atLocal(now, 44, 18),
			venue: 'Federal Palace Hotel',
			city: 'Victoria Island, Lagos',
			capacity: 400,
			sold: 168,
			grossNgn: 3_120_000,
			tiers: [
				{ name: 'General Entry', priceNgn: 10_000, capacity: 300, sold: 140 },
				{ name: 'VIP Couple', priceNgn: 45_000, capacity: 100, sold: 28 }
			],
			coverFrom: '#2a1f2b',
			coverTo: '#6d4a67',
			coverIcon: 'heart'
		}
	];

	// Capacity / gross consistency for the seeded headline events.
	for (const event of explicit) {
		event.capacity = event.tiers.reduce((sum, tier) => sum + tier.capacity, 0) || event.capacity;
		event.sold = event.tiers.reduce((sum, tier) => sum + tier.sold, 0) || event.sold;
		event.grossNgn = event.tiers.reduce((sum, tier) => sum + tier.sold * tier.priceNgn, 0) || event.grossNgn;
	}

	const generated: AdminEvent[] = [];
	const targets: Record<PlatformStatus, number> = {
		published: 98,
		pending: 3,
		draft: 34,
		suspended: 7,
		completed: 0
	};
	const current: Record<PlatformStatus, number> = { published: 0, pending: 0, draft: 0, suspended: 0, completed: 0 };
	for (const event of explicit) current[event.status] += 1;
	const statuses: PlatformStatus[] = [];
	for (const status of ['published', 'pending', 'draft', 'suspended'] as PlatformStatus[]) {
		for (let i = current[status]; i < targets[status]; i++) statuses.push(status);
	}
	const categories = Object.keys(CATEGORY_ART);
	const verifiedOrganizers = organizers.filter((o) => o.status === 'verified');
	for (let i = 0; i < statuses.length; i++) {
		const status = statuses[i];
		const category = pick(categories);
		const organizer = pick(verifiedOrganizers);
		const place = pick(VENUES);
		const title = `${pick(EVENT_WORDS_A)} ${pick(EVENT_WORDS_B)} ${status === 'draft' ? '' : atLocal(now, 0, 9).slice(0, 4)}`.trim();
		const capacity = [120, 200, 300, 450, 600, 900, 1400][rint(0, 6)];
		const upcoming = status === 'draft' || status === 'pending' ? rint(5, 90) : rint(-300, 90);
		const sold = status === 'published' ? rint(Math.round(capacity * 0.15), Math.round(capacity * 0.95)) : status === 'suspended' ? rint(10, Math.round(capacity * 0.4)) : 0;
		const tiers = eventTiers(category, capacity, sold);
		const art = coverFor(category);
		generated.push({
			id: `evt-${i + 17}`,
			ref: `EVT-2026-${String(1000 + i)}`,
			slug: `event-${i + 17}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
			title,
			category,
			organizerId: organizer.id,
			organizerName: organizer.name,
			organizerTier: organizer.tier,
			status,
			startsAt: atLocal(now, upcoming, rint(9, 20)),
			endsAt: atLocal(now, upcoming + (chance(0.2) ? 1 : 0), 22),
			venue: place.venue,
			city: place.city,
			capacity,
			sold,
			grossNgn: tiers.reduce((sum, t) => sum + t.sold * t.priceNgn, 0),
			tiers,
			coverFrom: art.from,
			coverTo: art.to,
			coverIcon: art.icon,
			submittedAt: status === 'pending' ? minutesAgo(now, rint(30, 600)) : undefined
		});
	}
	return [...explicit, ...generated];
}

// ── Users ───────────────────────────────────────────────────────────────────

function makeUsers(now: Date): AdminUser[] {
	const explicit: AdminUser[] = [
		{
			id: 'usr-9021',
			handle: 'alex_rivera',
			name: 'Alex Rivera',
			email: 'alex.rivera@devops.co',
			phone: '+234 803 402 8812',
			role: 'Attendee',
			kycTier: 3,
			spendNgn: 940_000,
			ticketsCount: 14,
			ordersCount: 14,
			status: 'active',
			city: 'Victoria Island, Lagos',
			joinedAt: daysAgo(now, 640, 12),
			lastSeenAt: minutesAgo(now, 14)
		},
		{
			id: 'usr-8910',
			handle: 'amina.bello',
			name: 'Dr. Amina Bello',
			email: 'a.bello@biotech-lagos.org',
			phone: '+234 802 771 9921',
			role: 'Speaker',
			kycTier: 3,
			spendNgn: 1_250_000,
			ticketsCount: 21,
			ordersCount: 19,
			status: 'active',
			city: 'Ikoyi, Lagos',
			joinedAt: daysAgo(now, 920, 9),
			lastSeenAt: minutesAgo(now, 76)
		},
		{
			id: 'usr-7822',
			handle: 'chinelo_x',
			name: 'Chinelo Okeke',
			email: 'chinelo.design@gmail.com',
			phone: '+234 814 660 2210',
			role: 'Attendee',
			kycTier: 2,
			spendNgn: 320_000,
			ticketsCount: 11,
			ordersCount: 10,
			status: 'active',
			city: 'Lekki, Lagos',
			joinedAt: daysAgo(now, 380, 15),
			lastSeenAt: minutesAgo(now, 220)
		},
		{
			id: 'usr-6520',
			handle: 'tbakare_ops',
			name: 'Tunde Bakare',
			email: 'tbakare@eventsphere.ng',
			phone: '+234 703 118 8840',
			role: 'Organizer',
			kycTier: 3,
			spendNgn: 680_000,
			ticketsCount: 9,
			ordersCount: 9,
			status: 'active',
			city: 'Ikeja, Lagos',
			joinedAt: daysAgo(now, 810, 10),
			lastSeenAt: minutesAgo(now, 46)
		},
		{
			id: 'usr-5140',
			handle: 'adeleke_vic',
			name: 'Victor Adeleke',
			email: 'victoradeleke@proton.me',
			phone: '+234 901 440 1189',
			role: 'Attendee',
			kycTier: 1,
			spendNgn: 85_000,
			ticketsCount: 4,
			ordersCount: 4,
			status: 'blocked',
			city: 'Surulere, Lagos',
			joinedAt: daysAgo(now, 95, 18),
			lastSeenAt: daysAgo(now, 4, 11),
			flags: ['KYC blocked', 'Duplicate chargeback attempt']
		},
		{
			id: 'usr-4903',
			handle: 'folake_dev',
			name: 'Folake Adeyemi',
			email: 'folake@adeyemi.dev',
			phone: '+234 818 292 5510',
			role: 'Attendee',
			kycTier: 1,
			spendNgn: 185_000,
			ticketsCount: 3,
			ordersCount: 3,
			status: 'active',
			city: 'Yaba, Lagos',
			joinedAt: daysAgo(now, 60, 13),
			lastSeenAt: minutesAgo(now, 320)
		},
		{
			id: 'usr-4411',
			handle: 'kelechi_okafor',
			name: 'Kelechi Okafor',
			email: 'kelechi@apexnet.ng',
			phone: '+234 805 399 2201',
			role: 'Organizer',
			kycTier: 2,
			spendNgn: 120_000,
			ticketsCount: 2,
			ordersCount: 2,
			status: 'flagged',
			city: 'Lagos',
			joinedAt: daysAgo(now, 240, 11),
			lastSeenAt: daysAgo(now, 1, 16),
			flags: ['Beneficiary mismatch (organizer KYC)']
		},
		{
			id: 'usr-3390',
			handle: 'j_okon',
			name: 'Joy Okon',
			email: 'joy.okon@hey.com',
			phone: '+234 810 220 7714',
			role: 'Attendee',
			kycTier: 2,
			spendNgn: 75_000,
			ticketsCount: 5,
			ordersCount: 5,
			status: 'active',
			city: 'Uyo',
			joinedAt: daysAgo(now, 210, 9),
			lastSeenAt: hoursAgo(now, 5)
		}
	];

	const generated: AdminUser[] = [];
	const flaggedTarget = 28;
	let flagged = 0;
	for (let i = explicit.length; i < 18_420; i++) {
		const name = personName();
		const place = pick(CITIES);
		const kycTier = (chance(0.35) ? 3 : chance(0.6) ? 2 : chance(0.8) ? 1 : 0) as 0 | 1 | 2 | 3;
		const ticketsCount = rint(0, 22);
		const spend = ticketsCount * rint(10, 70) * 1000;
		const isFlagged = flagged < flaggedTarget && chance(0.12);
		if (isFlagged) flagged += 1;
		generated.push({
			id: `usr-${1000 + i}`,
			handle: handleFor(name, i),
			name,
			email: emailFor(name),
			phone: phoneFor(i),
			role: chance(0.965) ? 'Attendee' : chance(0.7) ? 'Organizer' : 'Speaker',
			kycTier,
			spendNgn: spend,
			ticketsCount,
			ordersCount: Math.max(0, ticketsCount - rint(0, 3)),
			status: isFlagged ? 'flagged' : 'active',
			city: `${place.city}`,
			joinedAt: daysAgo(now, rint(1, 1400), rint(8, 22)),
			lastSeenAt: minutesAgo(now, rint(1, 60 * 24 * 60)),
			flags: isFlagged ? [pick(['Chargeback spike', 'Bot purchase signature', 'Duplicate accounts', 'KYC document mismatch'])] : undefined
		});
	}
	return [...explicit, ...generated];
}

function hoursAgo(now: Date, hours: number): string {
	return new Date(now.getTime() - hours * HOUR).toISOString();
}

// ── Tickets ─────────────────────────────────────────────────────────────────

function makeTickets(now: Date, events: AdminEvent[], users: AdminUser[]): AdminTicket[] {
	const pulse = events.find((e) => e.id === 'evt-pulse')!;
	const eko = events.find((e) => e.id === 'evt-eko')!;
	const afro = events.find((e) => e.id === 'evt-afrobeats')!;
	const explicit: AdminTicket[] = [
		{
			id: 'tkt-9942',
			code: 'OWL-2026-AI-9942',
			holderName: 'Alex Rivera',
			holderHandle: 'alex_rivera',
			eventId: pulse.id,
			eventTitle: pulse.title,
			tierName: 'VIP Full Access',
			seat: 'Row A, Seat 14',
			status: 'valid',
			priceNgn: 65_000,
			settlement: 'Paystack',
			orderRef: 'ORD-9942-NG',
			purchasedAt: daysAgo(now, 12, 14),
		},
		{
			id: 'tkt-0012',
			code: 'OWL-2026-AI-0012',
			holderName: 'Dr. Amina Bello',
			holderHandle: 'amina.bello',
			eventId: pulse.id,
			eventTitle: pulse.title,
			tierName: 'Speaker Pass',
			seat: 'Green Room / Stage',
			status: 'valid',
			priceNgn: 0,
			settlement: 'Complementary',
			orderRef: 'ORD-9941-NG',
			purchasedAt: daysAgo(now, 20, 9),
		},
		{
			id: 'tkt-4421',
			code: 'OWL-2026-AI-4421',
			holderName: 'Chinelo Okeke',
			holderHandle: 'chinelo_x',
			eventId: pulse.id,
			eventTitle: pulse.title,
			tierName: 'Standard Pass',
			seat: 'Main Hall G',
			status: 'valid',
			priceNgn: 25_000,
			settlement: 'Paystack',
			orderRef: 'ORD-9939-NG',
			purchasedAt: daysAgo(now, 18, 11),
		},
		{
			id: 'tkt-8109',
			code: 'OWL-2026-AI-8109',
			holderName: 'Emeka Obi',
			holderHandle: 'emeka.obi',
			eventId: pulse.id,
			eventTitle: pulse.title,
			tierName: 'VIP Full Access',
			seat: 'Row C, Seat 08',
			status: 'valid',
			priceNgn: 65_000,
			settlement: 'Paystack',
			orderRef: 'ORD-9936-NG',
			purchasedAt: daysAgo(now, 9, 16),
		},
		{
			id: 'tkt-9023',
			code: 'OWL-2026-AF-9023',
			holderName: 'Folake Adeyemi',
			holderHandle: 'folake_dev',
			eventId: afro.id,
			eventTitle: afro.title,
			tierName: 'Standard Pass',
			seat: 'General Admission',
			status: 'valid',
			priceNgn: 25_000,
			settlement: 'Paystack',
			orderRef: 'ORD-9938-NG',
			purchasedAt: daysAgo(now, 6, 10)
		},
		{
			id: 'tkt-w3flg',
			code: 'OWL-2026-W3FLG',
			holderName: 'Anonymous Attendee',
			holderHandle: 'ghost_attendee',
			eventId: events.find((e) => e.id === 'evt-crypto')!.id,
			eventTitle: 'Crypto Web3 Summit',
			tierName: 'VIP Pass',
			seat: 'Voided Identity',
			status: 'void',
			priceNgn: 50_000,
			settlement: 'Paystack',
			orderRef: 'ORD-9931-NG',
			purchasedAt: daysAgo(now, 22, 12),
			flags: ['Policy breach #44', 'Refund processed']
		},
		{
			id: 'tkt-eko-1',
			code: 'OWL-2026-EK-1180',
			holderName: 'Simi Ogunleye',
			holderHandle: 'simi_o',
			eventId: eko.id,
			eventTitle: eko.title,
			tierName: 'Premium',
			seat: 'VIP Deck',
			status: 'valid',
			priceNgn: 40_000,
			settlement: 'Paystack',
			orderRef: 'ORD-9912-NG',
			purchasedAt: daysAgo(now, 4, 19)
		}
	];

	const generated: AdminTicket[] = [];
	const targets: Record<'valid' | 'void' | 'refunded' | 'transferred', number> = {
		valid: 4782,
		void: 20,
		refunded: 12,
		transferred: 6
	};
	const current = { valid: 6, void: 1, refunded: 0, transferred: 0 };
	const publishedEvents = events.filter((e) => e.status === 'published');
	const purchasableEvents = publishedEvents.length ? publishedEvents : events;
	// Ensure the most recent registrations (top of the directory) own real passes so
	// dossiers, search, and user drill-downs always resolve to live ticket records.
	const recentUsers = [...users].sort((a, b) => b.joinedAt.localeCompare(a.joinedAt)).slice(0, 80);
	let holderIndex = 0;
	for (const status of ['valid', 'void', 'refunded', 'transferred'] as const) {
		for (let i = current[status]; i < targets[status]; i++) {
			const event = pick(purchasableEvents);
			const user = holderIndex < 320 ? recentUsers[holderIndex++ % recentUsers.length] : pick(users);
			const tier = event.tiers.length ? pick(event.tiers) : { name: 'General Pass', priceNgn: 10_000 };
			const purchasedAt = daysAgo(now, rint(1, 120), rint(8, 22));
			generated.push({
				id: `tkt-g-${status}-${i}`,
				code: `OWL-2026-${event.ref.slice(-4)}-${String(4000 + i)}`,
				holderName: user.name,
				holderHandle: user.handle,
				eventId: event.id,
				eventTitle: event.title,
				tierName: tier.name,
				seat: chance(0.5) ? `Row ${pick(['A', 'B', 'C', 'D', 'E'])} · ${rint(1, 40)}` : 'General Admission',
				status,
				priceNgn: tier.priceNgn,
				settlement: tier.priceNgn === 0 ? 'Complementary' : chance(0.92) ? 'Paystack' : 'USD / Card',
				orderRef: `ORD-${String(9000 + (i % 900))}-NG`,
				purchasedAt,
			});
		}
	}
	return [...explicit, ...generated];
}

// ── Orders ──────────────────────────────────────────────────────────────────

function makeOrders(now: Date, events: AdminEvent[], users: AdminUser[]): AdminOrder[] {
	const pulse = events.find((e) => e.id === 'evt-pulse')!;
	const afro = events.find((e) => e.id === 'evt-afrobeats')!;
	const lagos = events.find((e) => e.id === 'evt-lagostech')!;
	const eko = events.find((e) => e.id === 'evt-eko')!;
	const autonomous = events.find((e) => e.id === 'evt-autonomous')!;

	const base = (
		index: number,
		customerName: string,
		customerEmail: string,
		event: AdminEvent,
		tierLabel: string,
		qty: number,
		subtotalNgn: number,
		createdAt: string,
		status: AdminOrder['status'],
		method = 'Paystack Card'
	): AdminOrder => {
		const feeNgn = Math.round(subtotalNgn * 0.023);
		return {
			id: `ord-${9942 - index}`,
			reference: `ORD-${9942 - index}-NG`,
			customerName,
			customerEmail,
			customerPhone: phoneFor(9942 - index),
			eventId: event.id,
			eventTitle: event.title,
			tierLabel,
			qty,
			subtotalNgn,
			feeNgn,
			totalNgn: subtotalNgn + feeNgn,
			gateway: chance(0.08) ? 'usd' : 'paystack',
			method,
			status,
			createdAt,
			settledAt: status === 'settled' ? createdAt : undefined,
			subaccount: `ACCT_${event.organizerName.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 12)}`,
			items: [{ label: tierLabel, qty, unitNgn: Math.round(subtotalNgn / Math.max(1, qty)) }],
			ipCountry: pick(['NG', 'NG', 'NG', 'GH', 'KE', 'GB', 'US']),
			risk: chance(0.94) ? 'low' : chance(0.7) ? 'medium' : 'high'
		};
	};

	const explicit: AdminOrder[] = [
		{
			...base(0, 'Alex Rivera', 'alex.rivera@devops.co', pulse, '1x VIP Full Access Pass', 1, 60_000, minutesAgo(now, 21), 'settled'),
			subtotalNgn: 60_000,
			feeNgn: 1_500,
			totalNgn: 61_500,
			items: [{ label: '1x VIP Full Access Pass', qty: 1, unitNgn: 60_000 }],
			promo: { code: 'PULSE_BUILDER', discountNgn: 5_000 },
			risk: 'low'
		},
		{
			...base(1, 'Dr. Amina Bello', 'aminabello@saharatech.io', lagos, '2x Early Bird', 2, 50_000, minutesAgo(now, 92), 'settled', 'Paystack Direct'),
			risk: 'low'
		},
		{
			...base(2, 'Chukwudi Eze', 'c.eze@ventures.africa', afro, '1x Backstage', 1, 35_000, minutesAgo(now, 188), 'settled'),
			risk: 'low'
		},
		{
			...base(3, 'Folake Adeyemi', 'folake@adeyemi.dev', eko, '4x General Pass', 4, 60_000, minutesAgo(now, 244), 'settled', 'Paystack Apple Pay'),
			risk: 'low'
		},
		{
			...base(4, 'Kelechi Okafor', 'kelechi@apexnet.ng', lagos, '1x Founder Table', 1, 120_000, minutesAgo(now, 330), 'settled', 'USD / Direct Transfer'),
			risk: 'medium'
		},
		{
			...base(5, 'Victor Adeleke', 'victoradeleke@proton.me', autonomous, '1x VIP Delegate', 1, 45_000, minutesAgo(now, 410), 'pending', 'Paystack Card'),
			risk: 'medium'
		},
		{
			...base(6, 'Babatunde Sanusi', 'babs@sanusi.co', afro, '2x Regular Pass', 2, 50_000, minutesAgo(now, 510), 'refunded'),
			risk: 'low'
		},
		{
			...base(7, 'Joy Okon', 'joy.okon@hey.com', autonomous, '1x Early Bird', 1, 25_000, minutesAgo(now, 640), 'pending', 'Paystack Direct'),
			risk: 'low'
		}
	];

	const generated: AdminOrder[] = [];
	const settledTarget = 4_694;
	const pendingTarget = 160;
	const failedTarget = 50;
	let settledCount = 8;
	let pendingCount = 0;
	let failedCount = 0;
	const eventPool = events.filter((e) => e.status === 'published');
	for (let i = 0; generated.length < 4_904; i++) {
		const event = pick(eventPool);
		const user = pick(users);
		const tier = event.tiers.length ? pick(event.tiers) : { name: 'General Pass', priceNgn: 10_000 };
		const qty = chance(0.78) ? 1 : chance(0.75) ? 2 : rint(3, 6);
		const subtotal = tier.priceNgn * qty;
		let status: AdminOrder['status'] = 'settled';
		if (pendingCount < pendingTarget && chance(0.032)) {
			status = 'pending';
			pendingCount += 1;
		} else if (failedCount < failedTarget && chance(0.011)) {
			status = 'failed';
			failedCount += 1;
		} else if (settledCount >= settledTarget) {
			status = pendingCount < pendingTarget ? 'pending' : 'failed';
			if (status === 'pending') pendingCount += 1;
			else failedCount += 1;
		} else {
			settledCount += 1;
		}
		const createdAt = minutesAgo(now, rint(30, 60 * 24 * 30));
		const order = base(
			8 + i,
			user.name,
			user.email,
			event,
			`${qty}x ${tier.name}`,
			qty,
			subtotal,
			createdAt,
			status,
			pick(['Paystack Card', 'Paystack Direct', 'Paystack Transfer', 'Paystack Apple Pay', 'USD / Card'])
		);
		generated.push(order);
	}
	return [...explicit, ...generated];
}

// ── Refunds ─────────────────────────────────────────────────────────────────

/**
 * Requests the public app sends to the console: ticket refunds, instant payouts
 * and identity / payout-account verification. Each one is `pending` until an
 * admin decides it, which is exactly the state the public web displays.
 */
function makeApprovals(now: Date): AdminApproval[] {
	return [
		{
			id: 'ap-refund-ada',
			kind: 'refund',
			status: 'pending',
			requesterName: 'Ada Obi',
			requesterHandle: 'ada',
			requesterEmail: 'ada@owltside.com',
			title: 'Refund · Afrobeats & Sound Sunset',
			summary: 'General pass · reason: Schedule Conflict',
			amountNgn: 15_000,
			subjectId: 't-afrobeats-ada',
			subjectLabel: 'EV-7QK2-4M8P-9XRT',
			details: [
				{ label: 'Ticket', value: 'EV-7QK2-4M8P-9XRT' },
				{ label: 'Reason', value: 'Schedule Conflict' },
				{ label: 'Context', value: 'Clashes with a work trip.' },
				{ label: 'Gate status', value: 'Never scanned' }
			],
			requestedAt: minutesAgo(now, 185),
			slaHours: 8,
			note: ''
		},
		{
			id: 'ap-payout-ada',
			kind: 'payout',
			status: 'pending',
			requesterName: 'Ada Obi',
			requesterHandle: 'ada',
			requesterEmail: 'ada@owltside.com',
			title: 'Instant payout · Yaba Rooftop Sessions',
			summary: 'Cleared settlement balance requested to GTBank ••••6789',
			amountNgn: 1_240_000,
			subjectId: 'evt-rooftop-yaba',
			subjectLabel: 'Yaba Rooftop Sessions',
			details: [
				{ label: 'Event', value: 'Yaba Rooftop Sessions' },
				{ label: 'Destination', value: 'GTBank ••••6789' },
				{ label: 'Cleared balance', value: '₦1,240,000' },
				{ label: 'KYC tier', value: 'Tier 2 · payout account verified' }
			],
			requestedAt: minutesAgo(now, 95),
			slaHours: 4,
			note: ''
		},
		{
			id: 'ap-verify-tobi',
			kind: 'verification',
			status: 'pending',
			requesterName: 'Tobi Adeyemi',
			requesterHandle: 'tobiade',
			requesterEmail: 'tobi@owltside.com',
			title: 'Identity verification',
			summary: 'NIN document submitted for review • ending 4421',
			subjectLabel: 'identity',
			details: [
				{ label: 'Check', value: 'Identity (NIN)' },
				{ label: 'Document', value: 'NIN slip + selfie' },
				{ label: 'Reference', value: '••••••••4421' },
				{ label: 'Attachment', value: 'front+back' }
			],
			requestedAt: minutesAgo(now, 62),
			slaHours: 24,
			note: ''
		},
		{
			id: 'ap-verify-ada',
			kind: 'verification',
			status: 'approved',
			requesterName: 'Ada Obi',
			requesterHandle: 'ada',
			requesterEmail: 'ada@owltside.com',
			title: 'Identity verification',
			summary: 'NIN · approved by the trust & safety team',
			subjectLabel: 'identity',
			details: [
				{ label: 'Check', value: 'Identity (NIN)' },
				{ label: 'Document', value: 'NIN' },
				{ label: 'Reviewed by', value: 'Trust & Safety' }
			],
			requestedAt: minutesAgo(now, 8_640),
			slaHours: 24,
			note: 'Document and selfie matched.',
			decidedAt: minutesAgo(now, 7_200),
			decidedBy: 'Amara Okonkwo'
		},
		{
			id: 'ap-payout-declined',
			kind: 'payout',
			status: 'rejected',
			requesterName: 'Tobi Adeyemi',
			requesterHandle: 'tobiade',
			requesterEmail: 'tobi@owltside.com',
			title: 'Instant payout · Lekki Sunset Rooftop',
			summary: 'Cleared settlement balance requested to Access Bank ••••1024',
			amountNgn: 480_000,
			subjectId: 'evt-lekki-sunset',
			subjectLabel: 'Lekki Sunset Rooftop',
			details: [
				{ label: 'Event', value: 'Lekki Sunset Rooftop' },
				{ label: 'Destination', value: 'Access Bank ••••1024' },
				{ label: 'Cleared balance', value: '₦480,000' }
			],
			requestedAt: minutesAgo(now, 2_880),
			slaHours: 4,
			note: 'Payout account name did not match the verified identity.',
			decidedAt: minutesAgo(now, 2_700),
			decidedBy: 'Amara Okonkwo'
		}
	];
}

/**
 * Reports attendees filed from the public app against an event listing or a
 * profile. They arrive `open` and stay in the queue until someone here reviews
 * them — the public app can never resolve its own report.
 */
function makeReports(now: Date): AdminReport[] {
	return [
		{
			id: 'rep-2041',
			targetType: 'event',
			targetId: 'evt-warehouse-midnight',
			targetLabel: 'Underground Warehouse 04',
			category: 'misleading',
			categoryLabel: 'Misleading or false information',
			details:
				'The lineup on the poster does not match the event page — the headliner listed here never confirmed, and the price changed after I paid.',
			reporterName: 'Tunde Bakare',
			reporterHandle: 'tundeb',
			reporterEmail: 'tunde@owltside.com',
			status: 'open',
			createdAt: minutesAgo(now, 55),
			slaHours: 24,
			context: [
				{ label: 'Listing', value: 'Underground Warehouse 04 · Apapa Rd, Lagos' },
				{ label: 'Organizer', value: '@nightfreight' },
				{ label: 'Status', value: 'Published' },
				{ label: 'Tickets sold', value: '812' }
			]
		},
		{
			id: 'rep-2038',
			targetType: 'profile',
			targetId: 'usr-kemi-live',
			targetLabel: '@kemilive',
			category: 'impersonation',
			categoryLabel: 'Impersonation or fake identity',
			details:
				'This account is pretending to be the official Kemi Live page. It is DMing people asking for transfers for tickets that do not exist.',
			reporterName: 'Ada Obi',
			reporterHandle: 'ada',
			reporterEmail: 'ada@owltside.com',
			status: 'open',
			createdAt: minutesAgo(now, 190),
			slaHours: 12,
			context: [
				{ label: 'Profile', value: '@kemilive · Kemi Adeyemi' },
				{ label: 'Account age', value: '3 days' },
				{ label: 'Followers', value: '41' },
				{ label: 'KYC', value: 'Tier 0 · unverified' }
			]
		},
		{
			id: 'rep-2032',
			targetType: 'event',
			targetId: 'evt-afterhours',
			targetLabel: 'Afterhours Boat Party',
			category: 'safety',
			categoryLabel: 'Safety or security concern',
			details:
				'The venue address on the listing is a private jetty with no licensed capacity, and no safety plan is published for a boat event.',
			reporterName: 'Chiamaka Eze',
			reporterHandle: 'chiamaka',
			reporterEmail: 'chiamaka@owltside.com',
			status: 'actioned',
			createdAt: minutesAgo(now, 2_880),
			slaHours: 24,
			context: [
				{ label: 'Listing', value: 'Afterhours Boat Party · Lekki' },
				{ label: 'Organizer', value: '@afterhoursng' },
				{ label: 'Action', value: 'Listing suspended pending permits' }
			],
			reviewerName: 'Amara Okonkwo',
			reviewNote: 'Suspended the listing until the organizer uploads a marine safety plan.',
			reviewedAt: minutesAgo(now, 2_400)
		},
		{
			id: 'rep-2021',
			targetType: 'profile',
			targetId: 'usr-noise',
			targetLabel: '@loudloud',
			category: 'spam',
			categoryLabel: 'Spam or fake account',
			details: 'Account only posts referral links and adds everyone it can find to group chats.',
			reporterName: 'Femi Adeyemi',
			reporterHandle: 'femiade',
			reporterEmail: 'femi@owltside.com',
			status: 'dismissed',
			createdAt: minutesAgo(now, 5_760),
			slaHours: 12,
			context: [
				{ label: 'Profile', value: '@loudloud · Loud Loud' },
				{ label: 'Account age', value: '14 months' },
				{ label: 'Followers', value: '1,204' }
			],
			reviewerName: 'Amara Okonkwo',
			reviewNote: 'Checked the last 30 posts — promotional, but within the guidelines.',
			reviewedAt: minutesAgo(now, 5_400)
		}
	];
}

function makeRefunds(now: Date): AdminRefund[] {
	return [
		{
			id: 'rfd-081',
			orderRef: 'REF-2026-081',
			customerName: 'Alex Rivera',
			eventTitle: 'Pulse AI & Web Summit 2026',
			amountNgn: 60_000,
			originalNgn: 61_500,
			reason: 'Travel conflict',
			status: 'pending',
			requestedAt: minutesAgo(now, 42),
			slaHours: 4,
			policyMatch: 100,
			signals: ['Inside 7-day window', 'Never scanned', 'No prior refunds'],
			note: 'Attendee submitted within valid 7-day window. Pass never redeemed.'
		},
		{
			id: 'rfd-076',
			orderRef: 'REF-2026-076',
			customerName: 'Babatunde Sanusi',
			eventTitle: 'AfroBeats Soundstage Night',
			amountNgn: 50_000,
			originalNgn: 50_000,
			reason: 'Medical emergency (certificate attached)',
			status: 'pending',
			requestedAt: minutesAgo(now, 114),
			slaHours: 2,
			policyMatch: 92,
			signals: ['Medical documentation', 'Never scanned'],
			note: 'Medical certificate reviewed and accepted by support.'
		},
		{
			id: 'rfd-074',
			orderRef: 'REF-2026-074',
			customerName: 'Anonymous Attendee',
			eventTitle: 'Crypto Web3 Summit',
			amountNgn: 50_000,
			originalNgn: 50_000,
			reason: 'Event terminated by policy',
			status: 'processing',
			requestedAt: minutesAgo(now, 246),
			slaHours: 8,
			policyMatch: 100,
			signals: ['Event suspended', 'Escrow sufficient'],
			note: 'Batch reversal queued via Paystack.'
		},
		{
			id: 'rfd-071',
			orderRef: 'REF-2026-071',
			customerName: 'Joy Okon',
			eventTitle: 'Autonomous Agents & Distributed Systems 2027',
			amountNgn: 25_000,
			originalNgn: 25_000,
			reason: 'Duplicate transaction',
			status: 'pending',
			requestedAt: minutesAgo(now, 372),
			slaHours: 12,
			policyMatch: 88,
			signals: ['Duplicate charge detected', 'Settlement in-flight']
		},
		{
			id: 'rfd-068',
			orderRef: 'REF-2026-068',
			customerName: 'Emeka Obi',
			eventTitle: 'Eko Soundscape Experience',
			amountNgn: 30_000,
			originalNgn: 40_000,
			reason: 'Partial cancellation (table of 4 → 3)',
			status: 'approved',
			requestedAt: hoursAgo(now, 26),
			slaHours: 12,
			policyMatch: 75,
			signals: ['Partial refund allowed', 'Outside 48h window (fee retained)'],
			decidedAt: hoursAgo(now, 20),
			decidedBy: 'Kemi O.'
		},
		{
			id: 'rfd-063',
			orderRef: 'REF-2026-063',
			customerName: 'Tunde Bakare',
			eventTitle: 'Tech Talent Job Fair',
			amountNgn: 45_000,
			originalNgn: 45_000,
			reason: 'Duplicate purchase',
			status: 'settled',
			requestedAt: hoursAgo(now, 40),
			slaHours: 8,
			policyMatch: 100,
			signals: ['Duplicate charge confirmed', 'Settled via Paystack'],
			decidedAt: hoursAgo(now, 34),
			decidedBy: 'Kemi O.'
		},
		{
			id: 'rfd-059',
			orderRef: 'REF-2026-059',
			customerName: 'Chinelo Okeke',
			eventTitle: 'Design Systems Bootcamp',
			amountNgn: 20_000,
			originalNgn: 20_000,
			reason: 'Change of plans',
			status: 'rejected',
			requestedAt: hoursAgo(now, 60),
			slaHours: 8,
			policyMatch: 20,
			signals: ['Outside policy window', 'Ticket already scanned'],
			decidedAt: hoursAgo(now, 52),
			decidedBy: 'Damilola A.',
			note: 'Pass redeemed on the event day; outside the 7-day window.'
		},
		{
			id: 'rfd-054',
			orderRef: 'REF-2026-054',
			customerName: 'Ibrahim Sanusi',
			eventTitle: 'Lagos Startup Week',
			amountNgn: 75_000,
			originalNgn: 75_000,
			reason: 'Visa denial',
			status: 'settled',
			requestedAt: hoursAgo(now, 72),
			slaHours: 24,
			policyMatch: 95,
			signals: ['Supporting documentation', 'Never scanned'],
			decidedAt: hoursAgo(now, 60),
			decidedBy: 'Kemi O.'
		},
		{
			id: 'rfd-048',
			orderRef: 'REF-2026-048',
			customerName: 'Zainab Abubakar',
			eventTitle: 'AfroBeats Soundstage Night',
			amountNgn: 25_000,
			originalNgn: 25_000,
			reason: 'Duplicate checkout',
			status: 'settled',
			requestedAt: daysAgo(now, 3, 14),
			slaHours: 8,
			policyMatch: 100,
			signals: ['Duplicate charge confirmed'],
			decidedAt: daysAgo(now, 3, 18),
			decidedBy: 'Kemi O.'
		},
		{
			id: 'rfd-041',
			orderRef: 'REF-2026-041',
			customerName: 'Kofi Mensah',
			eventTitle: 'Eko Soundscape Experience',
			amountNgn: 40_000,
			originalNgn: 40_000,
			reason: 'Cardholder dispute',
			status: 'rejected',
			requestedAt: daysAgo(now, 5, 9),
			slaHours: 48,
			policyMatch: 40,
			signals: ['Chargeback opened', 'Settlement frozen'],
			decidedAt: daysAgo(now, 4, 16),
			decidedBy: 'Chioma N.',
			note: 'Fraud signal — escalating to bank dispute desk.'
		},
		{
			id: 'rfd-036',
			orderRef: 'REF-2026-036',
			customerName: 'Nneka Umeh',
			eventTitle: 'GreenField Wedding Expo',
			amountNgn: 10_000,
			originalNgn: 10_000,
			reason: 'Accidental purchase',
			status: 'approved',
			requestedAt: daysAgo(now, 8, 11),
			slaHours: 24,
			policyMatch: 100,
			signals: ['Within window', 'Never scanned'],
			decidedAt: daysAgo(now, 7, 15),
			decidedBy: 'Damilola A.'
		},
		{
			id: 'rfd-029',
			orderRef: 'REF-2026-029',
			customerName: 'Segun Alabi',
			eventTitle: 'Crypto Web3 Summit',
			amountNgn: 120_000,
			originalNgn: 120_000,
			reason: 'Event cancelled',
			status: 'settled',
			requestedAt: daysAgo(now, 12, 14),
			slaHours: 72,
			policyMatch: 100,
			signals: ['Organizer default', 'Escrow sufficient'],
			decidedAt: daysAgo(now, 10, 10),
			decidedBy: 'Kemi O.'
		}
	];
}

// ── Moderation ──────────────────────────────────────────────────────────────

function makeCases(now: Date): AdminCase[] {
	return [
		{
			id: 'case-8921',
			ref: '#REP-8921',
			title: 'Fake VIP Pass Reselling',
			category: 'Ticket Scalping & Cryptographic Forgery',
			severity: 'critical',
			status: 'escalated',
			reportedBy: 'Alex Rivera (KYC Tier 3)',
			target: 'Lagos AfroRhythm Fest / SoundGate Promoters',
			targetKind: 'Event',
			createdAt: minutesAgo(now, 18),
			slaHours: 2,
			summary:
				'Reporter identified an unauthorized third-party site reselling duplicate QR passes. Three attendees presented copies that had already been redeemed.',
			evidence: [
				{ at: '13:42:09 WAT', text: 'Pass verification · DUPLICATE_PASS_PRESENTED · pass 947c…bb1f already redeemed' },
				{ at: '13:48:22 WAT', text: 'Pass verification · SAME_PASS_TWICE · reservation 381944' },
				{ at: '14:02:11 WAT', text: 'Pass verification · TIER_MISMATCH · target tier #VIP-TBL-04' }
			],
			exposureNgn: 450_000,
			escrowNgn: 2_700_000
		},
		{
			id: 'case-8912',
			ref: '#REP-8912',
			title: 'Impersonation of Corporate Entity',
			category: 'Organizer identity fraud',
			severity: 'critical',
			status: 'quarantined',
			reportedBy: 'CAC Registry Mismatch Bot',
			target: 'Apex Yield Ventures Ltd',
			targetKind: 'Organizer',
			createdAt: minutesAgo(now, 74),
			slaHours: 2,
			summary:
				'Settlement account name does not match the CAC registry record. Automated payout routing blocked pending manual verification.',
			evidence: [
				{ at: '12:20:00 WAT', text: 'NUBAN resolved name: APEX VENTURES NIGERIA' },
				{ at: '12:20:01 WAT', text: 'CAC record name: Apex Yield Ventures Ltd — verdict: mismatch' }
			],
			exposureNgn: 5_000_000,
			escrowNgn: 10_752_500
		},
		{
			id: 'case-8914',
			ref: '#REP-8914',
			title: 'Misleading Ticket Tier Benefits',
			category: 'Advertising compliance',
			severity: 'medium',
			status: 'reviewing',
			reportedBy: 'Dr. Amina Bello',
			target: 'AI Founders Masterclass 2026',
			targetKind: 'Event',
			createdAt: minutesAgo(now, 210),
			slaHours: 12,
			summary:
				'VIP tier advertises 1:1 mentor sessions that do not appear in the published agenda or speaker commitments.',
			evidence: [
				{ at: '10:58:00 WAT', text: 'Ticket benefit copy references "guaranteed investor intro".' },
				{ at: '10:58:04 WAT', text: 'Organizer FAQ states "subject to availability".' }
			],
			exposureNgn: 120_000,
			escrowNgn: 0
		},
		{
			id: 'case-8910',
			ref: '#REP-8910',
			title: 'Duplicate Event Listing Submission',
			category: 'Catalog integrity',
			severity: 'low',
			status: 'open',
			reportedBy: 'Automated Duplicate Indexer',
			target: 'CloudOps Meetup Lagos — Incident Response',
			targetKind: 'Event',
			createdAt: minutesAgo(now, 360),
			slaHours: 24,
			summary:
				'98% title and venue similarity with an existing published listing. Submitted by the same organizer 12 minutes apart.',
			evidence: [{ at: '08:42:00 WAT', text: 'Similarity 0.98 · existing event #EVT-2026-1207' }],
			exposureNgn: 0,
			escrowNgn: 0
		},
		{
			id: 'case-8908',
			ref: '#REP-8908',
			title: 'Chargeback Ring — Rapid Card Cycling',
			category: 'Payment fraud',
			severity: 'high',
			status: 'open',
			reportedBy: 'Risk Engine',
			target: '14 attendee accounts · 3 events',
			targetKind: 'User',
			createdAt: hoursAgo(now, 3),
			slaHours: 8,
			summary: 'Shared device fingerprints purchasing low-tier tickets across multiple organizer events with disputed cards.',
			evidence: [
				{ at: '11:04:00 WAT', text: 'Device fp_9c21 used across 14 accounts.' },
				{ at: '11:04:12 WAT', text: '9 chargebacks opened within 24h.' }
			],
			exposureNgn: 680_000,
			escrowNgn: 680_000
		},
		{
			id: 'case-8901',
			ref: '#REP-8901',
			title: 'Duplicate QR Pass Presentation',
			category: 'Ticket forgery',
			severity: 'high',
			status: 'resolved',
			reportedBy: 'Field Operations · Chuka N.',
			target: 'Ticket #OWL-2026-AI-4411',
			targetKind: 'Ticket',
			createdAt: hoursAgo(now, 7),
			slaHours: 2,
			summary: 'Screenshot of an already-issued QR pass presented at the venue — the pass had been redeemed 46 minutes earlier.',
			evidence: [{ at: '07:12:00 WAT', text: 'Pass registry: already redeemed at 06:26 WAT. Pass voided.' }],
			exposureNgn: 25_000,
			escrowNgn: 0,
			resolvedAt: hoursAgo(now, 6),
			resolutionNote: 'Ticket voided, attendee directed to purchase desk. No resale network identified.'
		},
		{
			id: 'case-8894',
			ref: '#REP-8894',
			title: 'Organizer Payout Beneficiary Change Request',
			category: 'Account takeover attempt',
			severity: 'high',
			status: 'reviewing',
			reportedBy: 'Policy Sentinel',
			target: 'Mavrix Entertainment',
			targetKind: 'Organizer',
			createdAt: hoursAgo(now, 9),
			slaHours: 4,
			summary: 'Payout bank change submitted from a new device outside the organizer’s approved IP range.',
			evidence: [{ at: '05:41:00 WAT', text: 'Device velocity mismatch · login from Frankfurt (DE).' }],
			exposureNgn: 12_800_000,
			escrowNgn: 12_800_000
		},
		{
			id: 'case-8889',
			ref: '#REP-8889',
			title: 'Abusive Content in Event Description',
			category: 'Community standards',
			severity: 'low',
			status: 'dismissed',
			reportedBy: 'Attendee report',
			target: 'Naija Sound Collective',
			targetKind: 'Organizer',
			createdAt: daysAgo(now, 2, 15),
			slaHours: 24,
			summary: 'Reported language reviewed against community policy and found compliant.',
			evidence: [{ at: '15:22:00 WAT', text: 'Copy review completed by Trust & Safety.' }],
			exposureNgn: 0,
			escrowNgn: 0,
			resolvedAt: daysAgo(now, 1, 10),
			resolutionNote: 'No policy violation found. Reporter notified.'
		}
	];
}

// ── Staff & audit ───────────────────────────────────────────────────────────

function makeStaff(now: Date): AdminStaff[] {
	return [
		{ id: 'adm-01', name: 'Tomiwa A.', email: 'tomiwa@owltside.com', role: 'Super Admin', tier: 0, auth: 'FIDO2 WebAuthn', status: 'active', lastActive: minutesAgo(now, 0), location: 'Victoria Island, Lagos · NG', sessions: 2 },
		{ id: 'adm-02', name: 'Chioma N.', email: 'chioma.n@owltside.com', role: 'Trust & Safety Lead', tier: 1, auth: 'Passkey + PIN', status: 'active', lastActive: minutesAgo(now, 18), location: 'Lekki Phase 1, Lagos · NG', sessions: 1 },
		{ id: 'adm-03', name: 'Fola D.', email: 'fola.ops@owltside.com', role: 'Event Operations', tier: 1, auth: 'FIDO2 WebAuthn', status: 'active', lastActive: minutesAgo(now, 84), location: 'Ikeja Control Hub · NG', sessions: 1 },
		{ id: 'adm-04', name: 'Chuka N.', email: 'chuka.ops@owltside.com', role: 'Event Operations', tier: 2, auth: 'Passkey + PIN', status: 'active', lastActive: minutesAgo(now, 9), location: 'Lagos Operations Hub · NG', sessions: 1 },
		{ id: 'adm-05', name: 'Kemi O.', email: 'kemi.finance@owltside.com', role: 'Finance & Treasury', tier: 1, auth: 'FIDO2 WebAuthn', status: 'active', lastActive: minutesAgo(now, 260), location: 'Ikoyi Treasury Desk, Lagos · NG', sessions: 1 },
		{ id: 'adm-06', name: 'Damilola A.', email: 'damilola@owltside.com', role: 'Support Agent', tier: 2, auth: 'TOTP fallback', status: 'active', lastActive: minutesAgo(now, 46), location: 'Yaba, Lagos · NG', sessions: 1 },
		{ id: 'adm-07', name: 'Ibrahim S.', email: 'ibrahim.audit@owltside.com', role: 'Read-only Auditor', tier: 3, auth: 'FIDO2 WebAuthn', status: 'invited', lastActive: daysAgo(now, 1, 10), location: 'Abuja · NG', sessions: 0 },
		{ id: 'adm-08', name: 'Zainab B.', email: 'zainab@owltside.com', role: 'Trust & Safety Lead', tier: 2, auth: 'Passkey + PIN', status: 'active', lastActive: hoursAgo(now, 2), location: 'Kano · NG', sessions: 1 },
		{ id: 'adm-09', name: 'Nneka U.', email: 'nneka.finance@owltside.com', role: 'Finance & Treasury', tier: 2, auth: 'TOTP fallback', status: 'active', lastActive: hoursAgo(now, 4), location: 'Enugu · NG', sessions: 1 },
		{ id: 'adm-10', name: 'Sade O.', email: 'sade.support@owltside.com', role: 'Support Agent', tier: 3, auth: 'Passkey + PIN', status: 'suspended', lastActive: daysAgo(now, 12, 14), location: 'Ibadan · NG', sessions: 0 },
		{ id: 'adm-11', name: 'Kunle F.', email: 'kunle.ops@owltside.com', role: 'Event Operations', tier: 3, auth: 'Passkey + PIN', status: 'active', lastActive: minutesAgo(now, 132), location: 'Landmark Hall 1 · NG', sessions: 1 },
		{ id: 'adm-12', name: 'Amara E.', email: 'amara@owltside.com', role: 'Super Admin', tier: 0, auth: 'FIDO2 WebAuthn', status: 'active', lastActive: minutesAgo(now, 7), location: 'Cape Town Edge · ZA', sessions: 1 }
	];
}

function auditHash(n: number): string {
	const base = '0x9f4a8b7c21e63d4a08b12f69a23d8c4710bc0928e44b1d927c30a2';
	return `${base}${String(1000 + (n % 9000))}`;
}

function makeAudit(now: Date, events: AdminEvent[], organizers: AdminOrganizer[]): AuditRecord[] {
	const explicit: AuditRecord[] = [
		{
			id: 'aud-884920',
			ref: 'LOG-884920',
			at: minutesAgo(now, 0),
			actor: 'Tomiwa A.',
			actorRole: 'Super Admin',
			action: 'TICKET_REISSUE_CONFIRMED',
			target: '#OWL-2026-AI-9942',
			reason: 'Attendee reported a damaged pass — manual re-issue',
			severity: 'info',
			entityKind: 'ticket',
			entityId: 'OWL-2026-AI-9942',
			diff: [
				{ field: 'ticket.status', before: 'void', after: 'valid' },
				{ field: 'pass_code', before: 'OWL-2026-AI-9901', after: 'OWL-2026-AI-9942' },
				{ field: 'reissue_count', before: '0', after: '1' },
				{ field: 'wallet_refresh', before: 'pending', after: 'complete' }
			],
			ip: '102.89.4.11',
			hash: '0x9f4a8b7c21e63d4a08b12f69a23d8c4710bc0928e44b1d927c30a2',
			prevHash: '0x7c771b1c4a8e0912f69a23d8c4710bc0928e44a1b0288f11ca9e34d719'
		},
		{
			id: 'aud-884918',
			ref: 'LOG-884918',
			at: minutesAgo(now, 14),
			actor: 'Chioma N.',
			actorRole: 'Trust & Safety Lead',
			action: 'KYC_TIER_REJECTED',
			target: 'Apex Yield Ventures Ltd',
			reason: 'Beneficiary name mismatch against CAC registry',
			severity: 'critical',
			entityKind: 'organizer',
			entityId: 'org-apex',
			diff: [{ field: 'kyc.status', before: 'pending', after: 'rejected' }],
			ip: '197.210.55.22',
			hash: auditHash(2),
			prevHash: '0x9f4a8b7c21e63d4a08b12f69a23d8c4710bc0928e44b1d927c30a2'
		},
		{
			id: 'aud-884912',
			ref: 'LOG-884912',
			at: minutesAgo(now, 47),
			actor: 'Fola D.',
			actorRole: 'Event Operations',
			action: 'WEBHOOK_SECRET_ROTATED',
			target: 'Paystack webhook dispatcher',
			reason: 'Routine credential refresh',
			severity: 'info',
			entityKind: 'settings',
			entityId: 'paystack-webhook',
			ip: '105.112.28.91',
			hash: auditHash(3),
			prevHash: auditHash(2)
		},
		{
			id: 'aud-884901',
			ref: 'LOG-884901',
			at: minutesAgo(now, 82),
			actor: 'Tomiwa A.',
			actorRole: 'Super Admin',
			action: 'REFUND_PAYSTACK_SETTLED',
			target: '#REF-2026-071 (₦25,000)',
			reason: 'Duplicate checkout verified via gateway log',
			severity: 'info',
			entityKind: 'order',
			entityId: 'REF-2026-071',
			ip: '102.89.4.11',
			hash: auditHash(4),
			prevHash: auditHash(3)
		},
		{
			id: 'aud-884896',
			ref: 'LOG-884896',
			at: minutesAgo(now, 137),
			actor: 'Chuka N.',
			actorRole: 'Field Operations Lead',
			action: 'DUPLICATE_PASS_FLAGGED',
			target: '#EV-9921-DUP',
			reason: 'Duplicate QR presentation — pass held for review',
			severity: 'warning',
			entityKind: 'ticket',
			entityId: 'EV-9921-DUP',
			ip: '105.112.30.4',
			hash: auditHash(5),
			prevHash: auditHash(4)
		},
		{
			id: 'aud-884882',
			ref: 'LOG-884882',
			at: minutesAgo(now, 208),
			actor: 'Policy Sentinel',
			actorRole: 'Automated Engine',
			action: 'EVENT_SUSPENDED_FLAG',
			target: '#EVT-2026-W3FLG',
			reason: 'Web3/crypto policy violation — unverified payout beneficiary',
			severity: 'critical',
			entityKind: 'event',
			entityId: 'evt-crypto',
			diff: [{ field: 'status', before: 'published', after: 'suspended' }],
			ip: 'system',
			hash: auditHash(6),
			prevHash: auditHash(5)
		}
	];

	const actions = [
		{ action: 'ORDER_REFUND_APPROVED', kind: 'order' as const, severity: 'info' as const, reason: 'Policy window validated' },
		{ action: 'EVENT_PUBLISHED', kind: 'event' as const, severity: 'info' as const, reason: 'Moderation approved' },
		{ action: 'ORGANIZER_KYB_VERIFIED', kind: 'organizer' as const, severity: 'info' as const, reason: 'CAC documents validated' },
		{ action: 'USER_ACCOUNT_SUSPENDED', kind: 'user' as const, severity: 'warning' as const, reason: 'Chargeback ring investigation' },
		{ action: 'STAFF_SESSION_REVOKED', kind: 'staff' as const, severity: 'warning' as const, reason: 'Device lost — credential revoked' },
		{ action: 'TICKET_VOIDED', kind: 'ticket' as const, severity: 'info' as const, reason: 'Refund completed' },
		{ action: 'SETTLEMENT_BATCH_RELEASED', kind: 'settings' as const, severity: 'info' as const, reason: 'T+1 treasury sweep' },
		{ action: 'PAYOUT_SUBACCOUNT_FROZEN', kind: 'organizer' as const, severity: 'critical' as const, reason: 'Beneficiary mismatch' },
		{ action: 'MODERATION_CASE_ESCALATED', kind: 'event' as const, severity: 'warning' as const, reason: 'Severity raised to critical' },
		{ action: 'WEBHOOK_SECRET_ROTATED', kind: 'settings' as const, severity: 'info' as const, reason: 'Scheduled rotation' }
	];
	const actors = [
		{ name: 'Tomiwa A.', role: 'Super Admin' },
		{ name: 'Chioma N.', role: 'Trust & Safety Lead' },
		{ name: 'Kemi O.', role: 'Finance & Treasury' },
		{ name: 'Damilola A.', role: 'Support Agent' },
		{ name: 'Fola D.', role: 'Event Operations' },
		{ name: 'Policy Sentinel', role: 'Automated Engine' }
	];
	const generated: AuditRecord[] = [];
	for (let i = explicit.length; i < 1_428; i++) {
		const template = pick(actions);
		const actor = pick(actors);
		const event = pick(events);
		const organizer = pick(organizers);
		const target =
			template.kind === 'event'
				? event.title
				: template.kind === 'organizer'
					? organizer.name
					: template.kind === 'ticket'
						? `#OWL-2026-${String(1000 + i)}`
						: template.kind === 'order'
							? `#ORD-${9000 + (i % 900)}-NG`
							: template.kind === 'user'
								? `#USR-${3000 + i}`
								: 'Control-plane configuration';
		generated.push({
			id: `aud-g-${i}`,
			ref: `LOG-${884920 - i}`,
			at: minutesAgo(now, rint(10, 60 * 24 * 30)),
			actor: actor.name,
			actorRole: actor.role,
			action: template.action,
			target,
			reason: template.reason,
			severity: template.severity,
			entityKind: template.kind,
			entityId: template.kind === 'event' ? event.id : template.kind === 'organizer' ? organizer.id : `${template.kind}-${i}`,
			ip: actor.name === 'Policy Sentinel' ? 'system' : `102.89.${rint(1, 254)}.${rint(1, 254)}`,
			hash: auditHash(10 + i),
			prevHash: auditHash(9 + i)
		});
	}
	return [...explicit, ...generated].sort((a, b) => b.at.localeCompare(a.at));
}

// ── Settings ────────────────────────────────────────────────────────────────

function makeSettings(): SettingsData {
	return {
		platformFeePct: 8,
		escoowDisputePct: 5,
		disbursementWindow: 'T+1 · 02:00 WAT',
		webhookEndpoint: 'https://api.owltside.com/v1/webhooks/paystack',
		webhookHealthy: true,
		integrations: [
			{ key: 'FIN-01', name: 'Paystack Rails', state: 'LIVE', tone: 'ok', detail: 'Billing pipeline & recurring webhook dispatcher', metric: '42ms latency' },
			{ key: 'DB-REPLICA', name: 'Postgres Primary Cluster', state: 'HEALTHY', tone: 'ok', detail: 'Distributed transaction log & ticket ledger', metric: '99.99% uptime' },
			{ key: 'SEC-HSM', name: 'AWS KMS Hardware Module', state: 'ACTIVE', tone: 'ok', detail: 'Envelope encryption for organizer secrets & webhook credentials', metric: '90-day rotation' },
			{ key: 'COMMS-SMS', name: 'Termii Gateway', state: '98.4% DELIV.', tone: 'warn', detail: 'High-volume transactional OTP & event alert routing', metric: '0 queued' }
		],
		lastHardwareSync: 'Synced 1,248 RSA keys',
		lastAudit: 'Nov 10, 2025 · CyberGuard SOC-2 Type II',
		firmware: 'v4.18.2-prod'
	};
}

export function buildSeed(now: Date = new Date()): StoreState {
	const organizers = makeOrganizers(now);
	const events = makeEvents(now, organizers);
	const users = makeUsers(now);
	const tickets = makeTickets(now, events, users);
	const orders = makeOrders(now, events, users);

	// Reconcile each attendee's lifetime metrics with the passes that actually exist so
	// a dossier can never claim 20 passes and then list none.
	const stats = new Map<string, { count: number; spend: number }>();
	for (const ticket of tickets) {
		const entry = stats.get(ticket.holderHandle) ?? { count: 0, spend: 0 };
		entry.count += 1;
		if (ticket.status !== 'void') entry.spend += ticket.priceNgn;
		stats.set(ticket.holderHandle, entry);
	}
	for (const user of users) {
		const entry = stats.get(user.handle);
		user.ticketsCount = entry?.count ?? 0;
		user.spendNgn = entry?.spend ?? 0;
	}

	return {
		organizers,
		events,
		tickets,
		orders,
		users,
		refunds: makeRefunds(now),
		approvals: makeApprovals(now),
		reports: makeReports(now),
		cases: makeCases(now),
		staff: makeStaff(now),
		audit: makeAudit(now, events, organizers),
		settings: makeSettings()
	};
}
