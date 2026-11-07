import { authFailure, readOAuthContext, safeAuthNext } from '$lib/server/oauth';
import { createSupabase } from '$lib/server/supabase';
import { fillEmptyProfileFields, providerProfile } from '$lib/server/profile-sync';
import { isRedirect, redirect, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const context = readOAuthContext(cookies);
	const db = createSupabase(cookies, { freshAuth: true });

	const oauthError = url.searchParams.get('error');
	const oauthErrorDescription = url.searchParams.get('error_description');
	if (oauthError || oauthErrorDescription) {
		redirect(303, `/auth/login?error=${encodeURIComponent(oauthErrorDescription || oauthError || 'Sign-in failed')}`);
	}

	const code = url.searchParams.get('code');
	const tokenHash = url.searchParams.get('token_hash');
	const otpType = url.searchParams.get('type') as 'email' | 'signup' | 'magiclink' | null;
	if (!db) authFailure('Sign-in is not configured on this deployment. Please contact support.');
	if (!code && !tokenHash) authFailure('The sign-in callback did not include a code. Start Google sign-in again.');

	let userId: string | undefined;
	let user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | undefined;
	try {
		if (code) {
			const { data, error } = await db.auth.exchangeCodeForSession(code);
			if (error) authFailure('Your sign-in link expired or its browser verification is missing. Start Google sign-in again in the same browser and on the same site.');
			userId = data.user?.id;
			user = data.user ?? undefined;
		} else if (tokenHash) {
			const { data, error } = await db.auth.verifyOtp({
				token_hash: tokenHash,
				type: otpType || 'email'
			});
			if (error) authFailure('Your sign-in link expired or its browser verification is missing. Start Google sign-in again in the same browser and on the same site.');
			userId = data.user?.id;
			user = data.user ?? undefined;
		}

	} catch (error) {
		// SvelteKit redirects are control flow, not an authentication failure.
		if (isRedirect(error)) throw error;
		authFailure('Google sign-in could not be completed. Please try again or use email sign-in.');
	}
	if (!userId || !user) authFailure('Google did not return a signed-in account. Please try again.');

	const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
	const provider = providerProfile(meta);

	const requestedHandle = (url.searchParams.get('handle') ?? context.handle)?.trim().replace(/^@/, '').toLowerCase();
	try {
		if (userId) {
			const { data: profile } = await db.from('profiles').select('id, name, avatar_url').eq('id', userId).maybeSingle();
			if (profile) {
				// Existing account (e.g. an email-code user adding Google): provider details only fill gaps.
				const updates: Record<string, unknown> = { ...fillEmptyProfileFields(profile, meta) };
				if (requestedHandle && /^[a-z0-9_]{3,24}$/.test(requestedHandle)) {
					const { data: clash } = await db.from('profiles').select('id').eq('handle', requestedHandle).neq('id', userId).maybeSingle();
					updates.handle = clash ? `${requestedHandle}_${userId.slice(0, 6)}` : requestedHandle;
				}
				if (Object.keys(updates).length > 0) {
					await db.from('profiles').update(updates).eq('id', userId);
				}
			} else {
				const rawHandle =
					(requestedHandle && /^[a-z0-9_]{3,24}$/.test(requestedHandle) ? requestedHandle : undefined) ||
					(meta.handle as string | undefined) ||
					user?.email?.split('@')[0]?.replace(/[^a-z0-9_]/gi, '').toLowerCase() ||
					`owl_${userId.slice(0, 6)}`;
				const { data: clash } = await db.from('profiles').select('id').eq('handle', rawHandle).neq('id', userId).maybeSingle();
				const finalHandle = clash ? `${rawHandle}_${userId.slice(0, 6)}` : rawHandle;
				const rawName = provider.name || user?.email?.split('@')[0] || 'Explorer';
				await db.from('profiles').upsert(
					{ id: userId, handle: finalHandle, name: rawName, avatar_url: provider.avatarUrl ?? null },
					{ onConflict: 'id' }
				);
			}
		}

	} catch {
		// Auth cookies have already been written. The request hook can retry profile sync.
	}
	const next = safeAuthNext(url.searchParams.get('next') ?? context.next);
	redirect(303, next);
};
