import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { error, json } from '@sveltejs/kit';
import type { CategoryId, EventFilters } from '$lib/types';
import type { RequestHandler } from './$types';

/**
 * Public event catalogue.
 *
 * - Card payload only (no full description/agenda/speakers/FAQs/policies).
 * - `?limit=`/`?offset=` are honoured and capped, so a scraper cannot ask for
 *   the whole table in one request.
 * - The response carries a long-lived `cache-control` and a strong ETag, so
 *   repeat requests from a browser or CDN cost zero database egress.
 */
const MAX_LIMIT = 60;

export const GET: RequestHandler = async ({ url, cookies, request }) => {
	const filters: EventFilters = {
		category: (url.searchParams.get('category') as CategoryId) ?? undefined,
		query: url.searchParams.get('q') ?? undefined,
		freeOnly: url.searchParams.get('free') === '1',
		dateFrom: url.searchParams.get('from') ?? undefined,
		dateTo: url.searchParams.get('to') ?? undefined,
		sort: (url.searchParams.get('sort') as EventFilters['sort']) ?? undefined
	};
	const rawLimit = Number(url.searchParams.get('limit') ?? 0);
	const rawOffset = Number(url.searchParams.get('offset') ?? 0);
	if (Number.isFinite(rawLimit) && rawLimit > MAX_LIMIT) {
		// Refuse to become a bulk-export endpoint.
		error(400, `Request at most ${MAX_LIMIT} events per call.`);
	}
	if (Number.isFinite(rawLimit) && rawLimit > 0) filters.limit = Math.floor(rawLimit);
	if (Number.isFinite(rawOffset) && rawOffset > 0) filters.offset = Math.floor(rawOffset);

	const events = await getSource(createSupabase(cookies)).listEvents(filters);
	const body = JSON.stringify(events);
	const etag = `"${simpleHash(body)}"`;
	const headers: Record<string, string> = {
		'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
		etag
	};
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers });
	}
	return json(events, { headers });
};

/** FNV-1a — cheap, dependency-free ETag seed for a JSON body. */
function simpleHash(value: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36) + value.length.toString(36);
}
