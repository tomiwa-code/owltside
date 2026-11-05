import type { NotificationItem } from '$lib/types';

/**
 * Platform announcements have their own kind. Organizer broadcasts predate that
 * kind, so their stable `Announcement · …` title prefix is recognized too.
 */
export function isAnnouncement(notification: Pick<NotificationItem, 'kind' | 'title'>): boolean {
	return (
		notification.kind === 'announcement' ||
		/^Announcement\s*(?:[·—:–-]|$)/i.test(notification.title.trim())
	);
}
