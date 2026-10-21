<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { page } from '$app/state';

	let {
		pageNumber,
		pages,
		total,
		perPage,
		label = 'rows'
	}: { pageNumber: number; pages: number; total: number; perPage: number; label?: string } = $props();

	function href(target: number): string {
		const url = new URL(page.url);
		url.searchParams.set('page', String(target));
		return `${url.pathname}${url.search}`;
	}

	const start = $derived(total === 0 ? 0 : (pageNumber - 1) * perPage + 1);
	const end = $derived(Math.min(total, pageNumber * perPage));
	const window = $derived.by(() => {
		const items: (number | 'gap')[] = [];
		const max = 5;
		let from = Math.max(1, pageNumber - 2);
		let to = Math.min(pages, from + max - 1);
		from = Math.max(1, to - max + 1);
		if (from > 1) items.push(1);
		if (from > 2) items.push('gap');
		for (let i = from; i <= to; i++) items.push(i);
		if (to < pages - 1) items.push('gap');
		if (to < pages) items.push(pages);
		return items;
	});
</script>

<div class="flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
	<p class="font-code text-[9.5px] uppercase tracking-[0.1em] text-[#6f6f7b]">
		Showing {start}–{end} of {total.toLocaleString('en-US')}
		{label}
	</p>
	<div class="flex items-center gap-1">
		<a
			href={href(Math.max(1, pageNumber - 1))}
			class="btn btn-sm btn-ghost !px-1.5"
			aria-label="Previous page"
			aria-disabled={pageNumber <= 1}
			class:pointer-events-none={pageNumber <= 1}
			class:opacity-40={pageNumber <= 1}
		>
			<ChevronLeft size={13} />
		</a>
		{#each window as item, index (index)}
			{#if item === 'gap'}
				<span class="px-1 font-code text-[10px] text-[#4f4f5b]">…</span>
			{:else}
				<a
					href={href(item)}
					class="inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-[5px] border font-code text-[10px] transition-colors {item ===
					pageNumber
						? 'border-[#c6bcff]/45 bg-[#c6bcff]/15 text-[#dcd6ff]'
						: 'border-transparent text-[#8f8f9b] hover:border-[#3c3c46] hover:bg-[#24242c] hover:text-white'}"
					aria-current={item === pageNumber ? 'page' : undefined}
				>
					{item}
				</a>
			{/if}
		{/each}
		<a
			href={href(Math.min(pages, pageNumber + 1))}
			class="btn btn-sm btn-ghost !px-1.5"
			aria-label="Next page"
			aria-disabled={pageNumber >= pages}
			class:pointer-events-none={pageNumber >= pages}
			class:opacity-40={pageNumber >= pages}
		>
			<ChevronRight size={13} />
		</a>
	</div>
</div>
