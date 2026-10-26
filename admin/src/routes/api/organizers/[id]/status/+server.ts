import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import { getOrganizer, setOrganizerStatus } from '$admin/server/store';
import type { AdminOrganizer } from '$admin/types';
import { adminDataSource } from '$admin/server/supabase-data';

const ALLOWED: AdminOrganizer['status'][] = ['verified', 'pending', 'flagged', 'suspended'];

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (adminDataSource() === 'supabase') error(501, 'Organizer KYB status cannot be changed: no KYB table or admin status field exists in the current schema.');
	const admin = requireMutation(locals.admin);
	const body = (await request.json().catch(() => ({}))) as { status?: string; reason?: string };
	if (!body.status || !ALLOWED.includes(body.status as AdminOrganizer['status'])) {
		error(400, 'Invalid organizer status.');
	}
	const organizer = getOrganizer(params.id);
	if (!organizer) error(404, 'Organizer not found.');
	const updated = setOrganizerStatus(
		organizer.id,
		body.status as AdminOrganizer['status'],
		admin.name,
		body.reason || `KYB ${body.status} decision`
	);
	return json({ ok: true, organizer: { id: updated?.id, status: updated?.status } });
};
