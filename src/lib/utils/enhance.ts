import { enhance } from '$app/forms';
import type { SubmitFunction } from '@sveltejs/kit';
import { toast } from '$lib/state/toast.svelte';

/** All progressively enhanced forms share pending feedback and double-submit protection. */
export function busyEnhance(form: HTMLFormElement, submit?: SubmitFunction) {
	let pending = false;
	return enhance(form, async (input) => {
		if (pending) { input.cancel(); return; }
		pending = true;
		let cancelled = false;
		const buttons = Array.from(document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input[type="submit"]'))
			.filter((button) => button.form === form && button.type === 'submit');
		const previous = buttons.map((button) => ({ button, disabled: button.disabled }));
		const indicators: HTMLElement[] = [];
		for (const { button } of previous) {
			button.disabled = true;
			button.setAttribute('aria-busy', 'true');
			if (button instanceof HTMLButtonElement) {
				const indicator = document.createElement('span');
				indicator.setAttribute('role', 'status');
				indicator.setAttribute('aria-label', 'Please wait');
				indicator.className = 'inline-block h-4 w-4 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin';
				button.append(indicator);
				indicators.push(indicator);
			}
		}
		const enable = () => { for (const { button, disabled } of previous) button.disabled = disabled; };
		const finish = () => {
			pending = false;
			for (const { button } of previous) button.removeAttribute('aria-busy');
			for (const indicator of indicators) indicator.remove();
		};
		try {
			const callback = await submit?.({ ...input, cancel: () => { cancelled = true; input.cancel(); } });
			if (cancelled) { enable(); finish(); return; }
			return async (result) => {
				// Let Svelte apply new validity/disabled state during the result callback.
				enable();
				try {
					if (result.result.type === 'error') toast('That request could not be completed. Please try again.', 'error');
					if (result.result.type === 'failure' && result.result.data?.error) toast(String(result.result.data.error), 'error');
					if (callback) await callback(result);
					else await result.update();
				} finally { finish(); }
			};
		} catch (error) { enable(); finish(); throw error; }
	});
}
