import { browser } from '$app/environment';
import type { NotificationItem } from '$lib/types';

const SEEN_STORAGE_KEY = 'owltside.push.seen.v1';

export interface DeviceNotificationInput {
	title: string;
	body: string;
	url?: string;
	tag?: string;
	silent?: boolean;
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

	const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
		body: input.body,
		icon: '/icon.svg',
		badge: '/icon.svg',
		tag: input.tag ?? `owltside-${Date.now()}`,
		silent: Boolean(input.silent ?? false),
		vibrate: input.silent ? undefined : [120, 60, 120],
		renotify: true,
		data: { url: input.url ?? '/notifications' }
	};

	const reg = await ensureServiceWorkerRegistration();
	if (reg) {
		try {
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
	if (reg && 'pushManager' in reg) {
		try {
			const cfgRes = await fetch('/api/push/subscribe');
			const cfg = (await cfgRes.json().catch(() => ({}))) as { vapidPublicKey?: string | null };
			if (cfg.vapidPublicKey) {
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
			}
		} catch {
			// Service worker showNotification still works even without external VAPID relay
		}
	}

	if (!options?.silentWelcome) {
		await showDeviceNotification({
			title: 'Owltside Push Active',
			body: 'Pass updates, transfers, and organizer broadcasts will alert your phone.',
			url: '/notifications',
			tag: 'owltside-push-welcome'
		});
	}

	return { ok: true, permission: 'granted' };
}

export async function disablePushNotifications(): Promise<void> {
	if (!browser) return;
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

function readSeenIds(): Set<string> | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(SEEN_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? new Set(parsed.map(String)) : null;
	} catch {
		return null;
	}
}

function writeSeenIds(ids: Set<string>): void {
	if (!browser) return;
	try {
		const recent = [...ids].slice(-250);
		localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(recent));
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
