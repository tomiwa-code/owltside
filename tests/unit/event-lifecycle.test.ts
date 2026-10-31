import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { demoSource } from '$lib/server/datasource';
import * as demo from '$lib/server/demo/seed';
import {
	eventStatusLabel,
	hasEventEnded,
	isPubliclyAccessible,
	isPubliclyVisible,
	normalizedEventStatus,
	watDateInputValue,
	watTimeInputValue
} from '$lib/utils/event-status';
import EventRow from '$components/EventRow.svelte';
import UserProfilePage from '../../src/routes/(app)/users/[handle]/+page.svelte';
import CreateEventPage from '../../src/routes/(app)/organizer/create/+page.svelte';
import type { EventItem } from '$lib/types';

afterEach(() => {
	cleanup();
});

describe('event lifecycle & end-time closure (public web app)', () => {
	it('closes published events at the exact end date and time in WAT', () => {
		const event = {
			status: 'published' as const,
			startsAt: '2026-10-31T09:00:00+01:00',
			endsAt: '2026-10-31T18:30:00+01:00'
		};
		const beforeEnd = Date.parse('2026-10-31T18:29:59+01:00');
		const exactEnd = Date.parse('2026-10-31T18:30:00+01:00');

		expect(hasEventEnded(event, beforeEnd)).toBe(false);
		expect(normalizedEventStatus(event, beforeEnd)).toBe('published');
		expect(isPubliclyVisible(event, beforeEnd)).toBe(true);

		expect(hasEventEnded(event, exactEnd)).toBe(true);
		expect(normalizedEventStatus(event, exactEnd)).toBe('closed');
		expect(eventStatusLabel(normalizedEventStatus(event, exactEnd))).toBe('Closed');
		expect(isPubliclyVisible(event, exactEnd)).toBe(false);
		expect(isPubliclyAccessible(event, exactEnd)).toBe(true);
	});

	it('closes legacy published events without endsAt once their WAT event date passes', () => {
		const legacyEvent = {
			status: 'published' as const,
			startsAt: '2026-10-20T15:00:00+01:00',
			endsAt: null
		};
		const duringDay = Date.parse('2026-10-20T22:00:00+01:00');
		const nextDay = Date.parse('2026-10-21T00:00:01+01:00');

		expect(normalizedEventStatus(legacyEvent, duringDay)).toBe('published');
		expect(normalizedEventStatus(legacyEvent, nextDay)).toBe('closed');
	});

	it('preserves pending, draft, rejected, and suspended moderation states when dates pass', () => {
		const pastTime = Date.parse('2030-01-01T00:00:00Z');
		for (const status of ['pending', 'draft', 'rejected', 'suspended'] as const) {
			expect(
				normalizedEventStatus(
					{
						status,
						startsAt: '2026-01-01T09:00:00+01:00',
						endsAt: '2026-01-01T18:00:00+01:00'
					},
					pastTime
				)
			).toBe(status);
		}
	});

	it('round-trips WAT date and end time without UTC day-shift drift', () => {
		expect(watDateInputValue('2026-11-21T00:30:00+01:00')).toBe('2026-11-21');
		expect(watTimeInputValue('2026-11-21T00:30:00+01:00')).toBe('00:30');
		expect(watTimeInputValue('2026-11-21T18:45:00+01:00')).toBe('18:45');
	});

	it('excludes ended events from active feeds and checkout while showing Closed in organizer console and Past on profiles', async () => {
		const feed = await demoSource.listEvents();
		expect(feed.some((e) => e.id === demo.pastSessionEvent.id)).toBe(false);

		const organizer = await demoSource.getOrganizer('u-ada');
		const orgPast = organizer.events.find((e) => e.id === demo.pastSessionEvent.id);
		expect(orgPast?.status).toBe('closed');

		const direct = await demoSource.getEvent(demo.pastSessionEvent.slug);
		expect(direct?.status).toBe('closed');

		await expect(
			demoSource.createOrder('u-ada', demo.pastSessionEvent.slug, [
				{ tierId: demo.pastSessionEvent.tiers[0].id, qty: 1 }
			])
		).rejects.toThrow(/ended/i);

		const profileEvents = await demoSource.getProfileEvents('u-ada');
		const profilePast = profileEvents.find((e) => e.id === demo.pastSessionEvent.id);
		expect(profilePast).toBeDefined();
		expect(profilePast?.status).toBe('closed');
	});
});

describe('wizard end time input & organizer profile Past display', () => {
	it('renders End time inputs in the event wizard and hydrates WAT end time when editing', () => {
		const editingEvent: EventItem = {
			...demo.rooftopEvent,
			startsAt: '2099-11-20T09:00:00+01:00',
			endsAt: '2099-11-21T20:15:00+01:00'
		};
		render(CreateEventPage, {
			props: {
				data: { owner: 'u-ada', event: editingEvent } as never,
				form: null
			}
		});

		const endTimeInputs = screen.getAllByLabelText('End time') as HTMLInputElement[];
		expect(endTimeInputs.length).toBeGreaterThanOrEqual(2);
		for (const input of endTimeInputs) {
			expect(input.value).toBe('20:15');
		}
	});

	it('renders ended events with a Past badge and Past section on the organizer profile', async () => {
		const events = await demoSource.getProfileEvents('u-ada');
		render(EventRow, { props: { event: events.find((e) => e.id === demo.pastSessionEvent.id)! } });
		expect(screen.getByText('Past')).toBeTruthy();
		cleanup();

		render(UserProfilePage, {
			props: {
				data: {
					profile: demo.people.ada,
					events,
					demoMode: true,
					session: null
				} as never
			}
		});

		expect(screen.getAllByText(/Mainland Vinyl Social/).length).toBeGreaterThan(0);
		expect(screen.getAllByText('Past').length).toBeGreaterThan(0);
		expect(screen.getAllByText(/Past · 1/).length).toBeGreaterThan(0);
	});
});
