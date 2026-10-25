import { error, json, redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { AuthzError, readSession } from '$admin/server/auth';

const PUBLIC_PATHS = ['/login', '/api/health', '/api/session-probe', '/api/client-log'];

function decorate(response: Response, pathname: string, signedIn: boolean): Response {
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	if (process.env.NODE_ENV === 'production') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
	}
	if (pathname.startsWith('/api/')) {
		response.headers.set('Cache-Control', 'no-store, max-age=0');
	}
	if (signedIn) {
		response.headers.set('Cache-Control', 'private, no-store');
	}
	return response;
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.admin = readSession(event.cookies);
	event.locals.requestId = randomUUID();

	const { pathname, search } = event.url;
	const isAsset = /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|css|js|map|txt|xml|webmanifest)$/i.test(pathname);
	const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

	if (!event.locals.admin && !isPublic && !isAsset) {
		if (pathname.startsWith('/api/')) {
			return decorate(json({ error: 'Sign in required.' }, { status: 401 }), pathname, false);
		}
		const target = `${pathname}${search}`;
		// `/` is the default landing spot; no need to remember it as a return path.
		redirect(303, target === '/' ? '/login' : `/login?next=${encodeURIComponent(target)}`);
	}

	try {
		const response = await resolve(event);
		response.headers.set('X-Request-Id', event.locals.requestId);
		return decorate(response, pathname, Boolean(event.locals.admin));
	} catch (thrown) {
		// Authorisation failures are a first-class gateway response, not a 500.
		if (thrown instanceof AuthzError) {
			if (pathname.startsWith('/api/')) {
				return decorate(json({ error: thrown.message }, { status: thrown.status }), pathname, true);
			}
			error(thrown.status, thrown.message);
		}
		throw thrown;
	}
};

export const init: ServerInit = () => {
	// Fail closed in production when the shared signing secret is missing.
	if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_SESSION_SECRET) {
		throw new Error('ADMIN_SESSION_SECRET must be set before starting the admin control plane in production.');
	}
};
