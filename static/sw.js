/* Owltside service worker — cache-first hashed assets, network-first navigation. */
const VERSION = 'owltside-v2';
const CORE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/logo.png'];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(VERSION)
			.then((cache) => cache.addAll(CORE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;
	if (url.pathname.startsWith('/auth/') || ['code', 'token_hash', 'error', 'error_description'].some((key) => url.searchParams.has(key))) return;

	// Navigations: network first, fall back to cached shell for offline.
	if (req.mode === 'navigate') {
		event.respondWith(
			fetch(req)
				.then((res) => {
					if (url.pathname === '/' && res.ok && !res.redirected && !/no-store|private/.test(res.headers.get('cache-control') ?? '')) {
						const copy = res.clone();
						caches.open(VERSION).then((c) => c.put('/', copy));
					}
					return res;
				})
				.catch(() => caches.match('/'))
		);
		return;
	}

	// Hashed immutable assets + static media: cache first.
	if (url.pathname.startsWith('/_app/immutable/') || url.pathname.startsWith('/icons/') || url.pathname.endsWith('.png')) {
		event.respondWith(
			caches.match(req).then(
				(hit) =>
					hit ||
					fetch(req).then((res) => {
						const copy = res.clone();
						caches.open(VERSION).then((c) => c.put(req, copy));
						return res;
					})
			)
		);
	}
});
