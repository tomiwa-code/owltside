// Owltside Service Worker — offline shell cache + native phone/OS push notifications.
const CACHE = 'owltside-shell-v2';
const PRECACHE = ['/', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.catch(() => {})
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
	);
	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;
	// Never intercept API calls, auth callbacks, or Vite dev module requests.
	if (
		url.pathname.startsWith('/api/') ||
		url.pathname.startsWith('/auth/') ||
		url.pathname.startsWith('/@') ||
		url.pathname.startsWith('/src/') ||
		url.pathname.startsWith('/node_modules/')
	) {
		return;
	}
	event.respondWith(
		fetch(req)
			.then((res) => {
				if (res.ok && res.type === 'basic') {
					const copy = res.clone();
					caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
				}
				return res;
			})
			.catch(() => caches.match(req).then((hit) => hit || caches.match('/')))
	);
});

function buildNotificationOptions(payload) {
	const url = payload.url || payload.href || '/notifications';
	return {
		body: payload.body || 'Tap to view in Owltside.',
		icon: payload.icon || '/icon.svg',
		badge: payload.badge || '/icon.svg',
		tag: payload.tag || `owltside-${Date.now()}`,
		renotify: Boolean(payload.renotify ?? true),
		silent: Boolean(payload.silent ?? false),
		vibrate: payload.silent ? undefined : [120, 60, 120],
		data: { url }
	};
}

// Handle incoming Web Push events (W3C Push API / VAPID)
self.addEventListener('push', (event) => {
	let payload = {
		title: 'Owltside',
		body: 'You have a new update in Owltside.',
		url: '/notifications'
	};
	if (event.data) {
		try {
			const parsed = event.data.json();
			payload = { ...payload, ...parsed };
		} catch {
			payload.body = event.data.text() || payload.body;
		}
	}
	const options = buildNotificationOptions(payload);
	event.waitUntil(
		(self.registration.getNotifications
			? self.registration.getNotifications({ tag: options.tag })
			: Promise.resolve([])
		).then((existing) => {
			if (existing && existing.length > 0) return undefined;
			return self.registration.showNotification(payload.title || 'Owltside', options);
		})
	);
});

// Handle client-dispatched notification requests (required on Android/iOS PWA)
self.addEventListener('message', (event) => {
	const data = event.data;
	if (!data || data.type !== 'OWLTSIDE_SHOW_NOTIFICATION') return;
	const payload = data.payload || {};
	event.waitUntil(
		self.registration.showNotification(
			payload.title || 'Owltside',
			buildNotificationOptions(payload)
		)
	);
});

// Focus or open the target route when the user taps the phone notification
self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const rawUrl = (event.notification.data && event.notification.data.url) || '/notifications';
	const targetUrl = new URL(rawUrl, self.location.origin).href;

	event.waitUntil(
		self.clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((windowClients) => {
				for (const client of windowClients) {
					if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
						return client
							.navigate(targetUrl)
							.catch(() => client)
							.then(() => client.focus());
					}
				}
				if (self.clients.openWindow) {
					return self.clients.openWindow(targetUrl);
				}
				return undefined;
			})
	);
});
