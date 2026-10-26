import { afterEach, describe, expect, it } from 'vitest';
import { adminDataSource, mapSupabaseEvent } from '$admin/server/supabase-data';

describe('Supabase admin data source', () => {
	it('selects Supabase when server URL and service key are configured', () => {
		const oldUrl = process.env.PUBLIC_SUPABASE_URL;
		const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
		process.env.PUBLIC_SUPABASE_URL = 'https://owltside-test.supabase.co';
		process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-service-key';
		expect(adminDataSource()).toBe('supabase');
		if (oldUrl === undefined) delete process.env.PUBLIC_SUPABASE_URL;
		else process.env.PUBLIC_SUPABASE_URL = oldUrl;
		if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
		else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
	});
});

describe('Supabase admin event mapping', () => {
	const originalNow = Date.now;

	afterEach(() => {
		Date.now = originalNow;
	});

	it('maps the public.events and tier JSON shape into the admin view model', () => {
		Date.now = () => Date.parse('2026-10-26T12:00:00.000Z');
		const event = mapSupabaseEvent({
			id: 'a3402059-df03-4fc8-9cae-337c68e8672b',
			slug: 'lagos-summit',
			title: 'Lagos Summit',
			category: 'tech',
			starts_at: '2026-11-20T10:00:00.000Z',
			ends_at: null,
			venue: 'Eko Convention Centre',
			city: 'Lagos',
			cover: { from: '#123456', to: '#654321', icon: 'cpu' },
			organizer_id: 'profile-1',
			tiers: [
				{ name: 'Regular', price: 12000, sold: 10, capacity: 80 },
				{ name: 'VIP', price: 50000, sold: 2, capacity: 20 }
			],
			attendees: 12
		}, 'Organizer Name');

		expect(event).toMatchObject({
			id: 'a3402059-df03-4fc8-9cae-337c68e8672b',
			title: 'Lagos Summit',
			organizerName: 'Organizer Name',
			status: 'published',
			capacity: 100,
			sold: 12,
			grossNgn: 220000,
			coverFrom: '#123456',
			coverTo: '#654321'
		});
		expect(event.tiers).toHaveLength(2);
	});

	it('treats past-start events as completed without requiring a status column', () => {
		Date.now = () => Date.parse('2026-10-26T12:00:00.000Z');
		const event = mapSupabaseEvent({ id: 'event-old', starts_at: '2026-10-25T12:00:00.000Z' });
		expect(event.status).toBe('completed');
	});

	it('uses the stored moderation status when 022 has been applied', () => {
		Date.now = () => Date.parse('2026-10-26T12:00:00.000Z');
		const base = { id: 'event-1', starts_at: '2026-11-20T10:00:00.000Z' };
		expect(mapSupabaseEvent({ ...base, status: 'pending' }).status).toBe('pending');
		expect(mapSupabaseEvent({ ...base, status: 'draft' }).status).toBe('draft');
		expect(mapSupabaseEvent({ ...base, status: 'suspended' }).status).toBe('suspended');
		// Rejected listings go back to the organizer to edit and resubmit.
		expect(mapSupabaseEvent({ ...base, status: 'rejected' }).status).toBe('draft');
		expect(mapSupabaseEvent({ ...base, status: 'published' }).status).toBe('published');
	});

	it('carries the moderation note and submission time into the dossier', () => {
		Date.now = () => Date.parse('2026-10-26T12:00:00.000Z');
		const event = mapSupabaseEvent({
			id: 'event-2',
			starts_at: '2026-11-20T10:00:00.000Z',
			status: 'pending',
			submitted_at: '2026-10-20T08:00:00.000Z',
			moderation_note: 'Awaiting venue confirmation'
		});
		expect(event.submittedAt).toBe('2026-10-20T08:00:00.000Z');
		expect(event.moderationNote).toBe('Awaiting venue confirmation');
	});
});
