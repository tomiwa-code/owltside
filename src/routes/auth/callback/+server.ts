import { createSupabase } from '$lib/server/supabase';
import { redirect, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const db = createSupabase(cookies);
	const code = url.searchParams.get('code');
	if (!db || !code) redirect(303, '/auth/login');

	const { data, error } = await db.auth.exchangeCodeForSession(code);
	if (error) redirect(303, `/auth/login?error=${encodeURIComponent(error.message)}`);

	const requestedHandle = url.searchParams.get('handle')?.trim().replace(/^@/, '').toLowerCase();
	if (requestedHandle && /^[a-z0-9_]{3,24}$/.test(requestedHandle) && data.user) {
		await db.from('profiles').update({ handle: requestedHandle }).eq('id', data.user.id);
	}

	const requestedNext = url.searchParams.get('next') ?? '/home';
	const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/home';
	redirect(303, next);
};
