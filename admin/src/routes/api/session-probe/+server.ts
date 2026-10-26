import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isDemoMode } from '$admin/server/auth';

/**
 * Unauthenticated diagnostic used by the sign-in screen after a bounce.
 *
 * It answers one question the login page cannot answer on its own: when the
 * redirect came back, did the browser send the session cookie at all? A stored
 * cookie that the server rejected is a completely different fault from a cookie
 * the browser never kept, and the advice differs, so report both.
 */
export const GET: RequestHandler = ({ locals, request, url }) => {
	const cookieHeader = request.headers.get('cookie') ?? '';
	const cookieSeen = cookieHeader.includes('owl_admin_session');
	const payload = {
		authed: Boolean(locals.admin),
		cookieSeen,
		mode: isDemoMode() ? ('demo' as const) : ('live' as const)
	};

	if (process.env.NODE_ENV !== 'production') {
		const framed = url.searchParams.get('framed') === '1' ? 'framed' : 'top-level';
		const ua = (request.headers.get('user-agent') ?? 'unknown').slice(0, 72);
		console.log(
			`[login-probe] authed=${payload.authed} cookieSeen=${cookieSeen} context=${framed} ua="${ua}"`
		);
	}

	return json(payload, { headers: { 'cache-control': 'no-store' } });
};
