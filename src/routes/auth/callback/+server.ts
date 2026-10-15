import { createSupabase } from '$lib/server/supabase';
import { redirect, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const db = createSupabase(cookies);
	const code = url.searchParams.get('code');
	const tokenHash = url.searchParams.get('token_hash');
	const otpType = url.searchParams.get('type') as 'email' | 'signup' | 'magiclink' | null;
	if (!db || (!code && !tokenHash)) redirect(303, '/auth/login');

	let userId: string | undefined;
	if (code) {
		const { data, error } = await db.auth.exchangeCodeForSession(code);
		if (error) redirect(303, `/auth/login?error=${encodeURIComponent(error.message)}`);
		userId = data.user?.id;
	} else if (tokenHash) {
		const { data, error } = await db.auth.verifyOtp({
			token_hash: tokenHash,
			type: otpType || 'email'
		});
		if (error) redirect(303, `/auth/login?error=${encodeURIComponent(error.message)}`);
		userId = data.user?.id;
	}

	const requestedHandle = url.searchParams.get('handle')?.trim().replace(/^@/, '').toLowerCase();
	if (requestedHandle && /^[a-z0-9_]{3,24}$/.test(requestedHandle) && userId) {
		await db.from('profiles').update({ handle: requestedHandle }).eq('id', userId);
	}

	const requestedNext = url.searchParams.get('next') ?? '/home';
	const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/home';
	redirect(303, next);
};
