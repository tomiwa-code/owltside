import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Handler-level checks for how Google details reach `public.profiles`:
 * the OAuth callback and the per-request hook run against a fake Supabase
 * client. Google may only fill empty fields — never overwrite existing ones.
 */

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('$lib/server/supabase', () => ({
	createSupabase: () => state.db,
	supabaseConfigured: () => true
}));

import { handle } from '../../src/hooks.server';
import { GET } from '../../src/routes/auth/callback/+server';

type ProfileRow = { id: string; handle: string; name: string; avatar_url: string | null };
type Row = Record<string, unknown>;
type Chain = {
	select: (...args: unknown[]) => Chain;
	eq: (column: string, value: unknown) => Chain;
	neq: (...args: unknown[]) => Chain;
	update: (payload: Row) => Chain;
	upsert: (payload: Row, ...rest: unknown[]) => Chain;
	maybeSingle: () => Promise<{ data: unknown }>;
};

const ID = '5f0c2a7e-1111-4222-8333-444455556666';
const SUFFIX = ID.slice(0, 6);
const GOOGLE_PHOTO = 'https://lh3.googleusercontent.com/a/ada.png';

const googleUser = {
	id: ID,
	email: 'ada@gmail.com',
	user_metadata: { full_name: 'Ada Obi (Google)', picture: GOOGLE_PHOTO }
};

/** Records every write; `profile: null` means the user has no profile row yet. */
function fakeSupabase(opts: { profile: ProfileRow | null; handleTaken?: boolean }) {
	let row: ProfileRow | null = opts.profile ? { ...opts.profile } : null;
	const updates: Row[] = [];
	const upserts: Row[] = [];

	const db = {
		auth: {
			getUser: async () => ({ data: { user: googleUser } }),
			exchangeCodeForSession: async () => ({ data: { user: googleUser }, error: null })
		},
		from() {
			const eqs: Row = {};
			let upserted: Row | null = null;
			const chain: Chain = {
				select: () => chain,
				eq: (column, value) => {
					eqs[column] = value;
					return chain;
				},
				neq: () => chain,
				update: (payload) => {
					updates.push(payload);
					if (row) row = { ...row, ...payload } as ProfileRow;
					return chain;
				},
				upsert: (payload) => {
					upserts.push(payload);
					upserted = payload;
					return chain;
				},
				maybeSingle: async () => {
					// `select('id').eq('handle', …)` is the username-collision lookup.
					if ('handle' in eqs) return { data: opts.handleTaken ? { id: 'someone-else' } : null };
					return { data: upserted ?? row };
				}
			};
			return chain;
		}
	};

	state.db = db;
	return { updates, upserts };
}

async function runCallback(search: string) {
	try {
		await GET({
			url: new URL(`http://localhost/auth/callback${search}`),
			cookies: {}
		} as unknown as Parameters<typeof GET>[0]);
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}
	throw new Error('the callback did not redirect');
}

async function runHook() {
	const locals: Row = {};
	const event = {
		cookies: { get: () => undefined },
		locals
	} as unknown as Parameters<typeof handle>[0]['event'];
	await handle({ event, resolve: async () => new Response('ok') });
	return locals.session as { handle: string; name: string; avatarUrl: string | null };
}

const existing = (over: Partial<ProfileRow> = {}): ProfileRow => ({
	id: ID,
	handle: 'ada',
	name: 'Ada Obi',
	avatar_url: 'https://cdn.owltside.app/ada.png',
	...over
});

beforeEach(() => {
	state.db = null;
});

describe('auth callback — Google details only fill empty profile fields', () => {
	it('leaves an existing name and photo untouched', async () => {
		const { updates, upserts } = fakeSupabase({ profile: existing() });
		const redirected = await runCallback('?code=abc');
		expect(updates).toEqual([]);
		expect(upserts).toEqual([]);
		expect(redirected).toMatchObject({ status: 303, location: '/home' });
	});

	it('fills a missing photo but keeps the existing name', async () => {
		const { updates } = fakeSupabase({ profile: existing({ avatar_url: null }) });
		await runCallback('?code=abc');
		expect(updates).toEqual([{ avatar_url: GOOGLE_PHOTO }]);
	});

	it('fills a blank name and a missing photo', async () => {
		const { updates } = fakeSupabase({ profile: existing({ name: '  ', avatar_url: null }) });
		await runCallback('?code=abc');
		expect(updates).toEqual([{ name: 'Ada Obi (Google)', avatar_url: GOOGLE_PHOTO }]);
	});

	it('creates a profile from Google details when none exists yet', async () => {
		const { updates, upserts } = fakeSupabase({ profile: null });
		await runCallback('?code=abc');
		expect(updates).toEqual([]);
		expect(upserts).toEqual([
			{ id: ID, handle: 'ada', name: 'Ada Obi (Google)', avatar_url: GOOGLE_PHOTO }
		]);
	});

	it('appends a short suffix when the generated handle is already taken', async () => {
		const { upserts } = fakeSupabase({ profile: null, handleTaken: true });
		await runCallback('?code=abc');
		expect(upserts[0]).toMatchObject({ handle: `ada_${SUFFIX}` });
	});

	it('applies a requested signup username without touching name or photo', async () => {
		const { updates } = fakeSupabase({ profile: existing() });
		await runCallback('?code=abc&handle=ada_new');
		expect(updates).toEqual([{ handle: 'ada_new' }]);
	});

	it('appends a short suffix when the requested signup username is taken', async () => {
		const { updates } = fakeSupabase({ profile: existing(), handleTaken: true });
		await runCallback('?code=abc&handle=ada_new');
		expect(updates).toEqual([{ handle: `ada_new_${SUFFIX}` }]);
	});
});

describe('auth callback — provider errors', () => {
	it('sends the OAuth error back to the login page', async () => {
		fakeSupabase({ profile: existing() });
		const redirected = await runCallback('?error=access_denied&error_description=Access%20was%20denied');
		expect(redirected.status).toBe(303);
		expect(redirected.location).toBe('/auth/login?error=Access%20was%20denied');
	});
});

describe('request hook — Google details only fill empty profile fields', () => {
	it('keeps the stored name and photo in the session', async () => {
		const { updates } = fakeSupabase({ profile: existing() });
		const session = await runHook();
		expect(updates).toEqual([]);
		expect(session).toMatchObject({
			handle: 'ada',
			name: 'Ada Obi',
			avatarUrl: 'https://cdn.owltside.app/ada.png'
		});
	});

	it('fills a missing photo from Google and keeps the stored name', async () => {
		const { updates } = fakeSupabase({ profile: existing({ avatar_url: null }) });
		const session = await runHook();
		expect(updates).toEqual([{ avatar_url: GOOGLE_PHOTO }]);
		expect(session).toMatchObject({ name: 'Ada Obi', avatarUrl: GOOGLE_PHOTO });
	});
});
