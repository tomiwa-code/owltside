export interface NavigatorLike {
	userAgent?: string;
	maxTouchPoints?: number;
}

export function formatMapQuery(venue: string, city?: string): string {
	const cleanVenue = venue.trim();
	const cleanCity = (city ?? '').trim();
	if (!cleanVenue) return cleanCity;
	if (!cleanCity) return cleanVenue;
	const lowerVenue = cleanVenue.toLowerCase();
	const lowerCity = cleanCity.toLowerCase();
	if (lowerVenue === lowerCity || lowerVenue.endsWith(`, ${lowerCity}`)) {
		return cleanVenue;
	}
	return `${cleanVenue}, ${cleanCity}`;
}

export function isAppleMobileNavigator(
	nav: NavigatorLike | undefined = typeof navigator !== 'undefined' ? navigator : undefined
): boolean {
	if (!nav?.userAgent) return false;
	const ua = nav.userAgent;
	if (/iPhone|iPad|iPod/i.test(ua)) return true;
	if (/Macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return true;
	return false;
}

export function buildMapEmbedUrl(venue: string, city?: string): string {
	const query = formatMapQuery(venue, city);
	return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
}

export function buildDirectionsUrl(
	venue: string,
	city?: string,
	nav: NavigatorLike | undefined = typeof navigator !== 'undefined' ? navigator : undefined
): string {
	const query = formatMapQuery(venue, city);
	const encoded = encodeURIComponent(query);
	if (isAppleMobileNavigator(nav)) {
		return `https://maps.apple.com/?daddr=${encoded}&dirflg=d`;
	}
	return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}
