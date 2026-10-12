<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { CalendarDays, List, Map as MapIcon, SearchX, SlidersHorizontal } from '@lucide/svelte';
	import ExploreCard from '$components/ExploreCard.svelte';
	import EventRow from '$components/EventRow.svelte';
	import SearchBar from '$components/SearchBar.svelte';
	import Sheet from '$components/Sheet.svelte';
	import Chip from '$components/Chip.svelte';
	import TopBar from '$components/TopBar.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import { categories } from '$components/iconMap';
	import { useQuery } from '$lib/state/query.svelte';
	import type { CategoryId, EventItem } from '$lib/types';

	let { data } = $props();

	const params = $derived(page.url.searchParams);
	const view = $derived(params.get('view') ?? 'list');

	let query = $state(params.get('q') ?? '');
	let showFilters = $state(false);

	// local filter draft inside the sheet
	let fCategory = $state<CategoryId>((params.get('category') as CategoryId) ?? 'all');
	let fFree = $state(params.get('free') === '1');
	let fFrom = $state(params.get('from') ?? '');
	let fTo = $state(params.get('to') ?? '');
	let fSort = $state(params.get('sort') ?? 'date');

	const key = $derived(`events:explore:${params.toString()}`);
	const results = useQuery<EventItem[]>(
		key,
		async () => {
			const res = await fetch(`/api/events?${params.toString()}`);
			return res.json();
		},
		{ staleTime: 20_000 },
		data.events
	);
	const events = $derived(results.data ?? []);

	const activeCount = $derived(
		(params.get('category') ? 1 : 0) +
			(params.get('free') ? 1 : 0) +
			(params.get('from') ? 1 : 0) +
			(params.get('to') ? 1 : 0) +
			(params.get('sort') ? 1 : 0)
	);

	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	function onSearch(v: string) {
		query = v;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => apply({ q: v || null }), 350);
	}

	function apply(extra: Record<string, string | null>) {
		const p = new URLSearchParams(params);
		for (const [k, v] of Object.entries(extra)) {
			if (v === null || v === '') p.delete(k);
			else p.set(k, v);
		}
		goto(`/explore?${p.toString()}`, { keepFocus: true });
	}

	function applySheet() {
		showFilters = false;
		apply({
			category: fCategory === 'all' ? null : fCategory,
			free: fFree ? '1' : null,
			from: fFrom || null,
			to: fTo || null,
			sort: fSort === 'date' ? null : fSort
		});
	}

	const byDate = $derived.by(() => {
		const map = new Map<string, EventItem[]>();
		for (const e of [...events].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))) {
			const d = new Date(e.startsAt).toLocaleDateString('en-NG', { weekday: 'long', month: 'long', day: 'numeric' });
			map.set(d, [...(map.get(d) ?? []), e]);
		}
		return [...map.entries()];
	});
</script>

<svelte:head><title>Explore • Owltside</title></svelte:head>

<TopBar title="Explore" subtitle="Search, filter, discover">
	{#snippet right()}
		<button
			aria-label="Open filters"
			class="relative w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface"
			onclick={() => (showFilters = true)}
		>
			<SlidersHorizontal class="w-5 h-5" />
			{#if activeCount > 0}
				<span class="absolute top-2 right-2 min-w-4 h-4 px-1 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center">{activeCount}</span>
			{/if}
		</button>
	{/snippet}
</TopBar>

<main class="flex flex-col relative w-full pt-16 pb-28 md:pb-16 bg-surface min-h-dvh">
	<div class="flex flex-col w-full md:max-w-5xl md:mx-auto">
		<div class="px-space-md py-space-sm bg-surface sticky top-16 z-30">
			<SearchBar value={query} oninput={onSearch} />
			<div class="flex items-center justify-between pt-space-sm">
				<div class="flex items-center gap-space-xs overflow-x-auto pb-1 scrollbar-none">
					<button
						class="flex items-center gap-1 px-3 py-1.5 rounded-full text-label-badge transition-all {view === 'list' ? 'bg-primary text-on-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'}"
						onclick={() => apply({ view: null })}
					>
						<List class="w-4 h-4" /><span>List</span>
					</button>
					<button
						class="flex items-center gap-1 px-3 py-1.5 rounded-full text-label-badge transition-all {view === 'map' ? 'bg-primary text-on-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'}"
						onclick={() => apply({ view: 'map' })}
					>
						<MapIcon class="w-4 h-4" /><span>Map</span>
					</button>
					<button
						class="flex items-center gap-1 px-3 py-1.5 rounded-full text-label-badge transition-all {view === 'calendar' ? 'bg-primary text-on-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'}"
						onclick={() => apply({ view: 'calendar' })}
					>
						<CalendarDays class="w-4 h-4" /><span>Calendar</span>
					</button>
				</div>
			</div>
			{#if activeCount > 0 || params.get('q')}
				<div class="flex items-center justify-between mt-2 px-space-md py-2 bg-surface-container-low rounded-xl">
					<div class="flex items-center gap-2 min-w-0">
						<span class="w-2 h-2 rounded-full bg-accent-emerald animate-pulse shrink-0"></span>
						<span class="text-body-sm text-on-surface-variant truncate">
							Filtering: <span class="text-on-surface font-medium">{params.get('q') ?? ''} {params.get('category') ?? ''} {params.get('free') ? '• Free only' : ''}</span>
						</span>
					</div>
					<button class="text-primary text-label-badge underline shrink-0" onclick={() => { query = ''; goto('/explore'); }}>Clear All</button>
				</div>
			{/if}
		</div>

		<div class="px-gutter pt-space-md flex flex-col gap-space-lg">
			{#if view === 'list'}
				<div class="flex flex-col gap-space-md w-full">
					{#each events as event (event.id)}
						<ExploreCard {event} />
					{:else}
						<EmptyState title="Nothing on the radar" sub="Loosen the filters or try another vibe.">
							{#snippet icon()}<SearchX class="w-6 h-6" />{/snippet}
						</EmptyState>
					{/each}
				</div>
			{:else if view === 'calendar'}
				<div class="flex flex-col gap-space-lg">
					{#each byDate as [date, list] (date)}
						<div class="flex flex-col gap-space-xs">
							<span class="font-code text-label-code text-tertiary uppercase tracking-wider">{date}</span>
							{#each list as event (event.id)}
								<EventRow {event} />
							{/each}
						</div>
					{:else}
						<EmptyState title="No dates match" sub="Try widening the date range.">
							{#snippet icon()}<CalendarDays class="w-6 h-6" />{/snippet}
						</EmptyState>
					{/each}
				</div>
			{:else}
				<!-- stylized map -->
				<div class="relative rounded-2xl overflow-hidden border border-surface-glass-border h-[420px]" style="background: linear-gradient(160deg, #131b2e, #0b1120 70%);">
					<div class="absolute inset-0 opacity-30" style="background-image: linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px); background-size: 36px 36px;"></div>
					{#each events.slice(0, 6) as event, i (event.id)}
						{@const pos = [[18, 26], [62, 18], [40, 48], [74, 62], [24, 70], [55, 80]][i]}
						<a
							href="/events/{event.slug}"
							class="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 group"
							style="left: {pos[0]}%; top: {pos[1]}%;"
						>
							<span class="w-3.5 h-3.5 rounded-full bg-primary ring-4 ring-primary/25 group-hover:scale-125 transition-transform"></span>
							<span class="px-2 py-0.5 rounded bg-surface-container-lowest/90 backdrop-blur text-label-badge text-on-surface whitespace-nowrap">{event.venue}</span>
						</a>
					{/each}
					<span class="absolute bottom-3 left-3 font-code text-label-code text-outline">LAGOS GRID • {events.length} EVENTS</span>
				</div>
			{/if}
		</div>
	</div>
</main>

<Sheet open={showFilters} title="Filters" close={() => (showFilters = false)}>
	{#snippet footer()}
		<button class="w-full h-12 rounded-full bg-primary text-on-primary font-semibold text-body-md active:scale-[0.98]" onclick={applySheet}>
			Show events
		</button>
	{/snippet}
	<div class="flex flex-col gap-space-lg">
		<div class="flex flex-col gap-space-xs">
			<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Category</span>
			<div class="flex flex-wrap gap-2">
				{#each categories as cat (cat.id)}
					<Chip label={cat.label} active={fCategory === cat.id} onclick={() => (fCategory = cat.id as CategoryId)} />
				{/each}
			</div>
		</div>
		<div class="flex flex-col gap-space-xs">
			<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Dates</span>
			<div class="grid grid-cols-2 gap-2">
				<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
					From
					<input type="date" bind:value={fFrom} class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" />
				</label>
				<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
					To
					<input type="date" bind:value={fTo} class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" />
				</label>
			</div>
		</div>
		<label class="flex items-center justify-between bg-surface-container-low border border-surface-glass-border rounded-lg p-3 cursor-pointer">
			<span class="text-body-md text-on-surface">Free events only</span>
			<input type="checkbox" bind:checked={fFree} class="w-4 h-4 accent-[#c0c1ff]" />
		</label>
		<div class="flex flex-col gap-space-xs">
			<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Sort by</span>
			<div class="flex flex-wrap gap-2">
				{#each [['date', 'Soonest'], ['popular', 'Popular'], ['price_asc', 'Price ↑'], ['price_desc', 'Price ↓']] as [id, label]}
					<Chip {label} active={fSort === id} onclick={() => (fSort = id)} />
				{/each}
			</div>
		</div>
	</div>
</Sheet>
