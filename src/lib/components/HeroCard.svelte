<script lang="ts">
	import { Bookmark, BookmarkCheck, Flame, Ticket } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import type { EventItem } from '$lib/types';
	import { fmtDateFull, fmtTime } from '$lib/utils/dates';
	import { formatMoney } from '$lib/utils/money';
	import { bookmarks, currency, toggleIn } from '$lib/state/prefs.svelte';
	import Cover from './Cover.svelte';

	let { event }: { event: EventItem } = $props();
	const minPrice = $derived(Math.min(...event.tiers.map((t) => t.price)));
	const left = $derived(Math.min(...event.tiers.map((t) => t.capacity - t.sold)));
	const saved = $derived(bookmarks.value.includes(event.id));
</script>

<article class="relative w-full rounded-2xl bg-surface-container overflow-hidden shadow-xl flex flex-col group">
	<div class="relative w-full aspect-[16/9] overflow-hidden">
		<Cover cover={event.cover} class="w-full h-full group-hover:scale-105 transition-transform duration-500 ease-out" iconClass="w-16 h-16 text-white/30" />
		<div class="absolute inset-0 bg-gradient-to-t from-surface-container via-surface-container/30 to-transparent"></div>
		<div class="absolute top-3 left-3 flex items-center gap-1 bg-secondary-container/90 backdrop-blur-md text-on-secondary-container px-2.5 py-1 rounded-full shadow-md">
			<Flame class="w-3.5 h-3.5" />
			<span class="text-label-badge font-bold uppercase tracking-wider">Only {left} tickets left</span>
		</div>
		<button
			aria-label={saved ? 'Remove bookmark' : 'Bookmark'}
			onclick={() => toggleIn(bookmarks, event.id)}
			class="absolute top-3 right-3 w-9 h-9 rounded-full bg-surface-container-highest/80 backdrop-blur-md text-on-surface flex items-center justify-center"
		>
			{#if saved}<BookmarkCheck class="w-4 h-4 text-primary" />{:else}<Bookmark class="w-4 h-4" />{/if}
		</button>
	</div>
	<div class="flex flex-col gap-space-sm p-4 -mt-8 relative">
		<div>
			<span class="text-label-badge text-tertiary uppercase tracking-wider">{fmtDateFull(event.startsAt)} • {fmtTime(event.startsAt)}</span>
			<h3 class="font-display text-headline-lg-mobile md:text-headline-lg text-on-surface leading-tight">{event.title}</h3>
			<span class="text-body-sm text-on-surface-variant">{event.venue} • {event.city}</span>
		</div>
		<div class="flex items-end justify-between gap-3 pt-1">
			<div class="flex flex-col">
				<span class="text-label-badge text-on-surface-variant">Ticket starting from</span>
				<span class="font-display text-headline-md text-primary font-bold">{formatMoney(minPrice, currency.value)}</span>
			</div>
			<button
				class="px-5 h-11 rounded-full bg-primary text-on-primary text-body-sm font-semibold flex items-center gap-1.5 shadow-md active:scale-95 transition-all glow-primary"
				onclick={() => goto(`/events/${event.slug}`)}
			>
				<span>Get Tickets</span>
				<Ticket class="w-4 h-4" />
			</button>
		</div>
	</div>
</article>
