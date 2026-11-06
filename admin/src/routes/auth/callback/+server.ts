import { redirect, type RequestHandler } from '@sveltejs/kit';
import {
	completeAdminAuthCallback,
	isSecureRequest,
	writeSessionCookie
} from '$admin/server/auth';
import type { AdminSession } from '$admin/types';

function buildSession(
	session: Omit<AdminSession, 'issuedAt' | 'expiresAt'>,
	expiresAt: Date
): AdminSession {
	return { ...session, issuedAt: new Date().toISOString(), expiresAt: expiresAt.toISOString() };
}

export const GET: RequestHandler = async ({ request, cookies, url, getClientAddress }) => {
	const https = isSecureRequest(request, url);
	const result = await completeAdminAuthCallback({
		cookies,
		url,
		ip: getClientAddress(),
		https
	});

	if (!result.ok) {
		const params = new URLSearchParams({ error: result.error });
		if (result.next && result.next !== '/dashboard') params.set('next', result.next);
		redirect(303, `/login?${params.toString()}`);
	}

	writeSessionCookie(cookies, buildSession(result.session, result.expiresAt), { https });
	redirect(303, result.next);
};
