import { clearRetiredBiometricCookies } from '$lib/server/biometrics-disabled';
import { isAuthReturn } from '$lib/server/oauth';
import { createSupabase, supabaseConfigured } from '$lib/server/supabase';
import { demoModeEnabled } from '$lib/server/demo-mode';
import { clientKey, rateLimit } from '$lib/server/rate-limit';
import { demo } from '$lib/server/demo-index';
import { fillEmptyProfileFields, providerProfile } from '$lib/server/profile-sync';
import { OPERATING_IDENTITY_COOKIE, isOperatingIdentity } from '$lib/constants/operating-identity';
import type { Handle, ServerInit } from '@sveltejs/kit';
import { env as publicEnv } from '$env/dynamic/public';

const PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Refuse to start a production deployment that has no database. Previously a
 * missing Supabase key silently switched the app into demo mode, where any
 * six-digit code signs a visitor in and every payment "verifies".
 */
export const init: ServerInit = () => {
	if (PRODUCTION && !supabaseConfigured() && !demoModeEnabled()) {
		throw new Error(
			'Supabase is not configured. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY ' +
				'before serving the Owltside app in production (or DEMO_MODE=true for a sandbox).'
		);
	}
};

function supabaseOrigin(): string {
	const raw = (publicEnv.PUBLIC_SUPABASE_URL || '').trim();
	if (!raw) return '';
	try {
		return new URL(raw).origin;
	} catch {
		return '';
	}
}

function contentSecurityPolicy(): string {
	const supabase = supabaseOrigin();
	const connect = ["'self'", 'https://api.paystack.co'];
	if (supabase) {
		connect.push(supabase, supabase.replace('https://', 'wss://'));
	}
	const frameAncestors = PRODUCTION ? "'none'" : "'self'";
	return [
		"default-src 'self'",
		// The theme bootstrap in app.html is an inline script; everything else
		// is served from our own origin.
		"script-src 'self' 'unsafe-inline'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob: https:",
		"font-src 'self' data:",
		`connect-src ${connect.join(' ')}`,
		"frame-src 'self'",
		"media-src 'self' blob:",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self' https://checkout.paystack.com",
		`frame-ancestors ${frameAncestors}`,
		...(PRODUCTION ? ['upgrade-insecure-requests'] : [])
	].join('; ');
}

function decorate(response: Response): Response {
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	response.headers.set('permissions-policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
	response.headers.set('cross-origin-opener-policy', 'same-origin');
	response.headers.set('content-security-policy', contentSecurityPolicy());
	if (PRODUCTION) {
		response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains; preload');
		response.headers.set('x-frame-options', 'DENY');
	}
	return response;
}

interface LimitRule {
	pattern: RegExp;
	max: number;
	windowMs: number;
	/** Only apply to these methods (defaults to every method). */
	methods?: string[];
}

const LIMIT_RULES: LimitRule[] = [
	// Scanner PINs are bearer credentials; the database also caps attempts.
	{ pattern: /^\/api\/scan(\/|$)/, max: 40, windowMs: 60_000 },
	// A promo endpoint is a discount-code oracle.
	{ pattern: /^\/api\/events\/[^/]+\/promo$/, max: 30, windowMs: 60_000 },
	// Login/signup/OTP are the classic enumeration + email-bomb targets.
	{ pattern: /^\/auth\/(login|signup|verify)$/, max: 15, windowMs: 60_000, methods: ['POST'] },
	{ pattern: /^\/api\/paystack\/webhook$/, max: 600, windowMs: 60_000, methods: ['POST'] },
	{ pattern: /^\/api\//, max: 240, windowMs: 60_000 }
];

function rateLimited(event: Parameters<Handle>[0]['event']): Response | null {
	const method = event.request.method;
	let ip = 'unknown';
	try {
		ip = event.getClientAddress();
	} catch {
		ip = clientKey(event.request, 'unknown');
	}

	for (const rule of LIMIT_RULES) {
		if (!rule.pattern.test(event.url.pathname)) continue;
		if (rule.methods && !rule.methods.includes(method)) continue;
		const result = rateLimit(`route:${rule.pattern.source}:${ip}`, {
			max: rule.max,
			windowMs: rule.windowMs
		});
		if (result.ok) continue;
		const body = event.url.pathname.startsWith('/api/')
			? JSON.stringify({ error: 'Too many requests. Please slow down and try again.' })
			: 'Too many requests. Please slow down and try again.';
		return new Response(body, {
			status: 429,
			headers: {
				'content-type': event.url.pathname.startsWith('/api/')
					? 'application/json'
					: 'text/plain; charset=utf-8',
				'retry-after': String(result.retryAfterSeconds),
				'cache-control': 'no-store'
			}
		});
	}
	return null;
}

export const handle: Handle = async ({ event, resolve }) => {
	clearRetiredBiometricCookies(event.cookies);
	// Synthetic events (unit tests, internal calls) carry no real Request; the
	// limiter only makes sense for traffic that actually arrived over HTTP.
	const limited = event?.request ? rateLimited(event) : null;
	if (limited) return decorate(limited);

	const isDemo = demoModeEnabled();
	event.locals.demoMode = isDemo;
	event.locals.session = null;

	// Exchange the PKCE code before validating/refreshing an old session.
	// A failed old-session refresh may otherwise remove the in-flight verifier.
	if (isAuthReturn(event.url)) {
		const response = decorate(await resolve(event));
		response.headers.set('cache-control', 'private, no-store');
		response.headers.set('referrer-policy', 'no-referrer');
		return response;
	}

	const db = isDemo ? null : createSupabase(event.cookies);

	if (db) {
		try {
			const {
				data: { user }
			} = await db.auth.getUser();
			if (user) {
				const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
				const bannedUntil = (user as { banned_until?: string | null }).banned_until;
				const isBanned =
					(bannedUntil ? Date.parse(bannedUntil) > Date.now() : false) ||
					meta.account_disabled === true;
				let { data: profile } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
				if (isBanned || profile?.disabled === true) {
					await db.auth.signOut().catch(() => undefined);
					event.locals.session = null;
					const path = event.url.pathname;
					if (!path.startsWith('/auth/') && !path.startsWith('/api/')) {
						const reason =
							(typeof profile?.disabled_reason === 'string' && profile.disabled_reason) ||
							(typeof meta.disabled_reason === 'string' && meta.disabled_reason) ||
							'Your account has been disabled by an administrator.';
						return decorate(
							new Response(null, {
								status: 303,
								headers: {
									location: `/auth/login?error=${encodeURIComponent(reason)}`
								}
							})
						);
					}
					return decorate(await resolve(event));
				}
				if (!profile) {
					const rawHandle =
						(meta.handle as string | undefined) ||
						user.email?.split('@')[0]?.replace(/[^a-z0-9_]/gi, '').toLowerCase() ||
						`owl_${user.id.slice(0, 6)}`;
					const { data: clash } = await db.from('profiles').select('id').eq('handle', rawHandle).neq('id', user.id).maybeSingle();
					const finalHandle = clash ? `${rawHandle}_${user.id.slice(0, 6)}` : rawHandle;
					const provider = providerProfile(meta);
					const rawName = provider.name || user.email?.split('@')[0] || 'Explorer';
					const { data: created } = await db
						.from('profiles')
						.upsert({ id: user.id, handle: finalHandle, name: rawName, avatar_url: provider.avatarUrl ?? null }, { onConflict: 'id' })
						.select('*')
						.maybeSingle();
					profile = created;
				} else {
					// Provider (Google) details only fill gaps; they never replace what the user already has.
					const updates = fillEmptyProfileFields(profile, meta);
					if (Object.keys(updates).length > 0) {
						const { data: updated } = await db.from('profiles').update(updates).eq('id', user.id).select('*').maybeSingle();
						if (updated) profile = updated;
					}
				}
				// The database column (guarded, server-owned) wins over
				// `user_metadata`, which the account holder can rewrite at will.
				const storedIdentity = isOperatingIdentity(String(profile?.operating_identity ?? ''))
					? (profile?.operating_identity as 'attendee' | 'organizer' | 'guest')
					: null;
				const metaIdentity = isOperatingIdentity(String(meta.operating_identity ?? ''))
					? (meta.operating_identity as 'attendee' | 'organizer' | 'guest')
					: null;
				const identity: 'attendee' | 'organizer' | 'guest' =
					storedIdentity ?? metaIdentity ?? 'attendee';
				// Keep the public profile's operating identity in step with the
				// private auth preference so other users see the current choice
				// under this user's name. Runs only when the column exists (017)
				// and the saved values have drifted apart.
				if (profile && 'operating_identity' in profile && profile.operating_identity !== identity) {
					const { data: synced } = await db
						.from('profiles')
						.update({ operating_identity: identity })
						.eq('id', user.id)
						.select('*')
						.maybeSingle();
					if (synced) profile = synced;
				}
				event.locals.session = {
					userId: user.id,
					email: user.email ?? '',
					handle: profile?.handle ?? 'you',
					name: profile?.name ?? (user.email?.split('@')[0] || 'Explorer'),
					role: identity,
					avatarUrl: profile?.avatar_url ?? null,
					usernameChangedAt: profile?.username_changed_at ?? null
				};
			}
		} catch {
			// Leave session null if upstream auth/profile lookup fails after retries
		}
	} else if (isDemo && event.cookies.get('owltside_demo_session')) {
		const me = demo.me;
		let demoProfile: { name?: string; username?: string; usernameChangedAt?: string | null } = {};
		try {
			demoProfile = JSON.parse(event.cookies.get('owltside_demo_profile') ?? '{}');
		} catch {
			/* ignore a malformed local demo profile */
		}
		event.locals.session = {
			userId: me.id,
			email: 'ada@owltside.app',
			handle: demoProfile.username ?? me.handle,
			name: demoProfile.name ?? me.name,
			role: isOperatingIdentity(event.cookies.get(OPERATING_IDENTITY_COOKIE) ?? '') ? event.cookies.get(OPERATING_IDENTITY_COOKIE) as 'attendee' | 'organizer' | 'guest' : 'attendee',
			avatarUrl: null,
			usernameChangedAt: demoProfile.usernameChangedAt ?? null,
			demo: true
		};
	}

	return decorate(await resolve(event));
};
