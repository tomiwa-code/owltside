import { describe, expect, it } from 'vitest';
import { demoSource } from '$lib/server/datasource';
import * as demo from '$lib/server/demo/seed';
import type { WizardPayload } from '$lib/types';

const draft = (title: string): WizardPayload => ({
	title,
	category: 'music',
	tags: [],
	startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
	venue: 'Review Hall',
	city: 'Lagos',
	description: 'A submission that waits for admin approval before it goes public.',
	cover: { from: '#111827', to: '#312e81', icon: 'music' },
	tiers: [{ name: 'General', price: 5_000, capacity: 40 }],
	agenda: [],
	speakers: [],
	gates: []
});

describe('event moderation (demo datasource)', () => {
	it('ships a pending example event that is not in the public catalogue', async () => {
		expect(demo.pendingReviewEvent.status).toBe('pending');
		const feed = await demoSource.listEvents();
		expect(feed.some((event) => event.id === demo.pendingReviewEvent.id)).toBe(false);
		expect(await demoSource.getEvent(demo.pendingReviewEvent.slug)).toBeUndefined();
	});

	it('creates organizer submissions as pending with a submission timestamp', async () => {
		const event = await demoSource.createEvent('u-ada', draft('Submission Starts Pending'));
		expect(event.status).toBe('pending');
		expect(event.submittedAt).toBeTruthy();
	});

	it('keeps pending events out of the feeds, public event pages and profiles', async () => {
		const event = await demoSource.createEvent('u-ada', draft('Hidden Until Approved'));

		expect((await demoSource.listEvents()).some((item) => item.id === event.id)).toBe(false);
		expect((await demoSource.listEvents({ query: 'Hidden Until Approved' })).length).toBe(0);
		expect(await demoSource.getEvent(event.slug)).toBeUndefined();
		expect((await demoSource.getProfileEvents('u-ada')).some((item) => item.id === event.id)).toBe(false);
	});

	it('shows the pending submission on the organizer dashboard immediately', async () => {
		const event = await demoSource.createEvent('u-ada', draft('Dashboard Visibility'));
		const organizer = await demoSource.getOrganizer('u-ada');
		expect(organizer.events.find((item) => item.id === event.id)?.status).toBe('pending');
	});

	it('re-enters the review queue when a rejected listing is edited', async () => {
		const event = await demoSource.createEvent('u-ada', draft('Rejected Then Resubmitted'));
		const stored = demo.events.find((item) => item.id === event.id)!;
		stored.status = 'rejected';
		stored.moderationNote = 'Add a venue map';

		const updated = await demoSource.updateEvent('u-ada', event.id, { title: 'Rejected Then Resubmitted' });
		expect(updated.status).toBe('pending');
		expect(updated.moderationNote).toBeUndefined();
		expect(updated.submittedAt).toBeTruthy();
	});

	it('does not unpublish an approved event when the organizer edits it', async () => {
		const stored = demo.events.find((item) => item.id === 'e-rooftop')!;
		expect(stored.status).toBe('published');
		const updated = await demoSource.updateEvent('u-ada', 'e-rooftop', { description: 'Updated copy' });
		expect(updated.status).toBe('published');
	});
});
