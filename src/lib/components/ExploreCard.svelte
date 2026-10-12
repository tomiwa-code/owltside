<script lang="ts">
	import { Bookmark, BookmarkCheck, MapPin } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import type { EventItem } from '$lib/types';
	import { fmtDate } from '$lib/utils/dates';
	import { formatMoney } from '$lib/utils/money';
	import { bookmarks, currency, toggleIn } from '$lib/state/prefs.svelte';
	import Cover from './Cover.svelte';

	let { event }: { event: EventItem } = $props();
	const minPrice = $derived(Math.min(...event.tiers.map((t) => t.price)));
	const saved = $derived(bookmarks.value.includes(event.id));
	const month = $derived(new Date(event.startsAt).toLocaleDateString('en-NG', { month: 'short' }).toUpperCase());
	const day = $derived(new Date(event.startsAt).getDate());
	const sellingFast = $derived(event.tiers.some((t) => (t.capacity - t.sold) / t.capacity < 0.2));
</script>

<article class="relative group bg-surface-container hover:bg-surface-container-high transition-colors rounded-xl overflow-hidden shadow-lg flex flex-col">
	<button class="relative w-full aspect-video overflow-hidden text-left" onclick={() => goto(`/events/${event.slug}`)}>
		<Cover cover={event.cover} class="absolute inset-0 group-hover:scale-105 transition-transform duration-500" iconClass="w-12 h-12 text-white/30" />
		<div class="absolute inset-0 bg-gradient-to-t from-surface-container via-surface-container/30 to-transparent"></div>
		<div class="absolute top-3 left-3 bg-surface-container-lowest/90 backdrop-blur-md rounded-lg p-2 flex flex-col items-center justify-center min-w-[50px] shadow-md">
			<span class="text-label-badge text-primary uppercase">{month}</span>
			<span class="font-display text-headline-lg-mobile text-on-surface leading-none">{day}</span>
		</div>
		{#if sellingFast}
			<span class="absolute top-3 right-14 bg-secondary-container/90 backdrop-blur-md text-on-secondary-container px-2.5 py-1 rounded-full flex items-center gap-1 text-label-badge">
				<span class="w-1.5 h-1.5 rounded-full bg-secondary animate-ping"></span>
				<span>Filling Fast</span>
			</span>
		{/if}
		<div class="absolute bottom-3 left-3 flex items-center gap-1.5 flex-wrap">
			{#each event.tiers.slice(0, 3) as tier}
				<span class="bg-surface-container-highest/90 backdrop-blur-md text-on-surface-variant font-code text-label-code px-2 py-0.5 rounded">{tier.name}</span>
			{/each}
		</div>
	</button>
	<button
		aria-label={saved ? 'Remove bookmark' : 'Save event'}
		onclick={() => toggleIn(bookmarks, event.id)}
		class="absolute top-3 right-3 w-9 h-9 rounded-full bg-surface-container-lowest/80 backdrop-blur-md flex items-center justify-center text-on-surface hover:text-primary transition-transform active:scale-90"
	>
		{#if saved}<BookmarkCheck class="w-5 h-5 text-primary" />{:else}<Bookmark class="w-5 h-5" />{/if}
	</button>
	<div class="p-space-md flex flex-col gap-space-sm">
		<div class="flex items-start justify-between gap-space-sm">
			<div class="flex flex-col min-w-0 text-left">
				<a href="/events/{event.slug}" class="font-display text-headline-md text-on-surface truncate hover:text-primary">{event.title}</a>
				<span class="flex items-center gap-1.5 text-on-surface-variant text-body-sm pt-0.5">
					<MapPin class="w-4 h-4 text-primary" />
					<span class="truncate">{event.venue}, {event.city}</span>
				</span>
			</div>
			<div class="flex flex-col items-end flex-shrink-0">
				<span class="text-label-badge text-outline">From</span>
				<span class="font-display text-headline-md text-primary font-bold">
					{minPrice === 0 ? 'Free' : formatMoney(minPrice, currency.value)}
				</span>
			</div>
		</div>
		<div class="flex items-center gap-1.5 flex-wrap">
			{#each event.tags.slice(0, 3) as tag}
				<span class="bg-surface-container-low text-on-surface-variant text-label-badge px-2 py-0.5 rounded-full">{tag}</span>
			{/each}
			<span class="ml-auto text-label-code font-code text-on-surface-variant">{fmtDate(event.startsAt)}</span>
		</div>
	</div>
</article>
