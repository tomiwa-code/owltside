import { env as privateEnv } from '$env/dynamic/private';

/**
 * Lightweight bot protection for the public write endpoints.
 *
 * Cloudflare Turnstile is used (no user puzzle, ~free, no user tracking). It is
 * *optional configuration*: with `TURNSTILE_SECRET_KEY` unset the check is
 * skipped, so local development and the demo sandbox keep working. In
 * production you should set both keys (see `.env.example`) — otherwise the only
 * protection left is the per-IP rate limiter in `hooks.server.ts`.
 *
 * The verification call happens server-side, so a bot cannot bypass it by
 * calling the API directly: every submission must carry a token minted by
 * Cloudflare for this site key.
 */

const VERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface CaptchaResult {
	ok: boolean;
	/** True when no secret key is configured (the check was not performed). */
	skipped: boolean;
	reason?: string;
}

export function captchaConfigured(): boolean {
	return !!(privateEnv.TURNSTILE_SECRET_KEY || '').trim();
}

let warned = false;

export async function verifyCaptcha(token: unknown, remoteIp?: string): Promise<CaptchaResult> {
	const secret = (privateEnv.TURNSTILE_SECRET_KEY || '').trim();
	if (!secret) {
		if (!warned && process.env.NODE_ENV === 'production') {
			warned = true;
			console.warn(
				'[captcha] TURNSTILE_SECRET_KEY is not set — public forms rely on rate limiting only.'
			);
		}
		return { ok: true, skipped: true };
	}
	if (typeof token !== 'string' || !token.trim()) {
		return { ok: false, skipped: false, reason: 'missing-token' };
	}
	try {
		const body = new FormData();
		body.set('secret', secret);
		body.set('response', token.trim());
		if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp);
		const response = await fetch(VERIFY_ENDPOINT, {
			method: 'POST',
			body,
			signal: AbortSignal.timeout(4_000)
		});
		if (!response.ok) return { ok: false, skipped: false, reason: `http-${response.status}` };
		const result = (await response.json()) as { success?: boolean; 'error-codes'?: string[] };
		if (result.success === true) return { ok: true, skipped: false };
		return { ok: false, skipped: false, reason: result['error-codes']?.join(',') ?? 'rejected' };
	} catch {
		// Never let a Turnstile outage take the form down: the rate limiter still
		// applies, and a failing captcha service must not block real users.
		return { ok: true, skipped: true, reason: 'unreachable' };
	}
}

/** Standard 403 body for a failed challenge (kept consistent across routes). */
export const CAPTCHA_FAILURE_MESSAGE =
	'We could not verify that you are human. Please reload the page and try again.';
