import type { AdminAnnouncement } from '$admin/types';
import { createAdminClient } from './supabase-data';
import { logAudit } from './store';

export const ANNOUNCEMENT_TITLE_MAX = 100;
export const ANNOUNCEMENT_BODY_MAX = 2000;

function validateInput(input: { title: string; body: string }, actor: string) {
	const title = input.title.trim();
	const body = input.body.trim();
	if (!title) throw new Error('Enter an announcement title.');
	if (title.length > ANNOUNCEMENT_TITLE_MAX) {
		throw new Error(`Keep the announcement title under ${ANNOUNCEMENT_TITLE_MAX} characters.`);
	}
	if (!body) throw new Error('Enter an announcement message.');
	if (body.length > ANNOUNCEMENT_BODY_MAX) {
		throw new Error(`Keep the announcement message under ${ANNOUNCEMENT_BODY_MAX} characters.`);
	}
	if (!actor.trim()) throw new Error('Admin actor is required.');
	return { title, body, actor: actor.trim() };
}

function mapAnnouncement(row: Record<string, unknown>): AdminAnnouncement {
	return {
		id: String(row.announcement_id ?? row.id ?? ''),
		title: String(row.title ?? ''),
		body: String(row.body ?? ''),
		recipientCount: Math.max(0, Number(row.recipient_count ?? row.recipientCount ?? 0)),
		sentBy: String(row.sent_by ?? row.sentBy ?? ''),
		sentAt: String(row.sent_at ?? row.sentAt ?? '')
	};
}

/**
 * Atomically records one platform announcement and fans it out to every public
 * profile through the service-role-only database RPC.
 */
export async function sendPlatformAnnouncement(
	input: { title: string; body: string },
	actor: string
): Promise<AdminAnnouncement> {
	const clean = validateInput(input, actor);
	const client = createAdminClient();
	const { data, error } = await client.rpc('send_platform_announcement', {
		p_title: clean.title,
		p_body: clean.body,
		p_sent_by: clean.actor
	});
	if (error) throw new Error(error.message);
	const row = Array.isArray(data) ? data[0] : data;
	if (!row) throw new Error('The announcement could not be saved. No users were notified.');

	const announcement = mapAnnouncement(row as Record<string, unknown>);
	if (!announcement.id) throw new Error('The announcement could not be saved. No users were notified.');
	logAudit({
		actor: clean.actor,
		action: 'PLATFORM_ANNOUNCEMENT_SENT',
		kind: 'announcement',
		entityId: announcement.id,
		target: announcement.title,
		reason: announcement.body,
		severity: 'info',
		diff: [
			{ field: 'audience', before: '—', after: 'All public app users' },
			{
				field: 'recipients',
				before: '0',
				after: String(announcement.recipientCount)
			}
		]
	});
	return announcement;
}

export async function listPlatformAnnouncements(limit = 8): Promise<AdminAnnouncement[]> {
	const safeLimit = Number.isFinite(limit) ? Math.min(50, Math.max(1, Math.floor(limit))) : 8;
	const client = createAdminClient();
	const { data, error } = await client
		.from('platform_announcements')
		.select('id,title,body,recipient_count,sent_by,sent_at')
		.order('sent_at', { ascending: false })
		.limit(safeLimit);
	if (error) throw new Error(error.message);
	return (data ?? []).map((row) => mapAnnouncement(row as Record<string, unknown>));
}
