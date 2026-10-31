import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { createSupabase } from '$lib/server/supabase';

function resolveVapidPublicKey(): string {
	return (
		publicEnv.PUBLIC_VAPID_PUBLIC_KEY ||
		privateEnv.VAPID_PUBLIC_KEY ||
		''
	).trim();
}

export const GET: RequestHandler = async () => {
	return json({
		vapidPublicKey: resolveVapidPublicKey() || null
	});
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
		return json({ error: 'Push subscription endpoint and encryption keys are required.' }, { status: 400 });
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
			.then(() => undefined, () => undefined);
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
