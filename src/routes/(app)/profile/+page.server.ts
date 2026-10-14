import { fail } from '@sveltejs/kit';
import { getSource } from '$lib/server/datasource';
import { createSupabase } from '$lib/server/supabase';
import { NIGERIAN_STATES } from '$lib/constants/nigeria-states';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const source = getSource(createSupabase(cookies));
	const userId = locals.session?.userId ?? 'demo';
	const [tickets, profile, events] = await Promise.all([
		source.getTickets(userId),
		locals.session ? source.getProfile(locals.session.handle) : Promise.resolve(undefined),
		source.listEvents()
	]);
	return { tickets, profile: profile ?? null, events };
};

export const actions: Actions = {
	updateProfile: async ({ request, cookies, locals }) => {
		const session = locals.session;
		if (!session) return fail(401, { error: 'Sign in to edit your profile.' });

		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const username = String(form.get('username') ?? '').trim().replace(/^@/, '').toLowerCase();
		const bio = String(form.get('bio') ?? '').trim();
		const city = String(form.get('city') ?? '').trim();
		let link = String(form.get('link') ?? '').trim();
		const selectedInterests = [...new Set(form.getAll('interests').map((value) => String(value).trim()).filter(Boolean))];
		const interests = selectedInterests.slice(0, 12);

		if (name.length < 2 || name.length > 80) return fail(400, { error: 'Full name must be between 2 and 80 characters.' });
		if (!/^[a-z0-9_]{3,24}$/.test(username)) return fail(400, { error: 'Username must use 3–24 letters, numbers, or underscores.' });
		if (bio.length > 200) return fail(400, { error: 'Bio must be 200 characters or fewer.' });
		if (!(NIGERIAN_STATES as readonly string[]).includes(city)) return fail(400, { error: 'Choose a Nigerian state from the list.' });
		if (selectedInterests.length > 12) return fail(400, { error: 'Choose up to 12 interests.' });
		if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;
		if (link) {
			try {
				const parsed = new URL(link);
				if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported URL protocol');
			} catch {
				return fail(400, { error: 'Enter a valid web link.' });
			}
		}

		if (session.demo) {
			let previousUsernameChange: string | null = null;
			try {
				previousUsernameChange = JSON.parse(cookies.get('owltside_demo_profile') ?? '{}').usernameChangedAt ?? null;
			} catch {
				/* continue without demo cooldown metadata */
			}
			const usernameChanged = username !== session.handle;
			if (usernameChanged && previousUsernameChange) {
				const nextAllowed = new Date(previousUsernameChange).getTime() + 30 * 24 * 60 * 60 * 1000;
				if (Date.now() < nextAllowed) {
					const daysLeft = Math.ceil((nextAllowed - Date.now()) / (24 * 60 * 60 * 1000));
					return fail(400, { error: `Your username can be changed again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.` });
				}
			}
			const usernameChangedAt = usernameChanged ? new Date().toISOString() : previousUsernameChange;
			cookies.set('owltside_demo_profile', JSON.stringify({ name, username, usernameChangedAt }), {
				path: '/',
				maxAge: 60 * 60 * 24 * 365,
				httpOnly: true,
				sameSite: 'lax'
			});
			return { success: true, name, username, bio, city, link, interests, usernameChangedAt };
		}

		const db = createSupabase(cookies);
		if (!db) return fail(503, { error: 'Profile updates are temporarily unavailable.' });
		const { data: current, error: readError } = await db
			.from('profiles')
			.select('handle, username_changed_at')
			.eq('id', session.userId)
			.maybeSingle();
		if (readError || !current) return fail(400, { error: 'Could not load the current profile. Please try again.' });

		const usernameChanged = current.handle !== username;
		if (usernameChanged && current.username_changed_at) {
			const nextAllowed = new Date(current.username_changed_at).getTime() + 30 * 24 * 60 * 60 * 1000;
			if (Date.now() < nextAllowed) {
				const daysLeft = Math.ceil((nextAllowed - Date.now()) / (24 * 60 * 60 * 1000));
				return fail(400, { error: `Your username can be changed again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.` });
			}
		}

		const updates = {
			name,
			handle: username,
			bio: bio || null,
			city: city || null,
			link: link || null,
			interests,
			...(usernameChanged ? { username_changed_at: new Date().toISOString() } : {})
		};
		const { error } = await db.from('profiles').update(updates).eq('id', session.userId);
		if (error) return fail(400, { error: error.message });
		return { success: true, name, username, bio, city, link, interests, usernameChangedAt: usernameChanged ? new Date().toISOString() : current.username_changed_at };
	}
};
