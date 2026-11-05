import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAudit, requireMutation } from '$admin/server/auth';
import {
	listPlatformAnnouncements,
	sendPlatformAnnouncement
} from '$admin/server/announcements';

export const GET: RequestHandler = async ({ locals, url }) => {
	requireAudit(locals.admin);
	const limit = Number(url.searchParams.get('limit') ?? 8);
	try {
		return json({ items: await listPlatformAnnouncements(limit) });
	} catch (cause) {
		error(400, cause instanceof Error ? cause.message : 'Announcements could not be loaded.');
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const admin = requireMutation(locals.admin);
	const input = (await request.json().catch(() => ({}))) as {
		title?: unknown;
		body?: unknown;
		message?: unknown;
	};
	const message = input.body ?? input.message;
	if (typeof input.title !== 'string' || typeof message !== 'string') {
		error(400, 'Enter an announcement title and message.');
	}

	try {
		const announcement = await sendPlatformAnnouncement(
			{ title: input.title, body: message },
			admin.name
		);
		return json({ ok: true, announcement }, { status: 201 });
	} catch (cause) {
		error(400, cause instanceof Error ? cause.message : 'The announcement could not be sent.');
	}
};
