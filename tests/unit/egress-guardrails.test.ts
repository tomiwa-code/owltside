import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '$lib/query/cache';
import { demoSource } from '$lib/server/datasource';
import { isInlineImage, mediaHref } from '$lib/server/media';
import { verifyCaptcha, captchaConfigured } from '$lib/server/captcha';
import { GET as getEvents } from '../../src/routes/api/events/+server';
import { GET as getBadges } from '../../src/routes/api/badges/+server';

/**
 * Guardrails that keep public reads small. Each case pins one of the fixes in
 * EGRESS_AUDIT.md so a future refactor cannot quietly reintroduce the
 * data-transfer problem.
 */

const cookies = { getAll: () => [], get: () => undefined, set: vi.fn(), delete: vi.fn() };

afterEach(() => {
	queryClient.invalidate('egress:');
	vi.unstubAllGlobals();
});

describe('inline images are served from cacheable routes, not JSON', () => {
	const avatar = `data:image/jpeg;base64,${'A'.repeat(1200)}`;

	it('recognises stored image data URLs', () => {
		expect(isInlineImage(avatar)).toBe(true);
		expect(isInlineImage('https://cdn.example.com/a.png')).toBe(false);
		expect(isInlineImage(null)).toBe(false);
	});

	it('rewrites a data URL to a fingerprint-versioned media URL', () => {
		const href = mediaHref('avatar', 'ada', avatar);
		expect(href).toMatch(/^\/api\/media\/avatar\/ada\?v=/);
		// The fingerprint changes when the image changes, so `immutable` is safe.
		expect(mediaHref('avatar', 'ada', `${avatar}B`)).not.toBe(href);
	});

	it('passes external URLs and empty values through untouched', () => {
		expect(mediaHref('avatar', 'ada', 'https://cdn.example.com/a.png')).toBe(
			'https://cdn.example.com/a.png'
		);
		expect(mediaHref('avatar', 'ada', null)).toBeNull();
	});
});

describe('query cache', () => {
	beforeEach(() => queryClient.invalidate('egress:'));

	it('never calls the fetcher while the entry is fresh', async () => {
		const fetcher = vi.fn(async () => 'payload');
		expect(await queryClient.ensure('egress:fresh', fetcher, 60_000)).toBe('payload');
		expect(await queryClient.ensure('egress:fresh', fetcher, 60_000)).toBe('payload');
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('refetches once the entry is older than staleTime', async () => {
		const fetcher = vi.fn(async () => 'payload');
		await queryClient.ensure('egress:stale', fetcher, 60_000);
		await new Promise((resolve) => setTimeout(resolve, 5));
		await queryClient.ensure('egress:stale', fetcher, 1);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});
});

describe('public event catalogue', () => {
	const call = async (search = '') => {
		const request = new Request(`http://localhost/api/events${search}`);
		return getEvents({
			url: new URL(request.url),
			request,
			cookies
		} as never);
	};

	it('is card-sized: no agendas, speaker bios, FAQs or inline posters', async () => {
		const response = await call();
		const events = (await response.json()) as Array<Record<string, unknown>>;
		expect(events.length).toBeGreaterThan(0);
		for (const event of events) {
			expect(event.speakers).toEqual([]);
			expect(event.agenda).toEqual([]);
			expect(event.faqs).toEqual([]);
			// Policy lines are short strings the feed renders as chips; they stay.
			expect((event.policies as string[]).every((line) => typeof line === 'string')).toBe(true);
			expect(String(event.description).length).toBeLessThanOrEqual(280);
			expect(JSON.stringify(event.cover)).not.toContain('data:image');
		}
	});

	it('answers repeat requests with 304 using the ETag', async () => {
		const first = await call();
		const etag = first.headers.get('etag');
		expect(etag).toBeTruthy();
		expect(first.headers.get('cache-control')).toContain('max-age=60');

		const request = new Request('http://localhost/api/events', {
			headers: { 'if-none-match': String(etag) }
		});
		const second = await getEvents({
			url: new URL(request.url),
			request,
			cookies
		} as never);
		expect(second.status).toBe(304);
	});

	it('refuses to be used as a bulk export', async () => {
		await expect(call('?limit=500')).rejects.toMatchObject({ status: 400 });
	});
});

describe('badge counters', () => {
	it('matches the unread counts derived from the demo lists', async () => {
		const counters = await demoSource.getBadgeCounts('u-ada');
		const notifications = await demoSource.getNotifications('u-ada');
		const conversations = await demoSource.getConversations('u-ada');
		const requests = await demoSource.getIncomingMessageRequests('u-ada');

		expect(counters.unread).toBe(notifications.filter((n) => !n.read).length);
		expect(counters.inboxUnread).toBe(
			conversations.reduce((sum, c) => sum + (c.unread ?? 0), 0) + requests.length
		);
		expect(counters.requests).toBe(requests.length);
	});

	it('returns zeros for a guest instead of failing the layout', async () => {
		const response = await getBadges({ locals: { session: null }, cookies } as never);
		expect(await response.json()).toEqual({ unread: 0, inboxUnread: 0, requests: 0 });
	});
});

describe('bot protection', () => {
	it('is skipped when no Turnstile secret is configured', async () => {
		expect(captchaConfigured()).toBe(false);
		await expect(verifyCaptcha(undefined)).resolves.toMatchObject({ ok: true, skipped: true });
	});
});
