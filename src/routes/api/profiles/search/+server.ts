import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const handle = (url.searchParams.get('q') ?? '').trim().replace(/^@/, '').toLowerCase();
	if (handle.length < 2 || handle.length > 80) return json([]);
	try {
		const profiles = await getSource(createSupabase(cookies)).searchProfiles(handle);
		return json(profiles.filter((profile) => profile.id !== locals.session?.userId), {
			headers: { 'cache-control': 'private, max-age=10, stale-while-revalidate=30' }
		});
	} catch {
		return json({ error: 'Profiles could not be searched right now.' }, { status: 503 });
	}
};
