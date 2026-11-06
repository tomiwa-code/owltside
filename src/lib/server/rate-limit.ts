/**
 * Fixed-window rate limiting for the public app.
 *
 * The store is in-process, so on serverless it is per-instance rather than a
 * global guarantee. That is deliberate: it needs no extra infrastructure, and
 * it still turns brute-force and scraping from "unlimited" into "a few
 * thousand per hour per instance". The authoritative ceiling for scanner PINs
 * lives in Postgres (migration 033, `consume_scan_attempt`), which is shared.
 */

interface Bucket {
	count: number;
	resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

export interface RateLimitOptions {
	/** Maximum hits allowed per window. */
	max: number;
	/** Window length in milliseconds. */
	windowMs: number;
}

export interface RateLimitResult {
	ok: boolean;
	remaining: number;
	retryAfterSeconds: number;
}

export function rateLimit(key: string, options: RateLimitOptions, now = Date.now()): RateLimitResult {
	const { max, windowMs } = options;
	sweep(now);

	const existing = buckets.get(key);
	if (!existing || existing.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return { ok: true, remaining: Math.max(0, max - 1), retryAfterSeconds: 0 };
	}

	existing.count += 1;
	const ok = existing.count <= max;
	return {
		ok,
		remaining: Math.max(0, max - existing.count),
		retryAfterSeconds: ok ? 0 : Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
	};
}

function sweep(now: number): void {
	if (now - lastSweep < 60_000 && buckets.size < 5_000) return;
	lastSweep = now;
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key);
	}
}

/** A stable, privacy-preserving client identifier for rate-limit keys. */
export function clientKey(request: Request, fallback: string): string {
	const forwarded = request.headers.get('x-forwarded-for');
	if (forwarded) {
		const first = forwarded.split(',')[0]?.trim();
		if (first) return first;
	}
	const real = request.headers.get('x-real-ip');
	if (real?.trim()) return real.trim();
	return fallback;
}

/** Test helper: clear every bucket. */
export function resetRateLimitsForTests(): void {
	buckets.clear();
	lastSweep = 0;
}
