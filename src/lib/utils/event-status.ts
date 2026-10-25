import type { EventItem, EventStatus } from '$lib/types';

/**
 * Single source of truth for the event review workflow.
 *
 * Organizers submit an event (`pending`); an admin publishes it (`published`).
 * Anything that is not published must stay out of the public home/explore
 * feeds, search, public profiles and checkout.
 */

export interface EventStatusMeta {
	/** Short label shown on badges, e.g. "Pending Approval". */
	label: string;
	/** Longer explanation for tooltips and helper copy. */
	description: string;
}

const STATUS_META: Record<EventStatus, EventStatusMeta> = {
	pending: {
		label: 'Pending Approval',
		description: 'Submitted and waiting for the Owltside review team to publish it.'
	},
	published: {
		label: 'Published',
		description: 'Live on the Owltside home and explore feeds.'
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

/** Missing status on legacy records is treated as published. */
export function normalizedEventStatus(event: Pick<EventItem, 'status'> | { status?: EventStatus }): EventStatus {
	return event.status ?? 'published';
}

export function isPubliclyVisible(event: Pick<EventItem, 'status'> | { status?: EventStatus }): boolean {
	return normalizedEventStatus(event) === 'published';
}

export function eventStatusMeta(status: EventStatus | undefined): EventStatusMeta {
	return STATUS_META[status ?? 'published'];
}

export function eventStatusLabel(status: EventStatus | undefined): string {
	return eventStatusMeta(status).label;
}

/** True when the event is waiting on an admin decision. */
export function awaitingReview(event: Pick<EventItem, 'status'> | { status?: EventStatus }): boolean {
	return normalizedEventStatus(event) === 'pending';
}
