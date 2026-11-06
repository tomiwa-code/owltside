import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// Exercise the real SvelteKit deserializer without booting its browser router.
vi.mock('../node_modules/@sveltejs/kit/src/runtime/client/client.js', () => ({
	app: { decoders: {} }, applyAction: vi.fn()
}));
vi.mock('../node_modules/@sveltejs/kit/src/runtime/app/navigation.js', () => ({
	invalidateAll: vi.fn()
}));
vi.mock('../node_modules/@sveltejs/kit/src/runtime/server/app.js', () => ({
	app: { decoders: {} }
}));
import { loginFailureMessage, readLoginResult } from '$admin/utils/login-response';

const message = 'Email or security password is incorrect. 4 attempts left.';

describe('login action response handling', () => {
	it('decodes the serialized failure from the screenshot instead of exposing devalue JSON', async () => {
		const data = JSON.stringify([{ error: 1, email: 2 }, message, 'admin@owltside.com']);
		const result = await readLoginResult(Response.json({ type: 'failure', status: 401, data }, { status: 401 }));
		expect(result).toEqual({ type: 'failure', status: 401, data: { error: message, email: 'admin@owltside.com' } });
		expect(loginFailureMessage(result!, 401)).toBe(message);
	});

	it('preserves redirect results for successful sign-in', async () => {
		expect(await readLoginResult(Response.json({ type: 'redirect', status: 303, location: '/dashboard' })))
			.toEqual({ type: 'redirect', status: 303, location: '/dashboard' });
	});

	it('handles SvelteKit error results, which use error.message rather than data.error', async () => {
		const result = await readLoginResult(Response.json({ type: 'error', status: 503, error: { message: 'Service unavailable' } }));
		expect(loginFailureMessage(result!, 503)).toBe('Service unavailable');
	});

	it.each(['<html>Bad gateway</html>', '', '{"type":"failure","data":"not devalue"}'])('rejects malformed responses safely: %s', async (body) => {
		expect(await readLoginResult(new Response(body))).toBeNull();
	});

	it('uses a readable fallback if the failure contains no error string', async () => {
		const result = await readLoginResult(Response.json({ type: 'failure', status: 401, data: '[{}]' }));
		expect(loginFailureMessage(result!, 401)).toBe('Sign-in was rejected (HTTP 401).');
	});

	it('keeps diagnostics read-only so opening them cannot burn another login attempt', () => {
		const source = readFileSync('src/routes/login/+page.svelte', 'utf8');
		const diagnostics = source.slice(source.indexOf('async function runDiagnostics()'), source.indexOf('\n\t/**\n\t * Landing back'));
		expect(diagnostics).not.toContain('POST');
		expect(diagnostics).not.toContain('FormData');
		expect(diagnostics).not.toContain('?/credentials');
		expect(diagnostics).toContain("fetch('/api/session-probe'");
	});
});
