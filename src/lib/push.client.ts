import { browser } from '$app/environment';
import type { Conversation, MessageRequest, NotificationItem } from '$lib/types';

const SEEN_STORAGE_KEY = 'owltside.push.seen.v1';
const SEEN_DM_KEY_PREFIX = 'owltside.push.dm.seen.v1:';
const SEEN_MSGREQ_KEY_PREFIX = 'owltside.push.msgreq.seen.v1:';
const DELIVERED_DM_KEY_PREFIX = 'owltside.push.dm.delivered.v1:';

export interface DeviceNotificationInput {
	title: string;
	body: string;
	url?: string;
	tag?: string;
	silent?: boolean;
}

export interface InboxPushPrefs {
	pushEnabled: boolean;
	messages: boolean;
	soundHaptics: boolean;
}

interface SeenConversationEntry {
	unread: number;
	lastAt: string;
	lastMessage: string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}

export function dmNotificationTag(conversationId: string, sentAtOrKey: string): string {
	const parsedMs = Date.parse(sentAtOrKey);
	const suffix = Number.isFinite(parsedMs) ? String(parsedMs) : sentAtOrKey.slice(0, 32);
	return `owltside-dm-${conversationId}-${suffix}`;
}

export function getPushPermissionState(): NotificationPermission | 'unsupported' {
	if (!browser || typeof window.Notification === 'undefined') {
		return 'unsupported';
	}
	return Notification.permission;
}

export async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
	if (!browser || !('serviceWorker' in navigator)) return null;
	try {
		const existing = await navigator.serviceWorker.getRegistration('/');
		const reg = existing ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
		const ready = await Promise.race([
			navigator.serviceWorker.ready,
			new Promise<ServiceWorkerRegistration>((resolve) => setTimeout(() => resolve(reg), 3_000))
		]);
		return ready;
	} catch {
		return null;
	}
}

export async function showDeviceNotification(input: DeviceNotificationInput): Promise<boolean> {
	if (!browser || typeof window.Notification === 'undefined') return false;
	if (Notification.permission !== 'granted') return false;

	const tag = input.tag ?? `owltside-${Date.now()}`;
	const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
		body: input.body,
		icon: '/icon.svg',
		badge: '/icon.svg',
		tag,
		silent: Boolean(input.silent ?? false),
		vibrate: input.silent ? undefined : [120, 60, 120],
		renotify: true,
		data: { url: input.url ?? '/notifications' }
	};

	const reg = await ensureServiceWorkerRegistration();
	if (reg) {
		try {
			if (typeof reg.getNotifications === 'function') {
				const activeWithSameTag = await reg.getNotifications({ tag }).catch(() => []);
				if (activeWithSameTag.length > 0) return true;
			}
			await reg.showNotification(input.title, options);
			return true;
		} catch {
			if (reg.active) {
				reg.active.postMessage({
					type: 'OWLTSIDE_SHOW_NOTIFICATION',
					payload: {
						title: input.title,
						body: input.body,
						url: input.url ?? '/notifications',
						tag: options.tag,
						silent: options.silent
					}
				});
				return true;
			}
		}
	}

	// Desktop browser fallback when service worker is unavailable
	try {
		const n = new Notification(input.title, {
			body: input.body,
			icon: '/icon.svg',
			tag: options.tag,
			silent: options.silent
		});
		n.onclick = () => {
			window.focus();
			if (input.url) window.location.href = input.url;
			n.close();
		};
		return true;
	} catch {
		return false;
	}
}

async function registerBrowserPushSubscription(reg: ServiceWorkerRegistration): Promise<void> {
	if (!('pushManager' in reg)) return;
	try {
		const cfgRes = await fetch('/api/push/subscribe');
		const cfg = (await cfgRes.json().catch(() => ({}))) as { vapidPublicKey?: string | null };
		if (!cfg.vapidPublicKey) return;
		const existingSub = await reg.pushManager.getSubscription();
		const sub =
			existingSub ??
			(await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey) as BufferSource
			}));
		await fetch('/api/push/subscribe', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(sub.toJSON())
		});
	} catch {
		// Service worker showNotification still works even if pushManager registration fails
	}
}

let syncedSessionUserId: string | null = null;

/**
 * Quietly ensure an already-authorized browser has its W3C PushSubscription
 * synced with `/api/push/subscribe` for background delivery (no UI prompt or banner).
 */
export async function syncPushSubscriptionIfGranted(userId?: string): Promise<void> {
	if (!browser || !userId) return;
	if (syncedSessionUserId === userId) return;
	if (getPushPermissionState() !== 'granted') return;
	syncedSessionUserId = userId;
	const reg = await ensureServiceWorkerRegistration();
	if (reg) {
		await registerBrowserPushSubscription(reg);
	}
}

export async function enablePushNotifications(options?: {
	silentWelcome?: boolean;
}): Promise<{
	ok: boolean;
	permission: NotificationPermission | 'unsupported';
	reason?: string;
}> {
	if (!browser) return { ok: false, permission: 'unsupported', reason: 'Browser required.' };
	if (!window.isSecureContext) {
		return {
			ok: false,
			permission: 'unsupported',
			reason: 'Push notifications require HTTPS or localhost.'
		};
	}
	if (typeof window.Notification === 'undefined') {
		const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
		return {
			ok: false,
			permission: 'unsupported',
			reason: isIos
				? 'On iPhone/iPad, tap Share → Add to Home Screen first to enable iOS push notifications.'
				: 'This browser does not support OS push notifications.'
		};
	}

	let permission: NotificationPermission = Notification.permission;
	if (permission === 'default') {
		try {
			permission = await Notification.requestPermission();
		} catch {
			permission = Notification.permission;
		}
	}

	if (permission !== 'granted') {
		return {
			ok: false,
			permission,
			reason:
				permission === 'denied'
					? 'Notifications are blocked in your browser/phone settings. Allow notifications for Owltside and try again.'
					: 'Notification permission was not granted.'
		};
	}

	const reg = await ensureServiceWorkerRegistration();
	if (reg) {
		await registerBrowserPushSubscription(reg);
	}

	if (!options?.silentWelcome) {
		await showDeviceNotification({
			title: 'Owltside Push Active',
			body: 'Pass updates, inbox messages, transfers, and organizer broadcasts will alert your phone.',
			url: '/notifications',
			tag: 'owltside-push-welcome'
		});
	}

	return { ok: true, permission: 'granted' };
}

export async function disablePushNotifications(): Promise<void> {
	if (!browser) return;
	syncedSessionUserId = null;
	try {
		const reg = await navigator.serviceWorker?.getRegistration('/');
		const sub = await reg?.pushManager?.getSubscription();
		if (sub) {
			const endpoint = sub.endpoint;
			await sub.unsubscribe().catch(() => undefined);
			await fetch('/api/push/subscribe', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ endpoint })
			}).catch(() => undefined);
		}
	} catch {
		// Ignore cleanup failures
	}
}

function readSeenIds(storageKey = SEEN_STORAGE_KEY): Set<string> | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(storageKey);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? new Set(parsed.map(String)) : null;
	} catch {
		return null;
	}
}

function writeSeenIds(ids: Set<string>, storageKey = SEEN_STORAGE_KEY): void {
	if (!browser) return;
	try {
		const recent = [...ids].slice(-250);
		localStorage.setItem(storageKey, JSON.stringify(recent));
	} catch {
		// Ignore quota errors
	}
}

export async function notifyUnreadStreamItems(
	items: NotificationItem[],
	prefs: {
		pushEnabled: boolean;
		eventReminders: boolean;
		marketing: boolean;
		soundHaptics: boolean;
	}
): Promise<void> {
	if (!browser || !prefs.pushEnabled) return;
	if (getPushPermissionState() !== 'granted') return;

	const existingSeen = readSeenIds();
	// First time on this browser: baseline existing historical notifications so we only
	// pop OS alerts for fresh notifications (created within the last 45s) and future arrivals.
	if (existingSeen === null) {
		const seeded = new Set<string>();
		const freshCutoff = Date.now() - 45_000;
		const freshUnread: NotificationItem[] = [];
		for (const item of items) {
			if (!item.read && +new Date(item.at) >= freshCutoff) {
				freshUnread.push(item);
			} else {
				seeded.add(item.id);
			}
		}
		for (const item of freshUnread) seeded.add(item.id);
		writeSeenIds(seeded);
		for (const item of freshUnread.slice(0, 3)) {
			if (item.kind === 'promo' && !prefs.marketing) continue;
			if (item.kind === 'event' && !prefs.eventReminders) continue;
			await showDeviceNotification({
				title: item.title,
				body: item.body,
				url: item.href ?? '/notifications',
				tag: `owltside-notif-${item.id}`,
				silent: !prefs.soundHaptics
			});
		}
		return;
	}

	const newlyArrived = items.filter((item) => !item.read && !existingSeen.has(item.id));
	if (newlyArrived.length === 0) return;

	for (const item of items) existingSeen.add(item.id);
	writeSeenIds(existingSeen);

	for (const item of newlyArrived.slice(0, 3)) {
		if (item.kind === 'promo' && !prefs.marketing) continue;
		if (item.kind === 'event' && !prefs.eventReminders) continue;
		await showDeviceNotification({
			title: item.title,
			body: item.body,
			url: item.href ?? '/notifications',
			tag: `owltside-notif-${item.id}`,
			silent: !prefs.soundHaptics
		});
	}
}

function readSeenConversations(userId: string): Record<string, SeenConversationEntry> | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(`${SEEN_DM_KEY_PREFIX}${userId}`);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
		return parsed as Record<string, SeenConversationEntry>;
	} catch {
		return null;
	}
}

function writeSeenConversations(
	userId: string,
	map: Record<string, SeenConversationEntry>
): void {
	if (!browser) return;
	try {
		const entries = Object.entries(map).slice(-200);
		localStorage.setItem(`${SEEN_DM_KEY_PREFIX}${userId}`, JSON.stringify(Object.fromEntries(entries)));
	} catch {
		// Ignore storage quota errors
	}
}

function buildDmFingerprint(conversationId: string, sentAt: string, body: string): string {
	const ms = Date.parse(sentAt);
	const timeBucket = Number.isFinite(ms) ? String(Math.floor(ms / 1000)) : sentAt.slice(0, 19);
	return `${conversationId}::${timeBucket}::${body.trim().slice(0, 80)}`;
}

function hasDeliveredDm(
	userId: string,
	conversationId: string,
	sentAt: string,
	body: string
): boolean {
	const set = readSeenIds(`${DELIVERED_DM_KEY_PREFIX}${userId}`);
	if (!set) return false;
	const exact = buildDmFingerprint(conversationId, sentAt, body);
	return set.has(exact);
}

function markDeliveredDm(
	userId: string,
	conversationId: string,
	sentAt: string,
	body: string
): void {
	const key = `${DELIVERED_DM_KEY_PREFIX}${userId}`;
	const set = readSeenIds(key) ?? new Set<string>();
	set.add(buildDmFingerprint(conversationId, sentAt, body));
	writeSeenIds(set, key);
}

/**
 * Pre-seed a conversation's unread baseline (e.g. when an organizer clicks Accept
 * on a message request they already saw) so accepting doesn't echo-notify them.
 */
export function markConversationPushBaseline(
	conversationId: string,
	unread: number,
	lastAt: string,
	lastMessage: string,
	userId = 'default'
): void {
	if (!browser || !conversationId) return;
	const existing = readSeenConversations(userId) ?? {};
	existing[conversationId] = { unread, lastAt, lastMessage };
	writeSeenConversations(userId, existing);
	if (lastAt || lastMessage) {
		markDeliveredDm(userId, conversationId, lastAt, lastMessage);
	}
}

/**
 * Deliver an OS push notification immediately when a Realtime `messages` INSERT
 * or active thread poll observes a message sent by another user (`senderId !== meId`).
 * Shares deduplication state with `notifyUnreadInboxItems` so the same message never alerts twice.
 */
export async function notifyIncomingDirectMessage(
	input: {
		id?: string;
		conversationId: string;
		senderName: string;
		body: string;
		sentAt: string;
	},
	prefs: InboxPushPrefs,
	userId = 'default'
): Promise<boolean> {
	if (!browser || !prefs.pushEnabled || prefs.messages === false) return false;
	if (getPushPermissionState() !== 'granted') return false;
	if (!input.conversationId) return false;

	if (hasDeliveredDm(userId, input.conversationId, input.sentAt, input.body)) {
		return false;
	}
	markDeliveredDm(userId, input.conversationId, input.sentAt, input.body);

	const senderLabel = input.senderName?.trim() || 'Owltside User';
	return showDeviceNotification({
		title: `New message from ${senderLabel}`,
		body: input.body?.trim() || 'Sent you a message.',
		url: `/inbox/${input.conversationId}`,
		tag: dmNotificationTag(input.conversationId, input.sentAt || input.id || String(Date.now())),
		silent: !prefs.soundHaptics
	});
}

/**
 * Deliver OS push notifications for newly arrived unread inbox messages (`conversations`)
 * and incoming organizer contact requests (`message_requests`), mirroring `notifyUnreadStreamItems`.
 */
export async function notifyUnreadInboxItems(
	conversations: Conversation[] | undefined,
	requests: MessageRequest[] | undefined,
	prefs: InboxPushPrefs,
	userId = 'default'
): Promise<void> {
	if (!browser || !prefs.pushEnabled) return;
	if (getPushPermissionState() !== 'granted') return;

	const allowMessages = prefs.messages !== false;
	const freshCutoff = Date.now() - 45_000;

	if (Array.isArray(conversations)) {
		const existing = readSeenConversations(userId);
		if (existing === null) {
			const seeded: Record<string, SeenConversationEntry> = {};
			const freshIncoming: Conversation[] = [];
			for (const conv of conversations) {
				const unread = conv.unread ?? 0;
				seeded[conv.id] = {
					unread,
					lastAt: conv.lastAt ?? '',
					lastMessage: conv.lastMessage ?? ''
				};
				if (unread > 0 && +new Date(conv.lastAt) >= freshCutoff) {
					freshIncoming.push(conv);
				}
			}
			writeSeenConversations(userId, seeded);

			if (allowMessages) {
				for (const conv of freshIncoming.slice(0, 3)) {
					if (hasDeliveredDm(userId, conv.id, conv.lastAt ?? '', conv.lastMessage ?? '')) continue;
					markDeliveredDm(userId, conv.id, conv.lastAt ?? '', conv.lastMessage ?? '');
					await showDeviceNotification({
						title: `New message from ${conv.peer?.name || 'Owltside User'}`,
						body: conv.lastMessage || 'Tap to open conversation in Inbox.',
						url: `/inbox/${conv.id}`,
						tag: dmNotificationTag(conv.id, conv.lastAt || String(conv.unread)),
						silent: !prefs.soundHaptics
					});
				}
			}
		} else {
			const nextSeen: Record<string, SeenConversationEntry> = { ...existing };
			const newlyArrived: Conversation[] = [];

			for (const conv of conversations) {
				const prev = existing[conv.id];
				const unread = conv.unread ?? 0;
				const lastAt = conv.lastAt ?? '';
				const lastMessage = conv.lastMessage ?? '';

				if ((!prev && unread > 0) || (prev && unread > prev.unread)) {
					newlyArrived.push(conv);
				}
				nextSeen[conv.id] = { unread, lastAt, lastMessage };
			}
			writeSeenConversations(userId, nextSeen);

			if (allowMessages) {
				for (const conv of newlyArrived.slice(0, 3)) {
					if (hasDeliveredDm(userId, conv.id, conv.lastAt ?? '', conv.lastMessage ?? '')) continue;
					markDeliveredDm(userId, conv.id, conv.lastAt ?? '', conv.lastMessage ?? '');
					await showDeviceNotification({
						title: `New message from ${conv.peer?.name || 'Owltside User'}`,
						body: conv.lastMessage || 'Tap to open conversation in Inbox.',
						url: `/inbox/${conv.id}`,
						tag: dmNotificationTag(conv.id, conv.lastAt || String(conv.unread)),
						silent: !prefs.soundHaptics
					});
				}
			}
		}
	}

	if (Array.isArray(requests)) {
		const reqKey = `${SEEN_MSGREQ_KEY_PREFIX}${userId}`;
		const existingReqs = readSeenIds(reqKey);
		if (existingReqs === null) {
			const seededReqs = new Set<string>();
			const freshReqs: MessageRequest[] = [];
			for (const req of requests) {
				seededReqs.add(req.id);
				if (+new Date(req.createdAt) >= freshCutoff) {
					freshReqs.push(req);
				}
			}
			writeSeenIds(seededReqs, reqKey);

			if (allowMessages) {
				for (const req of freshReqs.slice(0, 3)) {
					await showDeviceNotification({
						title: `Message request from ${req.requester?.name || 'Attendee'}`,
						body: req.body || 'New event inquiry in your Inbox.',
						url: '/inbox',
						tag: `owltside-msgreq-${req.id}`,
						silent: !prefs.soundHaptics
					});
				}
			}
		} else {
			const newReqs = requests.filter((req) => !existingReqs.has(req.id));
			if (newReqs.length > 0) {
				for (const req of requests) existingReqs.add(req.id);
				writeSeenIds(existingReqs, reqKey);

				if (allowMessages) {
					for (const req of newReqs.slice(0, 3)) {
						await showDeviceNotification({
							title: `Message request from ${req.requester?.name || 'Attendee'}`,
							body: req.body || 'New event inquiry in your Inbox.',
							url: '/inbox',
							tag: `owltside-msgreq-${req.id}`,
							silent: !prefs.soundHaptics
						});
					}
				}
			}
		}
	}
}
