import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { sendWebPushToUser } from '$lib/server/webpush';
import { clientKey } from '$lib/server/rate-limit';
import { CAPTCHA_FAILURE_MESSAGE, verifyCaptcha } from '$lib/server/captcha';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const failure = (error: unknown, fallback: string) =>
	json({ error: error instanceof Error ? error.message : fallback }, { status: 400 });

export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.session) return json([]);
	try {
		const requests = await getSource(createSupabase(cookies)).getIncomingMessageRequests(locals.session.userId);
		return json(requests, { headers: { 'cache-control': 'private, max-age=30, stale-while-revalidate=60' } });
	} catch (error) {
		return failure(error, 'Message requests could not be loaded');
	}
};

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!locals.session) return json({ error: 'Sign in to contact an organizer.' }, { status: 401 });
	let payload: { eventSlug?: unknown; body?: unknown; captchaToken?: unknown };
	try {
		payload = await request.json();
	} catch {
		return json({ error: 'Request body must be valid JSON.' }, { status: 400 });
	}
	const eventSlug = typeof payload.eventSlug === 'string' ? payload.eventSlug.trim() : '';
	const body = typeof payload.body === 'string' ? payload.body.trim() : '';
	if (!eventSlug) return json({ error: 'Choose an event first.' }, { status: 400 });
	if (body.length < 1 || body.length > 2000) return json({ error: 'Write a message of up to 2,000 characters.' }, { status: 400 });
	// Signed-in users are already rate-limited per account; the challenge mainly
	// stops throwaway accounts and scripts from spamming organizers.
	const captcha = await verifyCaptcha(payload.captchaToken, clientKey(request, 'unknown'));
	if (!captcha.ok) return json({ error: CAPTCHA_FAILURE_MESSAGE }, { status: 403 });
	try {
		const messageRequest = await getSource(createSupabase(cookies)).createMessageRequest(locals.session.userId, eventSlug, body);
		if (messageRequest.organizer?.id && messageRequest.organizer.id !== locals.session.userId) {
			await Promise.race([
				sendWebPushToUser(messageRequest.organizer.id, {
					title: `Message request from ${messageRequest.requester?.name || locals.session.name || 'Attendee'}`,
					body: messageRequest.body,
					url: '/inbox',
					tag: `owltside-msgreq-${messageRequest.id}`
				}),
				new Promise((resolve) => setTimeout(resolve, 1_500))
			]).catch(() => undefined);
		}
		return json({ request: messageRequest }, { status: 201 });
	} catch (error) {
		return failure(error, 'Your message request could not be sent');
	}
};
