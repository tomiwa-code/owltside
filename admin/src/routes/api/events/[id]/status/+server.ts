import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireMutation } from '$admin/server/auth';
import {
	setEventPlatformStatus,
	type ModerableEventStatus
} from '$admin/server/admin-actions';

const VALID_STATUSES: ModerableEventStatus[] = [
	'published',
	'suspended',
	'rejected',
	'pending',
	'draft'
];

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const admin = requireMutation(locals.admin);
	const body = (await request.json().catch(() => ({}))) as {
		status?: string;
		reason?: string;
	};
	const status = String(body.status ?? '') as ModerableEventStatus;
	if (!VALID_STATUSES.includes(status)) {
		error(400, `Invalid event status "${status}".`);
	}
	try {
		const updated = await setEventPlatformStatus(
			params.id,
			status,
			admin.name,
			typeof body.reason === 'string' ? body.reason : ''
		);
		return json({ ok: true, event: updated });
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Unable to update event status.');
	}
};
