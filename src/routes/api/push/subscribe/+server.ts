import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabase } from '$lib/server/supabase';
import {
	forgetPushSubscription,
	rememberPushSubscription,
	resolveVapidKeys
} from '$lib/server/webpush';

export const GET: RequestHandler = async () => {
	const { publicKey } = resolveVapidKeys();
	return json(
		{ vapidPublicKey: publicKey || null },
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	let body: {
		endpoint?: string;
		keys?: { p256dh?: string; auth?: string };
	};
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid push subscription payload.' }, { status: 400 });
	}

	if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
		return json(
			{ error: 'Push subscription endpoint and encryption keys are required.' },
			{ status: 400 }
		);
	}

	if (locals.session?.userId) {
		rememberPushSubscription(locals.session.userId, {
			endpoint: body.endpoint,
			p256dh: body.keys.p256dh,
			auth: body.keys.auth
		});
	}

	const supabase = createSupabase(cookies);
	if (supabase && locals.session?.userId) {
		await supabase
			.from('push_subscriptions')
			.upsert(
				{
					user_id: locals.session.userId,
					endpoint: body.endpoint,
					p256dh: body.keys.p256dh,
					auth: body.keys.auth,
					user_agent: request.headers.get('user-agent')?.slice(0, 250) ?? null,
					updated_at: new Date().toISOString()
				},
				{ onConflict: 'endpoint' }
			)
			.then(
				() => undefined,
				() => undefined
			);
	}

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals, cookies }) => {
	let endpoint = '';
	try {
		const body = (await request.json()) as { endpoint?: string };
		endpoint = body.endpoint ?? '';
	} catch {
		endpoint = '';
	}
	if (locals.session?.userId) {
		forgetPushSubscription(locals.session.userId, endpoint || undefined);
	}
	const supabase = createSupabase(cookies);
	if (supabase && locals.session?.userId) {
		const query = supabase
			.from('push_subscriptions')
			.delete()
			.eq('user_id', locals.session.userId);
		await (endpoint ? query.eq('endpoint', endpoint) : query).then(
			() => undefined,
			() => undefined
		);
	}
	return json({ ok: true });
};
