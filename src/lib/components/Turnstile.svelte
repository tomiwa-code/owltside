<script lang="ts">
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';

	/**
	 * Cloudflare Turnstile widget (optional).
	 *
	 * Renders nothing unless `PUBLIC_TURNSTILE_SITE_KEY` is configured, so the
	 * app works unchanged in development and in the demo sandbox. Inside a form
	 * it registers a hidden `captchaToken` field; for `fetch()` submissions use
	 * the `onToken` callback to read the token.
	 */
	let {
		onToken,
		theme = 'auto'
	}: {
		onToken?: (token: string) => void;
		theme?: 'auto' | 'light' | 'dark';
	} = $props();

	const siteKey = env.PUBLIC_TURNSTILE_SITE_KEY ?? '';
	let container: HTMLDivElement | undefined = $state();
	let failed = $state(false);

	onMount(() => {
		if (!siteKey || !container) return;
		let widgetId: string | undefined;
		let cancelled = false;

		const script = (): Promise<void> => {
			const win = window as unknown as { turnstile?: { render: (...args: unknown[]) => string } };
			if (win.turnstile) return Promise.resolve();
			if (document.querySelector('script[data-owltside-turnstile]')) {
				return new Promise((resolve) => {
					const timer = setInterval(() => {
						if (win.turnstile) {
							clearInterval(timer);
							resolve();
						}
					}, 100);
					setTimeout(() => {
						clearInterval(timer);
						resolve();
					}, 8_000);
				});
			}
			return new Promise((resolve, reject) => {
				const el = document.createElement('script');
				el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
				el.async = true;
				el.defer = true;
				el.dataset.owltsideTurnstile = 'true';
				el.onload = () => resolve();
				el.onerror = () => reject(new Error('turnstile unavailable'));
				document.head.appendChild(el);
			});
		};

		void script()
			.then(() => {
				if (cancelled || !container) return;
				const ts = (
					window as unknown as {
						turnstile?: { render: (el: HTMLElement, options: Record<string, unknown>) => string };
					}
				).turnstile;
				if (!ts) {
					failed = true;
					return;
				}
				widgetId = ts.render(container, {
					sitekey: siteKey,
					theme,
					'response-field': true,
					'response-field-name': 'captchaToken',
					callback: (token: string) => onToken?.(token),
					'expired-callback': () => onToken?.(''),
					'error-callback': () => onToken?.('')
				});
			})
			.catch(() => {
				failed = true;
			});

		return () => {
			cancelled = true;
			try {
				const ts = (window as unknown as { turnstile?: { remove: (id: string) => void } }).turnstile;
				if (ts && widgetId) ts.remove(widgetId);
			} catch {
				/* the widget may already be gone */
			}
		};
	});
</script>

{#if siteKey && !failed}
	<div bind:this={container} class="flex justify-center min-h-[65px]" aria-label="Bot protection"></div>
{/if}
