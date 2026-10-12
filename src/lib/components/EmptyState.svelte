<script lang="ts">
	import type { Snippet } from 'svelte';

	let { icon, title, sub, action }: { icon: Snippet; title: string; sub?: string; action?: Snippet } = $props();
</script>

<div class="flex flex-col items-center justify-center text-center gap-3 py-16 px-6">
	<div class="w-14 h-14 rounded-full bg-surface-container border border-surface-glass-border flex items-center justify-center text-on-surface-variant">
		{@render icon()}
	</div>
	<div>
		<p class="font-display text-headline-md text-on-surface">{title}</p>
		{#if sub}<p class="text-body-sm text-on-surface-variant mt-1 max-w-[260px]">{sub}</p>{/if}
	</div>
	{#if action}{@render action()}{/if}
</div>
