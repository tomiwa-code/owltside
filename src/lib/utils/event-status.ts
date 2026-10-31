import type { EventItem, EventStatus } from '$lib/types';

/**
 * Single source of truth for the event review & lifecycle workflow.
 *
 * Organizers submit an event (`pending`); an admin publishes it (`published`).
 * Once an approved event's end date and time has passed, its effective status
 * transitions to `closed`: it stops appearing as `published` in active feeds
 * and closes ticket sales, while remaining accessible as a Past event on the
 * organizer's profile and direct event link.
 */

export interface EventStatusMeta {
	/** Short label shown on badges, e.g. "Pending Approval". */
	label: string;
	/** Longer explanation for tooltips and helper copy. */
	description: string;
}

export interface EventLifecycleInput {
	status?: EventStatus | string | null;
	startsAt?: string | null;
	endsAt?: string | null;
}

/** West Africa Time (Africa/Lagos) is fixed UTC+1 with no DST. */
const WAT_OFFSET_MS = 60 * 60 * 1000;
const BARE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_META: Record<EventStatus, EventStatusMeta> = {
	pending: {
		label: 'Pending Approval',
		description: 'Submitted and waiting for the Owltside review team to publish it.'
	},
	published: {
		label: 'Published',
		description: 'Live on the Owltside home and explore feeds.'
	},
	closed: {
		label: 'Closed',
		description: 'This event has ended and ticket sales are closed.'
	},
	draft: {
		label: 'Draft',
		description: 'Not submitted for review yet.'
	},
	rejected: {
		label: 'Rejected',
		description: 'Sent back by the review team. Edit the event to resubmit it.'
	},
	suspended: {
		label: 'Suspended',
		description: 'Removed from the public feeds by the review team.'
	}
};

/** Format an ISO timestamp as YYYY-MM-DD in WAT (UTC+1) for date inputs. */
export function watDateInputValue(iso: string | null | undefined): string {
	if (!iso) return '';
	const trimmed = iso.trim();
	if (BARE_DATE_RE.test(trimmed)) return trimmed;
	const ms = Date.parse(trimmed);
	if (Number.isNaN(ms)) return '';
	return new Date(ms + WAT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Format an ISO timestamp as HH:MM in WAT (UTC+1) for time inputs. */
export function watTimeInputValue(iso: string | null | undefined, fallback = '23:59'): string {
	if (!iso) return fallback;
	const trimmed = iso.trim();
	if (BARE_DATE_RE.test(trimmed)) return fallback;
	const ms = Date.parse(trimmed);
	if (Number.isNaN(ms)) return fallback;
	return new Date(ms + WAT_OFFSET_MS).toISOString().slice(11, 16);
}

/**
 * Compute the exact epoch millisecond at which an event closes.
 * - When `endsAt` is a full timestamp, the event closes at that exact instant.
 * - When `endsAt` is a bare date (YYYY-MM-DD) or omitted, the event closes at
 *   23:59:59.999 WAT on its end date (or start date if `endsAt` is missing).
 */
export function eventEndTimeMs(
	event: Pick<EventLifecycleInput, 'startsAt' | 'endsAt'>
): number {
	const rawEnd = typeof event.endsAt === 'string' ? event.endsAt.trim() : '';
	if (rawEnd) {
		if (BARE_DATE_RE.test(rawEnd)) {
			return Date.parse(`${rawEnd}T23:59:59.999+01:00`);
		}
		const parsed = Date.parse(rawEnd);
		if (!Number.isNaN(parsed)) return parsed;
	}
	const rawStart = typeof event.startsAt === 'string' ? event.startsAt.trim() : '';
	if (rawStart) {
		if (BARE_DATE_RE.test(rawStart)) {
			return Date.parse(`${rawStart}T23:59:59.999+01:00`);
		}
		const startMs = Date.parse(rawStart);
		if (!Number.isNaN(startMs)) {
			const watDate = new Date(startMs + WAT_OFFSET_MS).toISOString().slice(0, 10);
			return Date.parse(`${watDate}T23:59:59.999+01:00`);
		}
	}
	return Number.POSITIVE_INFINITY;
}

/** True once the event has reached or passed its end date and time. */
export function hasEventEnded(
	event: Pick<EventLifecycleInput, 'startsAt' | 'endsAt'>,
	now = Date.now()
): boolean {
	return now >= eventEndTimeMs(event);
}

/**
 * Effective status of an event:
 * - Missing status on legacy records defaults to `published`.
 * - Approved (`published`) events whose end date & time has passed transition
 *   to `closed` so passed events never show as `published`.
 * - Moderation states (`draft`, `pending`, `rejected`, `suspended`) stay as-is.
 */
export function normalizedEventStatus(
	event: Pick<EventItem, 'status'> | EventLifecycleInput,
	now = Date.now()
): EventStatus {
	const raw = (event.status ?? 'published') as EventStatus;
	if (raw === 'draft' || raw === 'pending' || raw === 'rejected' || raw === 'suspended') {
		return raw;
	}
	const timing = event as EventLifecycleInput;
	if ((timing.startsAt || timing.endsAt) && hasEventEnded(timing, now)) {
		return 'closed';
	}
	return raw === 'closed' ? 'closed' : 'published';
}

/** Active, upcoming/live approved events eligible for discovery feeds & checkout. */
export function isPubliclyVisible(
	event: Pick<EventItem, 'status'> | EventLifecycleInput,
	now = Date.now()
): boolean {
	return normalizedEventStatus(event, now) === 'published';
}

/** Approved events (active or ended/past) viewable on organizer profiles & direct links. */
export function isPubliclyAccessible(
	event: Pick<EventItem, 'status'> | EventLifecycleInput,
	now = Date.now()
): boolean {
	const status = normalizedEventStatus(event, now);
	return status === 'published' || status === 'closed';
}

export function eventStatusMeta(status: EventStatus | undefined): EventStatusMeta {
	return STATUS_META[status ?? 'published'] ?? STATUS_META.published;
}

export function eventStatusLabel(status: EventStatus | undefined): string {
	return eventStatusMeta(status).label;
}

/** True when the event is waiting on an admin decision. */
export function awaitingReview(
	event: Pick<EventItem, 'status'> | EventLifecycleInput,
	now = Date.now()
): boolean {
	return normalizedEventStatus(event, now) === 'pending';
}
