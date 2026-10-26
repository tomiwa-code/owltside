import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import { getEvent, setEventStatus } from '$admin/server/store';
import type { PlatformStatus } from '$admin/types';
import { adminDataSource } from '$admin/server/supabase-data';

const ALLOWED: PlatformStatus[] = ['published', 'pending', 'draft', 'suspended'];

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (adminDataSource() === 'supabase') error(501, 'Event moderation is unavailable: public.events has no admin status field.');
	const admin = requireMutation(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { status?: string; reason?: string };
	if (!body.status || !ALLOWED.includes(body.status as PlatformStatus)) {
		error(400, 'Invalid event status.');
	}
	const event = getEvent(params.id);
	if (!event) error(404, 'Event not found.');

	const updated = setEventStatus(
		event.id,
		body.status as PlatformStatus,
		admin.name,
		body.reason || `Admin ${body.status} decision from events console`
	);
	return json({ ok: true, event: { id: updated?.id, status: updated?.status } });
};
