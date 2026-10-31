import { createAdminClient } from './supabase-data';
import { logAudit } from './store';
import type { PlatformStatus } from '$admin/types';

export type ModerableEventStatus = Extract<
	PlatformStatus,
	'published' | 'suspended' | 'rejected' | 'pending' | 'draft'
>;

export async function setEventPlatformStatus(
	eventId: string,
	status: ModerableEventStatus,
	actor: string,
	reason = ''
): Promise<{ id: string; title: string; status: ModerableEventStatus }> {
	const client = createAdminClient();
	const trimmed = reason.trim();

	const { data: existing, error: readErr } = await client
		.from('events')
		.select('id,title,status,organizer_id')
		.eq('id', eventId)
		.maybeSingle();
	if (readErr) throw new Error(readErr.message);
	if (!existing) throw new Error('Event not found.');

	const now = new Date().toISOString();
	const { data: updated, error: updateErr } = await client
		.from('events')
		.update({
			status,
			moderation_note: trimmed || null,
			moderated_at: now,
			moderated_by: actor
		})
		.eq('id', eventId)
		.select('id,title,status')
		.maybeSingle();
	if (updateErr) throw new Error(updateErr.message);
	if (!updated) throw new Error('Unable to update event status.');

	if (existing.organizer_id && existing.status !== status) {
		const notifyTitle =
			status === 'published'
				? `Your event "${existing.title}" is now live`
				: status === 'suspended'
					? `Your event "${existing.title}" has been disabled`
					: status === 'rejected'
						? `Changes requested on "${existing.title}"`
						: `Status updated for "${existing.title}"`;
		const notifyBody =
			trimmed ||
			(status === 'published'
				? 'Owltside Operations enabled your listing for public discovery and ticket sales.'
				: status === 'suspended'
					? 'Owltside Trust & Safety temporarily disabled public access to this event.'
					: `Listing status is now ${status}.`);

		await client
			.from('notifications')
			.insert({
				user_id: existing.organizer_id,
				kind: 'system',
				title: notifyTitle,
				body: notifyBody,
				time_label: 'Just now',
				unread: true
			})
			.then(() => undefined, () => undefined);
	}

	logAudit({
		actor,
		action:
			status === 'suspended'
				? 'EVENT_DISABLED'
				: status === 'published'
					? 'EVENT_ENABLED'
					: `EVENT_STATUS_${status.toUpperCase()}`,
		kind: 'event',
		entityId: String(existing.id),
		target: String(existing.title ?? eventId),
		reason: trimmed || `Event status changed from ${existing.status} to ${status}`,
		severity: status === 'suspended' || status === 'rejected' ? 'warning' : 'info',
		diff: [{ field: 'status', before: String(existing.status), after: status }]
	});

	return {
		id: String(updated.id),
		title: String(updated.title ?? existing.title ?? 'Event'),
		status: updated.status as ModerableEventStatus
	};
}

export async function deleteEventRecord(
	eventId: string,
	actor: string,
	reason = ''
): Promise<{ id: string; title: string }> {
	const client = createAdminClient();
	const trimmed = reason.trim() || 'Deleted from Owltside Admin control plane';

	const { data: existing, error: readErr } = await client
		.from('events')
		.select('id,title,slug,status,organizer_id')
		.eq('id', eventId)
		.maybeSingle();
	if (readErr) throw new Error(readErr.message);
	if (!existing) throw new Error('Event not found or already deleted.');

	// Clean dependent rows explicitly so deletion succeeds even before migration 026 is run.
	const { data: eventTickets } = await client
		.from('tickets')
		.select('id')
		.eq('event_id', eventId);
	const ticketIds = (eventTickets ?? []).map((row: Record<string, any>) => String(row.id));

	if (ticketIds.length > 0) {
		await client
			.from('approval_requests')
			.delete()
			.in('subject_id', ticketIds)
			.then(() => undefined, () => undefined);
	}
	await Promise.all([
		client
			.from('approval_requests')
			.delete()
			.eq('subject_id', eventId)
			.then(() => undefined, () => undefined),
		client
			.from('content_reports')
			.delete()
			.eq('target_type', 'event')
			.eq('target_id', eventId)
			.then(() => undefined, () => undefined),
		client
			.from('event_promos')
			.delete()
			.eq('event_id', eventId)
			.then(() => undefined, () => undefined),
		client
			.from('message_requests')
			.delete()
			.eq('mutual_event_id', eventId)
			.then(() => undefined, () => undefined)
	]);

	const { error: ticketsErr } = await client.from('tickets').delete().eq('event_id', eventId);
	if (ticketsErr) throw new Error(`Failed clearing event tickets: ${ticketsErr.message}`);

	const { error: ordersErr } = await client.from('orders').delete().eq('event_id', eventId);
	if (ordersErr) throw new Error(`Failed clearing event orders: ${ordersErr.message}`);

	const { error: deleteErr } = await client.from('events').delete().eq('id', eventId);
	if (deleteErr) throw new Error(deleteErr.message);

	if (existing.organizer_id) {
		await client
			.from('notifications')
			.insert({
				user_id: existing.organizer_id,
				kind: 'system',
				title: `Event "${existing.title}" was removed`,
				body: trimmed,
				time_label: 'Just now',
				unread: true
			})
			.then(() => undefined, () => undefined);
	}

	logAudit({
		actor,
		action: 'EVENT_DELETED',
		kind: 'event',
		entityId: String(existing.id),
		target: `${existing.title} (${existing.slug})`,
		reason: trimmed,
		severity: 'critical',
		diff: [{ field: 'status', before: String(existing.status ?? 'published'), after: 'deleted' }]
	});

	return { id: String(existing.id), title: String(existing.title ?? 'Event') };
}

export async function setUserAccountStatus(
	userId: string,
	action: 'disable' | 'enable',
	actor: string,
	reason = '',
	options: { suspendOwnedEvents?: boolean } = {}
): Promise<{ id: string; status: 'active' | 'blocked'; name: string }> {
	const client = createAdminClient();
	const trimmed =
		reason.trim() ||
		(action === 'disable'
			? 'Disabled by Owltside Trust & Safety'
			: 'Account re-enabled by Owltside Admin');

	const [{ data: profile }, authRes] = await Promise.all([
		client.from('profiles').select('id,name,handle').eq('id', userId).maybeSingle(),
		client.auth.admin.getUserById(userId).catch(() => ({ data: { user: null }, error: null }))
	]);

	if (!profile && !authRes.data?.user) {
		throw new Error('User account not found.');
	}

	const existingMeta = ((authRes.data?.user?.user_metadata ?? {}) as Record<string, unknown>) ?? {};
	const now = new Date().toISOString();
	const disable = action === 'disable';

	const { error: authErr } = await client.auth.admin.updateUserById(userId, {
		ban_duration: disable ? '876000h' : 'none',
		user_metadata: {
			...existingMeta,
			account_disabled: disable,
			disabled_reason: disable ? trimmed : null,
			disabled_at: disable ? now : null
		}
	});
	if (authErr) throw new Error(`Auth update failed: ${authErr.message}`);

	// Best-effort mirror onto public.profiles if migration 026 has been applied.
	await client
		.from('profiles')
		.update({
			disabled: disable,
			disabled_reason: disable ? trimmed : null,
			disabled_at: disable ? now : null
		})
		.eq('id', userId)
		.then(() => undefined, () => undefined);

	if (disable && options.suspendOwnedEvents) {
		await client
			.from('events')
			.update({
				status: 'suspended',
				moderation_note: `Organizer account disabled: ${trimmed}`,
				moderated_at: now,
				moderated_by: actor
			})
			.eq('organizer_id', userId)
			.eq('status', 'published')
			.then(() => undefined, () => undefined);
	}

	const displayName = String(
		profile?.name ?? authRes.data?.user?.email ?? profile?.handle ?? userId
	);

	logAudit({
		actor,
		action: disable ? 'USER_ACCOUNT_DISABLED' : 'USER_ACCOUNT_ENABLED',
		kind: 'user',
		entityId: userId,
		target: `${displayName}${profile?.handle ? ` (@${profile.handle})` : ''}`,
		reason: trimmed,
		severity: disable ? 'critical' : 'info',
		diff: [{ field: 'status', before: disable ? 'active' : 'blocked', after: disable ? 'blocked' : 'active' }]
	});

	return {
		id: userId,
		status: disable ? 'blocked' : 'active',
		name: displayName
	};
}
