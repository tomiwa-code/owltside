import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const raw = (url.searchParams.get('q') ?? '').trim();
	const handle = raw.replace(/^@+/, '').trim().toLowerCase();
	if ((!handle && raw !== '@') || handle.length > 80) return json([]);
	try {
		const source = getSource(createSupabase(cookies));
		const activeUserId = locals.session?.userId ?? (source.mode === 'demo' ? 'u-ada' : undefined);
		const activeHandle = (locals.session?.handle ?? (source.mode === 'demo' ? 'adaobi' : ''))
			.trim()
			.replace(/^@+/, '')
			.toLowerCase();
		const profiles = await source.searchProfiles(handle || '@');
		return json(
			profiles.filter(
				(profile) =>
					profile.id !== activeUserId &&
					(!activeHandle || profile.handle.toLowerCase() !== activeHandle)
			),
			{
				headers: { 'cache-control': 'private, max-age=10, stale-while-revalidate=30' }
			}
		);
	} catch {
		return json({ error: 'Profiles could not be searched right now.' }, { status: 503 });
	}
};
