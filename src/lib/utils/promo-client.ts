import type { ResolvedPromo } from '$lib/types';
import { normalizePromoCode } from '$lib/utils/promo';

/** Ask the server whether a code belongs to this event (or is a global code). */
export async function requestEventPromo(eventSlug: string, codeInput: string): Promise<ResolvedPromo> {
	const code = normalizePromoCode(codeInput);
	if (!code) throw new Error('Enter a promo code');
	const response = await fetch(`/api/events/${encodeURIComponent(eventSlug)}/promo`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ code })
	});
	const result = await response.json().catch(() => null);
	if (!response.ok || !result?.promo) {
		throw new Error(result?.error ?? 'That code isn’t valid for this event');
	}
	return result.promo as ResolvedPromo;
}
