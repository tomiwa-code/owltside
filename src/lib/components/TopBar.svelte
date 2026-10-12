<script lang="ts">
	import { ArrowLeft, MoreVertical } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle,
		back = false,
		right
	}: { title?: string; subtitle?: string; back?: boolean; right?: Snippet } = $props();
</script>

<header class="fixed top-0 inset-x-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-surface-glass-border pt-safe">
	<div class="h-16 px-gutter md:max-w-5xl md:mx-auto flex items-center justify-between gap-space-sm">
		<div class="flex items-center gap-space-xs min-w-0">
			{#if back}
				<button
					aria-label="Back"
					onclick={() => history.back()}
					class="w-11 h-11 -ml-2 flex items-center justify-center text-on-surface rounded-full hover:bg-surface-container transition-colors"
				>
					<ArrowLeft class="w-5 h-5" />
				</button>
			{/if}
			<div class="min-w-0">
				{#if title}
					<h1 class="font-display text-headline-md text-on-surface truncate leading-none">{title}</h1>
				{/if}
				{#if subtitle}
					<span class="block text-label-badge text-on-surface-variant leading-none pt-1 truncate">{subtitle}</span>
				{/if}
			</div>
		</div>
		{#if right}
			<div class="flex items-center gap-space-xs shrink-0">{@render right()}</div>
		{:else}
			<button aria-label="Actions" class="w-11 h-11 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors">
				<MoreVertical class="w-5 h-5" />
			</button>
		{/if}
	</div>
</header>
