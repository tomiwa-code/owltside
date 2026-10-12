import { tokenWindow } from './dates';

/**
 * Rotating, tamper-evident ticket tokens.
 * Payload: owltside://t/<code>?s=<hmac over code+30s window>
 * The signature rotates every 30 s so screenshots expire quickly.
 * Server-side (Supabase edge / gate scanner) recomputes the same HMAC with the
 * shared secret; in demo mode the client holds a dev secret.
 */
export const DEMO_QR_SECRET = 'owltside-demo-signing-secret';

export async function signToken(
	code: string,
	secret: string = DEMO_QR_SECRET,
	windowSec = 30,
	now = Date.now()
): Promise<string> {
	const window = tokenWindow(now, windowSec);
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign(
		'HMAC',
		key,
		new TextEncoder().encode(`${code}:${window}`)
	);
	const hex = [...new Uint8Array(sig)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
		.slice(0, 16);
	return `owltside://t/${code}?s=${hex}`;
}

export function newTicketCode(rand: () => number = Math.random): string {
	const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
	const block = (n: number) =>
		Array.from({ length: n }, () => alphabet[Math.floor(rand() * alphabet.length)]).join('');
	return `EV-${block(4)}-${block(4)}-${block(4)}`;
}
