import { createHmac, timingSafeEqual } from 'node:crypto';
import { env as privateEnv } from '$env/dynamic/private';
import { tokenWindow } from '$lib/utils/dates';

/**
 * Server-side signing for the rotating ticket QR.
 *
 * The previous implementation signed in the browser with a constant that was
 * bundled into the client, and the scanner never checked the signature — so
 * the advertised "tamper-evident" property did not exist. Tokens are now
 * minted here, with a server secret, and the scanner verifies them.
 */

export const QR_WINDOW_SECONDS = 30;
const TOKEN_PREFIX = 'owltside://t/';
const PRODUCTION = process.env.NODE_ENV === 'production';

function signingSecret(): string {
	const configured = (privateEnv.QR_SIGNING_SECRET || '').trim();
	if (configured && configured !== 'dev-only-change-me') return configured;
	if (PRODUCTION) {
		throw new Error('QR_SIGNING_SECRET must be set to a private value in production.');
	}
	return 'owltside-development-qr-secret';
}

function signatureFor(code: string, window: number): string {
	return createHmac('sha256', signingSecret())
		.update(`${code}:${window}`)
		.digest('hex')
		.slice(0, 16);
}

/** Build the payload the pass renders into its QR code. */
export function signTicketToken(code: string, now = Date.now()): string {
	const window = tokenWindow(now, QR_WINDOW_SECONDS);
	return `${TOKEN_PREFIX}${encodeURIComponent(code)}?s=${signatureFor(code, window)}`;
}

export interface ParsedTicketToken {
	code: string;
	/** True when the scanned value carried a signature at all. */
	signed: boolean;
	/** Verification result for a signed token (always true for bare codes). */
	valid: boolean;
}

/**
 * Accept either a bare ticket code (manual entry) or a signed rotating token.
 * A token that carries a signature must verify; a tampered one is rejected
 * rather than silently downgraded to its code.
 */
export function parseTicketToken(raw: string, now = Date.now()): ParsedTicketToken {
	const value = (raw ?? '').trim();
	if (!value.startsWith(TOKEN_PREFIX)) {
		return { code: value, signed: false, valid: true };
	}

	const rest = value.slice(TOKEN_PREFIX.length);
	const queryIndex = rest.indexOf('?');
	const encodedCode = queryIndex === -1 ? rest : rest.slice(0, queryIndex);
	const query = queryIndex === -1 ? '' : rest.slice(queryIndex + 1);
	const code = decodeURIComponent(encodedCode);
	const params = new URLSearchParams(query);
	const signature = (params.get('s') ?? '').toLowerCase();

	if (!code || !/^[0-9a-f]{16}$/.test(signature)) {
		return { code, signed: true, valid: false };
	}

	const window = tokenWindow(now, QR_WINDOW_SECONDS);
	const provided = Buffer.from(signature, 'utf8');
	// One window of clock skew between the pass and the scanner.
	const match = [window, window - 1].some((candidate) => {
		const expected = Buffer.from(signatureFor(code, candidate), 'utf8');
		return expected.length === provided.length && timingSafeEqual(expected, provided);
	});

	return { code, signed: true, valid: match };
}
