<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle,
		eyebrow,
		crumbs = [],
		actions,
		meta
	}: {
		title: string;
		subtitle?: string;
		eyebrow?: string;
		crumbs?: string[];
		actions?: Snippet;
		meta?: Snippet;
	} = $props();
</script>

<header class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
	<div class="min-w-0">
		{#if eyebrow || crumbs.length}
			<div class="flex flex-wrap items-center gap-1.5 font-code text-[9.5px] uppercase tracking-[0.14em] text-[#63636f]">
				{#if crumbs.length}
					<a href="/dashboard" class="text-[#8f8f9b] transition-colors hover:text-[#c6bcff]">owltside</a>
					{#each crumbs as crumb}
						<span class="text-[#3f3f49]">/</span>
						<span class="text-[#8f8f9b]">{crumb}</span>
					{/each}
				{/if}
				{#if eyebrow}
					{#if crumbs.length}<span class="text-[#3f3f49]">/</span>{/if}
					<span class="chip chip-accent !h-[17px] !text-[8.5px]">{eyebrow}</span>
				{/if}
			</div>
		{/if}
		<h1 class="mt-2 font-display text-[25px] font-semibold leading-tight tracking-[-0.02em] text-[#f1f1f6] sm:text-[28px]">
			{title}
		</h1>
		{#if subtitle}
			<p class="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-[#91919d]">{subtitle}</p>
		{/if}
		{#if meta}
			<div class="mt-3">{@render meta()}</div>
		{/if}
	</div>
	{#if actions}
		<div class="flex shrink-0 flex-wrap items-center gap-2">{@render actions()}</div>
	{/if}
</header>
