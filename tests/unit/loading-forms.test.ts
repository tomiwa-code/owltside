import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ handler: null as any }));
vi.mock('$app/forms', () => ({ enhance: (_form: HTMLFormElement, handler: unknown) => { state.handler = handler; return { destroy() {} }; } }));
import { busyEnhance } from '$lib/utils/enhance';

beforeEach(() => { document.body.innerHTML = '<form id="edit"><button type="submit">Publish</button></form><button form="edit" type="submit">Save changes</button>'; });
const input = () => ({ cancel: vi.fn(), action: new URL('http://localhost'), formData: new FormData(), formElement: document.querySelector('form'), submitter: null, controller: new AbortController() });
describe('shared loading feedback for enhanced buttons', () => {
	it('disables local/external submitters, shows loading, and prevents duplicate submissions', async () => {
		busyEnhance(document.querySelector('form')!);
		const callback = await state.handler(input());
		for (const button of document.querySelectorAll('button')) { expect(button.disabled).toBe(true); expect(button.querySelector('[aria-label="Please wait"]')).not.toBeNull(); expect(button.getAttribute('aria-busy')).toBe('true'); }
		const duplicate = input(); await state.handler(duplicate); expect(duplicate.cancel).toHaveBeenCalled();
		const update = vi.fn(); await callback({ result: { type: 'success' }, update });
		expect(update).toHaveBeenCalled();
		for (const button of document.querySelectorAll('button')) { expect(button.disabled).toBe(false); expect(button.querySelector('[aria-label="Please wait"]')).toBeNull(); expect(button.hasAttribute('aria-busy')).toBe(false); }
	});
	it('preserves form-specific handlers and restores feedback on failure', async () => {
		const resultHandler = vi.fn(); busyEnhance(document.querySelector('form')!, () => resultHandler);
		const callback = await state.handler(input());
		await callback({ result: { type: 'failure', data: { error: 'Try again' } }, update: vi.fn() });
		expect(resultHandler).toHaveBeenCalled();
		expect(document.querySelector('button')?.disabled).toBe(false);
	});
	it('clears loading when a form cancels submission', async () => {
		busyEnhance(document.querySelector('form')!, ({ cancel }) => cancel());
		const attempt = input(); await state.handler(attempt);
		expect(attempt.cancel).toHaveBeenCalled();
		expect(document.querySelector('button')?.disabled).toBe(false);
	});
});
