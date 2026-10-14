<script lang="ts" generics="T">
	import EmblaCarousel, { type EmblaOptionsType, type EmblaCarouselType } from 'embla-carousel';
	import type { Snippet } from 'svelte';

	/** Embla-powered horizontal swipe rail. Children render as slides. */
	let {
		items,
		children,
		options = {},
		class: cls = ''
	}: {
		items: T[];
		children: Snippet<[T, number]>;
		options?: EmblaOptionsType;
		class?: string;
	} = $props();

	let viewport: HTMLDivElement | undefined = $state();
	let embla: EmblaCarouselType | undefined = $state();

	$effect(() => {
		if (!viewport || items.length === 0) return;
		const api = EmblaCarousel(viewport, { align: 'start', loop: false, ...options });
		embla = api;
		return () => {
			api.destroy();
			embla = undefined;
		};
	});

	export function api(): EmblaCarouselType | undefined {
		return embla;
	}
</script>

<div class="w-full overflow-hidden {cls}" role="region" aria-label="Event slides">
	<div bind:this={viewport} class="flex gap-space-sm touch-pan-y px-margin -mx-margin md:px-0 md:mx-0" style="touch-action: pan-y pinch-zoom;">
		{#each items as item, i (i)}
			<div class="snap-start shrink-0 w-[min(82vw,320px)] sm:w-[280px] h-full">{@render children(item, i)}</div>
		{/each}
	</div>
</div>
