import type { EventFilters, EventItem } from '$lib/types';
import { isPubliclyVisible } from './event-status';

/**
 * Public-feed filtering, shared by the server datasource and the explore
 * route's universal load (which runs in the browser). Keeping it here — rather
 * than in `$lib/server/datasource` — is what lets explore filter a cached
 * catalogue without a round trip.
 */

export function minPrice(event: EventItem): number {
	return Math.min(...event.tiers.map((tier) => tier.price));
}

export function matches(event: EventItem, filters: EventFilters): boolean {
	if (filters.category && filters.category !== 'all' && event.category !== filters.category) return false;
	if (
		filters.freeOnly &&
		event.tiers.some((tier) => tier.price > 0) === true &&
		!event.tiers.some((tier) => tier.price === 0)
	)
		return false;
	if (filters.query) {
		const query = filters.query.trim().toLowerCase();
		const haystack =
			`${event.title} ${event.venue} ${event.city} ${event.organizer.name} ${event.tags.join(' ')}`.toLowerCase();
		if (!haystack.includes(query)) return false;
	}
	if (filters.dateFrom && new Date(event.startsAt) < new Date(filters.dateFrom)) return false;
	if (filters.dateTo && new Date(event.startsAt) > new Date(`${filters.dateTo}T23:59:59`)) return false;
	return true;
}

export function sortEvents(list: EventItem[], sort: EventFilters['sort']): EventItem[] {
	const events = [...list];
	switch (sort) {
		case 'popular':
			return events.sort((a, b) => b.viewsToday - a.viewsToday);
		case 'price_asc':
			return events.sort((a, b) => minPrice(a) - minPrice(b));
		case 'price_desc':
			return events.sort((a, b) => minPrice(b) - minPrice(a));
		default:
			return events.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
	}
}

export function filterEventList(list: EventItem[], filters: EventFilters = {}): EventItem[] {
	return sortEvents(
		list.filter((event) => isPubliclyVisible(event) && matches(event, filters)),
		filters.sort
	);
}
