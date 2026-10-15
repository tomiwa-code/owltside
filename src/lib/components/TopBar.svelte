<script lang="ts">
	import { ArrowLeft } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	let { title, subtitle, back = false, right }: { title?: string; subtitle?: string; back?: boolean; right?: Snippet } = $props();
</script>
<!-- Page-local heading/actions. Global navigation lives only in AppHeader. -->
<section class="px-gutter py-3 border-b border-surface-glass-border flex items-center justify-between gap-3">
	<div class="flex items-center gap-2 min-w-0">
		{#if back}<button aria-label="Back" class="w-10 h-10 flex items-center justify-center" onclick={() => history.back()}><ArrowLeft class="w-5 h-5" /></button>{/if}
		<div class="min-w-0">
			{#if title}<h1 class="font-display text-headline-md truncate">{title}</h1>{/if}
			{#if subtitle}<p class="text-body-sm text-on-surface-variant truncate">{subtitle}</p>{/if}
		</div>
	</div>
	{#if right}<div class="flex items-center gap-2">{@render right()}</div>{/if}
</section>
