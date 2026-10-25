<script lang="ts">
	import { Moon, Sun } from '@lucide/svelte';
	import { appSettings } from '$lib/state/settings.svelte';

	/**
	 * One-tap dark/light switch, available from the app chrome. The choice is
	 * stored in the same accessibility preference the Settings screen edits, so
	 * both surfaces always agree, and `src/app.html` replays it before paint.
	 */
	let { class: className = '', size = 'md' }: { class?: string; size?: 'sm' | 'md' } = $props();

	const appearance = $derived(appSettings.value.accessibility.appearance);
	const isDark = $derived(appearance !== 'light');
	const label = $derived(isDark ? 'Switch to light mode' : 'Switch to dark mode');

	function toggle() {
		const next = isDark ? 'light' : 'dark';
		appSettings.value.accessibility.appearance = next;
		document.documentElement.dataset.theme = next;
		try {
			localStorage.setItem('owltside.theme', next);
		} catch {
			/* private mode — the preference still applies for this session */
		}
	}
</script>

<button
	type="button"
	class="relative inline-flex items-center justify-center rounded-full border border-surface-glass-border bg-surface-container-high text-on-surface transition-colors hover:bg-surface-bright {size === 'sm'
		? 'w-8 h-8'
		: 'w-10 h-10'} {className}"
	aria-label={label}
	title={label}
	aria-pressed={isDark}
	data-theme-toggle={appearance}
	onclick={toggle}
>
	{#if isDark}
		<Moon class="w-[18px] h-[18px]" />
	{:else}
		<Sun class="w-[18px] h-[18px]" />
	{/if}
</button>
