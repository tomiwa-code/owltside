<script lang="ts">
	import { Bookmark, BookmarkCheck, Plus, Users } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import type { EventItem } from '$lib/types';
	import { fmtTime } from '$lib/utils/dates';
	import { formatMoney } from '$lib/utils/money';
	import { bookmarks, currency, toggleIn } from '$lib/state/prefs.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import Cover from './Cover.svelte';

	let { event, width = 'w-[260px]' }: { event: EventItem; width?: string } = $props();

	const minPrice = $derived(Math.min(...event.tiers.map((t) => t.price)));
	const free = $derived(minPrice === 0);
	const saved = $derived(bookmarks.value.includes(event.id));
	const sellingFast = $derived(
		event.tiers.some((t) => t.capacity > 0 && (t.capacity - t.sold) / t.capacity < 0.15)
	);

	function dateLabel(): string {
		const d = new Date(event.startsAt);
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
		return `${d.toLocaleDateString('en-NG', { weekday: 'short' })}, ${fmtTime(event.startsAt)}`;
	}

	function toggleSave(e: Event) {
		e.stopPropagation();
		const added = toggleIn(bookmarks, event.id);
		toast(added ? 'Saved to your list' : 'Removed from saved', 'info');
	}
</script>

<button
	class="{width} rounded-xl bg-surface-container overflow-hidden flex flex-col shadow-md text-left group hover:bg-surface-container-high transition-colors"
	onclick={() => goto(`/events/${event.slug}`)}
>
	<div class="relative w-full aspect-[16/10] overflow-hidden">
		<Cover cover={event.cover} class="w-full h-full group-hover:scale-105 transition-transform duration-300" />
		{#if event.live}
			<span class="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-secondary-container/90 text-on-secondary-container text-label-badge font-bold flex items-center gap-1">
				<span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span> LIVE NOW
			</span>
		{:else if free}
			<span class="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-accent-emerald/90 text-on-surface text-label-badge font-bold">FREE ENTRY</span>
		{:else if sellingFast}
			<span class="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-secondary-container/90 text-on-secondary-container text-label-badge font-bold">SELLING FAST</span>
		{/if}
		<span
			role="button"
			tabindex="0"
			aria-label={saved ? 'Remove bookmark' : 'Bookmark'}
			onclick={toggleSave}
			onkeydown={(e) => e.key === 'Enter' && toggleSave(e as unknown as Event)}
			class="absolute top-2 right-2 w-7 h-7 rounded-full bg-surface-container-highest/80 backdrop-blur-md text-on-surface flex items-center justify-center"
		>
			{#if saved}
				<BookmarkCheck class="w-4 h-4 text-primary" />
			{:else}
				<Bookmark class="w-4 h-4" />
			{/if}
		</span>
	</div>
	<div class="p-3 flex flex-col gap-2 flex-grow justify-between">
		<div class="flex flex-col gap-1">
			<span class="text-label-badge {free ? 'text-accent-emerald' : 'text-primary'}">
				{dateLabel()} • {event.venue}
			</span>
			<span class="text-body-lg text-on-surface font-semibold truncate leading-tight">{event.title}</span>
			<span class="text-body-sm text-on-surface-variant flex items-center gap-1">
				<Users class="w-3.5 h-3.5" /> {event.attendees.toLocaleString()} going
			</span>
		</div>
		<div class="flex items-center justify-between pt-1">
			<span class="font-display text-headline-md font-bold {free ? 'text-accent-emerald' : 'text-primary'}">
				{free ? 'Free' : formatMoney(minPrice, currency.value)}
			</span>
			<span class="w-8 h-8 rounded-full bg-surface-container-high group-hover:bg-primary group-hover:text-on-primary text-on-surface flex items-center justify-center transition-colors">
				<Plus class="w-4 h-4" />
			</span>
		</div>
	</div>
</button>
