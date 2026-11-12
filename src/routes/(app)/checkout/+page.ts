import type { EventItem, ResolvedPromo } from '$lib/types';
import { STALE_TIME } from '$lib/query/client';
import { queryKeys } from '$lib/query/keys';
import { cachedJson } from '$lib/query/load';
import { hasEventEnded } from '$lib/utils/event-status';
import { normalizePromoCode } from '$lib/utils/promo';
import { error, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Checkout reads the event from the same cache entry the event page used, so
 * "buy tickets" from a page you just viewed costs no round trip.
 *
 * Everything money-related stays server-side: the `pay` action re-reads the
 * event, recomputes the tier price and totals, and only the promo *code* is
 * echoed back to the browser. The gateway keys come from the sibling
 * `+page.server.ts` load and are merged into `data`.
 */
export const load: PageLoad = async ({ fetch, url, parent }) => {
	const slug = url.searchParams.get('event');
	if (!slug) error(400, 'Missing event');

	const { session } = await parent();
	/* Buying requires an account: unregistered visitors are asked to sign
	   in and returned to this exact checkout afterwards. */
	if (!session) {
		redirect(303, `/auth/login?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`);
	}

	const event = await cachedJson<EventItem>(fetch, {
		key: queryKeys.event(slug),
		url: `/api/events/${encodeURIComponent(slug)}`,
		staleTime: STALE_TIME.live
	}).catch(() => undefined);
	if (!event) error(404, 'Event not found');
	if (hasEventEnded(event) || event.status === 'closed') {
		redirect(303, `/events/${encodeURIComponent(slug)}`);
	}

	const tierId = url.searchParams.get('tier') ?? event.tiers.find((t) => t.capacity - t.sold > 0)?.id;
	const tier = event.tiers.find((t) => t.id === tierId) ?? event.tiers[0];
	const qty = Math.max(1, Math.min(6, Number(url.searchParams.get('qty') ?? 1)));
	const promoCode = normalizePromoCode(url.searchParams.get('promo'));

	const promo = promoCode ? await resolvePromo(fetch, slug, promoCode) : null;

	return {
		event,
		tierId: tier.id,
		qty,
		promo,
		/* Stable while this checkout view lives, so a double submit resumes the
		   same order instead of opening a second chargeable transaction. */
		checkoutKey: crypto.randomUUID(),
		holder: {
			name: session.name ?? 'Guest Explorer',
			email: session.email ?? 'guest@owltside.app',
			authenticated: true
		}
	};
};

/** Resolve a promo code through the API; an invalid code is simply no promo. */
async function resolvePromo(
	fetchFn: typeof fetch,
	slug: string,
	code: string
): Promise<ResolvedPromo | null> {
	try {
		const response = await fetchFn(`/api/events/${encodeURIComponent(slug)}/promo`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ code })
		});
		if (!response.ok) return null;
		const payload = (await response.json()) as { promo?: ResolvedPromo };
		return payload.promo ?? null;
	} catch {
		return null;
	}
}
