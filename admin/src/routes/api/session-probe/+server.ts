import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Unauthenticated diagnostic used by the sign-in screen after a bounce.
 */
export const GET: RequestHandler = ({ locals, request, url }) => {
	const cookieHeader = request.headers.get('cookie') ?? '';
	const cookieSeen = cookieHeader.includes('owl_admin_session');
	const payload = {
		authed: Boolean(locals.admin),
		cookieSeen,
		mode: 'live' as const
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
