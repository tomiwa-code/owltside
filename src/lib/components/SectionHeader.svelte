<script lang="ts">
	import { ChevronRight } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let { icon, title, sub, actionLabel, onAction }: {
		icon?: Snippet;
		title: string;
		sub?: string;
		actionLabel?: string;
		onAction?: () => void;
	} = $props();
</script>

<div class="flex items-center justify-between gap-2">
	<div class="flex flex-col min-w-0">
		<div class="flex items-center gap-1.5 min-w-0">
			{#if icon}<span class="text-primary shrink-0">{@render icon()}</span>{/if}
			<span class="font-display text-headline-md text-on-surface truncate">{title}</span>
		</div>
		{#if sub}<span class="text-body-sm text-on-surface-variant truncate">{sub}</span>{/if}
	</div>
	{#if actionLabel}
		<button
			onclick={onAction}
			class="text-primary text-label-badge font-semibold hover:underline flex items-center shrink-0"
		>
			<span>{actionLabel}</span>
			<ChevronRight class="w-3.5 h-3.5" />
		</button>
	{/if}
</div>
