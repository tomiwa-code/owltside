<script lang="ts">
	import { ArrowRight, BadgeCheck } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import type { EventItem } from '$lib/types';
	import { fmtDate } from '$lib/utils/dates';
	import { formatMoney } from '$lib/utils/money';
	import { currency } from '$lib/state/prefs.svelte';
	import Cover from './Cover.svelte';

	let { event, rank }: { event: EventItem; rank?: number } = $props();
	const minPrice = $derived(Math.min(...event.tiers.map((t) => t.price)));
</script>

<button
	class="flex items-center gap-space-sm p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors shadow-sm w-full text-left"
	onclick={() => goto(`/events/${event.slug}`)}
>
	{#if rank !== undefined}
		<span
			class="flex items-center justify-center w-7 h-7 rounded-full shrink-0 font-display text-[14px] font-bold
				{rank === 1 ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-highest text-on-surface-variant'}"
		>
			#{rank}
		</span>
	{/if}
	<Cover cover={event.cover} class="w-14 h-14 rounded-lg shrink-0" iconClass="w-6 h-6 text-white/40" />
	<span class="flex flex-col min-w-0 flex-1">
		<span class="flex items-center gap-1">
			<span class="text-body-sm text-on-surface font-semibold truncate">{event.title}</span>
			{#if event.organizer.verified}<BadgeCheck class="w-3.5 h-3.5 text-tertiary shrink-0" />{/if}
		</span>
		<span class="text-label-badge text-on-surface-variant truncate">{fmtDate(event.startsAt)} • {event.venue}</span>
		<span class="flex items-center gap-2 pt-0.5">
			<span class="text-label-badge text-primary font-bold">{minPrice === 0 ? 'Free' : formatMoney(minPrice, currency.value)}</span>
			<span class="text-label-badge text-outline-variant">• {event.viewsToday.toLocaleString()} views today</span>
		</span>
	</span>
	<span class="w-9 h-9 rounded-full bg-surface-container-highest text-on-surface flex items-center justify-center shrink-0 group-hover:bg-primary">
		<ArrowRight class="w-4 h-4" />
	</span>
</button>
