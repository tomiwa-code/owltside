<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let {
		open,
		title,
		close,
		children,
		footer
	}: { open: boolean; title: string; close: () => void; children: Snippet; footer?: Snippet } = $props();

	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape') close();
	};
</script>

<svelte:window onkeydown={open ? onKey : undefined} />

{#if open}
	<div class="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={title}>
		<button class="absolute inset-0 bg-[rgba(11,17,32,0.85)] backdrop-blur-[8px]" onclick={close} aria-label="Close"></button>
		<div
			class="absolute bottom-0 inset-x-0 md:inset-x-auto md:left-1/2 md:top-1/2 md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl
			max-h-[92dvh] flex flex-col rounded-t-2xl md:rounded-2xl bg-surface-container border-t border-x md:border border-surface-glass-border shadow-2xl"
		>
			<div class="flex justify-center pt-3 pb-1 shrink-0">
				<div class="w-9 h-1 rounded-full bg-surface-container-highest"></div>
			</div>
			<div class="px-5 py-2 flex items-center justify-between shrink-0">
				<h2 class="font-display text-headline-md text-on-surface">{title}</h2>
				<button aria-label="Close sheet" class="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high" onclick={close}>
					<X class="w-5 h-5" />
				</button>
			</div>
			<div class="overflow-y-auto px-5 pb-5 flex-1 min-h-0">{@render children()}</div>
			{#if footer}
				<div class="p-4 pb-safe border-t border-surface-glass-border bg-surface-container rounded-b-none shrink-0">
					{@render footer()}
				</div>
			{/if}
		</div>
	</div>
{/if}
