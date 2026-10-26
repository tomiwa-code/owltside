import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Collects client-side failures in the dev server log. Without this an error
 * inside the embedded preview frame is invisible: there is no console to open,
 * and the only symptom is a screen that renders nothing.
 *
 * Deliberately inert outside development.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (process.env.NODE_ENV === 'production') {
		return json({ ok: false }, { status: 404 });
	}

	const body = (await request.json().catch(() => null)) as
		| { source?: string; message?: string; stack?: string; url?: string; ua?: string }
		| null;

	if (!body?.message) return json({ ok: false }, { status: 400 });

	const firstFrame = body.stack?.split('\n')[1]?.trim() ?? '';
	console.log(
		`[client-error] ${body.source ?? 'unknown'} · ${body.message}` +
			(firstFrame ? ` · ${firstFrame}` : '') +
			(body.url ? ` · at ${body.url}` : '')
	);

	return json({ ok: true });
};
