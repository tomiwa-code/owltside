import type { EventItem } from '$lib/types';

export interface VerifiedOrganizerSummary {
	id: string;
	handle: string;
	name: string;
	avatarColor: string;
	avatarUrl?: string | null;
	city?: string | null;
	events: number;
	attended: number;
}

const NIGERIA_LOCATIONS: ReadonlyArray<{ name: string; lat: number; lon: number }> = [
	{ name: 'Abia', lat: 5.532, lon: 7.486 },
	{ name: 'Adamawa', lat: 9.2035, lon: 12.4954 },
	{ name: 'Akwa Ibom', lat: 5.0377, lon: 7.9128 },
	{ name: 'Anambra', lat: 6.2109, lon: 7.0741 },
	{ name: 'Bauchi', lat: 10.3158, lon: 9.8442 },
	{ name: 'Bayelsa', lat: 4.9267, lon: 6.2676 },
	{ name: 'Benue', lat: 7.7322, lon: 8.5391 },
	{ name: 'Borno', lat: 11.8333, lon: 13.15 },
	{ name: 'Cross River', lat: 4.9757, lon: 8.3417 },
	{ name: 'Delta', lat: 5.5167, lon: 5.75 },
	{ name: 'Ebonyi', lat: 6.3249, lon: 8.1137 },
	{ name: 'Edo', lat: 6.335, lon: 5.6037 },
	{ name: 'Ekiti', lat: 7.621, lon: 5.221 },
	{ name: 'Enugu', lat: 6.4584, lon: 7.5464 },
	{ name: 'Gombe', lat: 10.2897, lon: 11.1673 },
	{ name: 'Imo', lat: 5.4836, lon: 7.0333 },
	{ name: 'Jigawa', lat: 11.7564, lon: 9.3453 },
	{ name: 'Kaduna', lat: 10.5105, lon: 7.4165 },
	{ name: 'Kano', lat: 12.0022, lon: 8.592 },
	{ name: 'Katsina', lat: 12.9908, lon: 7.6018 },
	{ name: 'Kebbi', lat: 12.4539, lon: 4.1975 },
	{ name: 'Kogi', lat: 7.8023, lon: 6.7333 },
	{ name: 'Kwara', lat: 8.4966, lon: 4.5421 },
	{ name: 'Lagos', lat: 6.5244, lon: 3.3792 },
	{ name: 'Nasarawa', lat: 8.49, lon: 8.52 },
	{ name: 'Niger', lat: 9.6139, lon: 6.5569 },
	{ name: 'Ogun', lat: 7.1475, lon: 3.3619 },
	{ name: 'Ondo', lat: 7.2571, lon: 5.2058 },
	{ name: 'Osun', lat: 7.7827, lon: 4.5418 },
	{ name: 'Oyo', lat: 7.3775, lon: 3.947 },
	{ name: 'Plateau', lat: 9.8965, lon: 8.8583 },
	{ name: 'Rivers', lat: 4.8156, lon: 7.0498 },
	{ name: 'Sokoto', lat: 13.0059, lon: 5.2476 },
	{ name: 'Taraba', lat: 8.8937, lon: 11.3596 },
	{ name: 'Yobe', lat: 11.748, lon: 11.966 },
	{ name: 'Zamfara', lat: 12.1704, lon: 6.6641 },
	{ name: 'Abuja', lat: 9.0765, lon: 7.3986 }
];

export function resolveNearestLocation(latitude: number, longitude: number): string {
	let best = NIGERIA_LOCATIONS[0];
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const candidate of NIGERIA_LOCATIONS) {
		const dLat = (latitude - candidate.lat) * 111.32;
		const dLon = (longitude - candidate.lon) * 111.32 * Math.cos((latitude * Math.PI) / 180);
		const dist = dLat * dLat + dLon * dLon;
		if (dist < bestDistance) {
			bestDistance = dist;
			best = candidate;
		}
	}
	return best.name;
}

export function detectHeaderLocation(
	headers?: Pick<Headers, 'get'> | null
): string | null {
	if (!headers || typeof headers.get !== 'function') return null;
	for (const key of ['x-vercel-ip-city', 'cf-ipcity', 'x-appengine-city', 'x-geo-city']) {
		const raw = headers.get(key);
		if (!raw) continue;
		try {
			const decoded = decodeURIComponent(raw).trim();
			if (decoded) return decoded;
		} catch {
			const trimmed = raw.trim();
			if (trimmed) return trimmed;
		}
	}
	return null;
}

export function resolveUserLocation(opts: {
	geoCity?: string | null;
	draftCity?: string | null;
	profileCity?: string | null;
	detectedCity?: string | null;
}): string {
	for (const candidate of [opts.geoCity, opts.draftCity, opts.profileCity, opts.detectedCity]) {
		const trimmed = (candidate ?? '').trim();
		if (trimmed) return trimmed;
	}
	return 'Lagos';
}

export function shuffleArray<T>(items: readonly T[], random: () => number = Math.random): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i -= 1) {
		const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

function matchesLocation(cities: Iterable<string>, userLocation?: string | null): boolean {
	const needle = (userLocation ?? '').trim().toLowerCase();
	if (!needle) return false;
	for (const rawCity of cities) {
		const hay = rawCity.trim().toLowerCase();
		if (!hay) continue;
		if (hay.includes(needle) || needle.includes(hay)) return true;
	}
	return false;
}

export function selectVerifiedOrganizers(
	events: readonly EventItem[],
	userLocation?: string | null,
	maxCount = 5,
	random: () => number = Math.random
): VerifiedOrganizerSummary[] {
	const map = new Map<string, VerifiedOrganizerSummary & { cities: Set<string> }>();
	for (const event of events) {
		if (!event.organizer?.verified) continue;
		const current = map.get(event.organizer.id) ?? {
			id: event.organizer.id,
			handle: event.organizer.handle,
			name: event.organizer.name,
			avatarColor: event.organizer.avatarColor,
			avatarUrl: event.organizer.avatarUrl,
			city: event.organizer.city ?? null,
			events: 0,
			attended: 0,
			cities: new Set<string>()
		};
		current.events += 1;
		current.attended += event.attendees;
		if (event.organizer.city) current.cities.add(event.organizer.city);
		if (event.city) current.cities.add(event.city);
		map.set(event.organizer.id, current);
	}

	const all = [...map.values()];
	const local = all.filter((org) => matchesLocation(org.cities, userLocation));
	const others = all.filter((org) => !matchesLocation(org.cities, userLocation));

	const selected = [
		...shuffleArray(local, random),
		...shuffleArray(others, random)
	]
		.slice(0, Math.max(0, maxCount))
		.map(({ cities: _cities, ...summary }) => summary);

	return shuffleArray(selected, random);
}
