import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import { createEvent, getOrganizer } from '$admin/server/store';
import { adminDataSource } from '$admin/server/supabase-data';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (adminDataSource() === 'supabase') error(501, 'Event creation is disabled for Supabase-backed data until the schema includes admin-managed event status and audit fields.');
	const admin = requireMutation(locals.admin);
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const title = String(body.title ?? '').trim();
	const category = String(body.category ?? '').trim();
	const organizerId = String(body.organizerId ?? '').trim();
	const startsAt = String(body.startsAt ?? '').trim();
	const venue = String(body.venue ?? '').trim();
	const city = String(body.city ?? '').trim();
	const capacity = Number(body.capacity ?? 0);
	const priceNgn = Number(body.priceNgn ?? 0);

	if (title.length < 3) error(400, 'Event title must be at least 3 characters.');
	if (!category) error(400, 'Choose an event category.');
	if (!getOrganizer(organizerId)) error(400, 'Choose a valid organizer.');
	if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) error(400, 'Choose a valid start date.');
	if (!venue) error(400, 'Venue is required.');
	if (!Number.isFinite(capacity) || capacity < 10) error(400, 'Capacity must be at least 10.');
	if (!Number.isFinite(priceNgn) || priceNgn < 0) error(400, 'Ticket price must be zero or more.');

	const event = createEvent(
		{
			title,
			category,
			organizerId,
			startsAt: new Date(startsAt).toISOString(),
			venue,
			city,
			capacity: Math.round(capacity),
			priceNgn: Math.round(priceNgn)
		},
		admin.name
	);
	return json({ ok: true, event });
};
