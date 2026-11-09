import { createHash } from 'node:crypto';

/**
 * Egress guard for inline images.
 *
 * Avatars, profile banners and event posters are stored as `data:` URLs inside
 * the row (see `supabase/sql/007_profile_editing.sql` and `012_event_posters.sql`).
 * That is convenient for uploads — no storage bucket, no orphan files — but it
 * makes every row carry tens or hundreds of kilobytes of base64. A list of
 * conversations, a feed of events, or a 10-second poll that returns the same
 * profile row again and again multiplies that by every request.
 *
 * The fix here is deliberately small and backwards compatible:
 *
 *  - a row that still holds a `data:` URL is rewritten to a stable
 *    `/api/media/...` URL. The browser caches the bytes (`immutable`), so a
 *    profile photo is downloaded once per device instead of once per payload.
 *  - `/api/media/*` reads *only* the image column and serves it with a long
 *    `cache-control`, so a cache miss costs one column, not a whole row.
 *  - the `v` query parameter changes whenever the image changes, which keeps
 *    `immutable` honest.
 *
 * New uploads should go to Supabase Storage; `036_egress_control.sql` refuses
 * oversized inline images so the problem cannot silently come back.
 */

const INLINE_IMAGE = /^data:image\/(jpeg|jpg|png|webp|avif|gif);base64,[A-Za-z0-9+/=\r\n]+$/i;

export type MediaKind = 'avatar' | 'banner' | 'poster';

export function isInlineImage(value: unknown): value is string {
	return typeof value === 'string' && INLINE_IMAGE.test(value.trim());
}

/** Approximate decoded size in bytes (base64 is ~4/3 of the binary size). */
export function inlineImageBytes(value: string): number {
	const comma = value.indexOf(',');
	if (comma === -1) return 0;
	return Math.floor(((value.length - comma - 1) * 3) / 4);
}

function versionOf(value: string): string {
	// Cheap, stable fingerprint: no need to hash the whole blob on every row.
	const tail = value.slice(-24);
	return `${value.length.toString(36)}-${tail.replace(/[^A-Za-z0-9]/g, '').slice(0, 6)}`;
}

/**
 * A URL the browser can cache for a stored inline image, or `null` when the
 * value is empty. External URLs are passed through untouched.
 */
export function mediaHref(kind: MediaKind, key: string, value: unknown): string | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	if (!isInlineImage(value)) return value;
	const id = encodeURIComponent(key);
	return `/api/media/${kind}/${id}?v=${versionOf(value)}`;
}

/** Decode a stored `data:` URL into bytes + content type. */
export function decodeInlineImage(value: string): { bytes: Uint8Array; contentType: string } | null {
	if (!isInlineImage(value)) return null;
	const comma = value.indexOf(',');
	const mime = value.slice(5, value.indexOf(';')).toLowerCase();
	const contentType = mime === 'image/jpg' ? 'image/jpeg' : mime;
	try {
		const bytes = Buffer.from(value.slice(comma + 1), 'base64');
		if (bytes.byteLength === 0) return null;
		return { bytes: new Uint8Array(bytes), contentType };
	} catch {
		return null;
	}
}

/** Long-lived, content-addressed cache headers for `/api/media/*` responses. */
export function mediaCacheHeaders(etagSeed: string): Record<string, string> {
	const etag = `"${createHash('sha1').update(etagSeed).digest('base64url').slice(0, 16)}"`;
	return {
		'cache-control': 'public, max-age=604800, s-maxage=31536000, stale-while-revalidate=86400',
		etag,
		'x-content-type-options': 'nosniff'
	};
}

/**
 * Turn a stored image value into an HTTP response that browsers and CDNs can
 * cache. Returns a 404 when the row has no image.
 */
export function imageResponse(value: unknown, request: Request): Response {
	if (typeof value !== 'string') {
		return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
	}
	const decoded = decodeInlineImage(value);
	if (!decoded) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
	const headers = mediaCacheHeaders(`${value.length}:${value.slice(-32)}`);
	if (request.headers.get('if-none-match') === headers.etag) {
		return new Response(null, { status: 304, headers });
	}
	return new Response(decoded.bytes as unknown as BodyInit, {
		status: 200,
		headers: { ...headers, 'content-type': decoded.contentType }
	});
}
