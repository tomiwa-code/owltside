<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		BadgeCheck,
		Bell,
		CalendarDays,
		ChevronDown,
		Fingerprint,
		Grid3x3,
		KeyRound,
		List,
		Map as MapIcon,
		MapPin,
		QrCode,
		Radio,
		RefreshCw,
		Search,
		SearchX,
		SlidersHorizontal,
		X
	} from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import Cover from '$components/Cover.svelte';
	import ExploreCard from '$components/ExploreCard.svelte';
	import EventRow from '$components/EventRow.svelte';
	import SearchBar from '$components/SearchBar.svelte';
	import Sheet from '$components/Sheet.svelte';
	import Chip from '$components/Chip.svelte';
	import TopBar from '$components/TopBar.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import { categories } from '$components/iconMap';
	import { useQuery } from '$lib/state/query.svelte';
	import { fmtDate, fmtTime } from '$lib/utils/dates';
	import { formatMoney } from '$lib/utils/money';
	import type { CategoryId, EventItem } from '$lib/types';

	let { data } = $props();

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	/* ── desktop discovery extras ───────────────────────────── */
	let viewMode = $state<'grid' | 'map' | 'timeline'>('grid');
	let zone = $state('');
	let maxPrice = $state(250_000);
	let freeOnlyDesk = $state(false);
	let gateQR = $state(true);
	let gateBio = $state(false);
	let gateTurnstile = $state(false);
	let activeRange = $state<'today' | 'tomorrow' | 'weekend' | 'custom' | null>(null);
	let visible = $state(6);

	const allEvents = useQuery<EventItem[]>(
		'events:explore-all',
		async () => {
			const res = await fetch('/api/events');
			return res.json();
		},
		{ staleTime: 60_000 },
		data.events
	);
	const countFor = (id: string) =>
		(allEvents.data ?? []).filter((e) => (id === 'all' ? true : e.category === id)).length;

	const iso = (d: Date) => d.toISOString().slice(0, 10);
	function setRange(r: 'today' | 'tomorrow' | 'weekend' | 'custom') {
		activeRange = r;
		if (r === 'custom') return;
		const now = new Date();
		if (r === 'today') apply({ from: iso(now), to: iso(now) });
		if (r === 'tomorrow') {
			const t = new Date(now);
			t.setDate(t.getDate() + 1);
			apply({ from: iso(t), to: iso(t) });
		}
		if (r === 'weekend') {
			const sat = new Date(now);
			sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7));
			const sun = new Date(sat);
			sun.setDate(sun.getDate() + 1);
			apply({ from: iso(sat), to: iso(sun) });
		}
	}

	const displayed = $derived.by(() =>
		events.filter((e) => {
			const mp = Math.min(...e.tiers.map((t) => t.price));
			if (mp > maxPrice) return false;
			if (freeOnlyDesk && mp !== 0) return false;
			if (zone && !`${e.venue} ${e.city}`.toLowerCase().includes(zone.split(',')[0].toLowerCase()))
				return false;
			const modes = (e.gates ?? []).flatMap((g) => g.modes);
			const hasQR = modes.includes('QR') || modes.length === 0;
			const hasNFC = modes.includes('NFC');
			const hasManual = modes.includes('Manual') || modes.length === 0;
			return (gateQR && hasQR) || (gateBio && hasNFC) || (gateTurnstile && hasManual);
		})
	);
	const shown = $derived(displayed.slice(0, visible));

	const activeChips = $derived.by(() => {
		const chips: { label: string; clear: () => void }[] = [];
		const cat = params.get('category');
		if (cat)
			chips.push({
				label: categories.find((c) => c.id === cat)?.label ?? cat,
				clear: () => apply({ category: null })
			});
		if (zone) chips.push({ label: zone.split(',')[0], clear: () => (zone = '') });
		if (maxPrice < 250_000)
			chips.push({ label: `Under ${formatMoney(maxPrice)}`, clear: () => (maxPrice = 250_000) });
		if (freeOnlyDesk) chips.push({ label: 'Free Only', clear: () => (freeOnlyDesk = false) });
		if (params.get('free'))
			chips.push({ label: 'Free Events', clear: () => apply({ free: null }) });
		if (params.get('q')) chips.push({ label: `“${params.get('q')}”`, clear: () => onSearch('') });
		if (params.get('from'))
			chips.push({
				label: `From ${fmtDate(params.get('from')!)}`,
				clear: () => {
					activeRange = null;
					apply({ from: null, to: null });
				}
			});
		return chips;
	});

	const cardFeatures: [any, string][] = [
		[QrCode, 'Instant QR Verification Active'],
		[Fingerprint, 'Fast-Pass Node Supported'],
		[BadgeCheck, 'Open Protocol Registration'],
		[KeyRound, 'Identity Attested Invite'],
		[Radio, 'Spatial Audio NFC Gateway']
	];
	const cardLabels = ['Access Pass', 'Tier 1 Entry', 'Early Bird', 'Admission', 'Executive Pass', 'Day Access'];

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

<!-- ── desktop (md+) discovery console per the desktop design source,
     themed with Evently Pulse tokens; mobile explore below unchanged ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">
	<!-- top bar -->
	<header class="sticky top-0 z-50 border-b border-surface-glass-border bg-surface-base/85 backdrop-blur-xl">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 h-16 flex items-center gap-5">
			<a href="/home" class="flex items-center gap-2.5 shrink-0">
				<span class="w-2 h-2 rounded-full bg-primary glow-primary"></span>
				<span class="font-display font-bold tracking-tight text-on-surface text-[17px]">OWLTSIDE</span>
				<span class="{MONO} text-tertiary border border-tertiary/25 bg-tertiary/10 rounded px-1.5 py-0.5">Secure_Node</span>
			</a>
			<nav class="flex items-center gap-1" aria-label="Primary">
				{#each [
					['/home', 'Home'],
					['/explore', 'Explore'],
					['/tickets', 'Tickets'],
					['/organizer', 'Organizer']
				] as [href, label]}
					<a
						{href}
						aria-current={href === '/explore' ? 'page' : undefined}
						class="px-3 h-9 rounded-lg flex items-center text-body-sm transition-colors
							{href === '/explore'
								? 'text-on-surface font-semibold bg-surface-container border border-surface-glass-border'
								: 'text-on-surface-variant hover:text-on-surface'}"
					>
						{label}
					</a>
				{/each}
			</nav>
			<div class="flex-1"></div>
			<span class="relative hidden lg:flex items-center w-72 h-10">
				<Search class="absolute left-3.5 w-4 h-4 text-outline-variant pointer-events-none" />
				<span class="w-full h-full rounded-full bg-surface-container-low border border-surface-glass-border pl-10 pr-12 flex items-center text-body-md text-outline-variant">Search events, gates, artists…</span>
				<kbd class="{MONO} absolute right-3 text-on-surface-variant border border-surface-glass-border rounded px-1.5 py-0.5">⌘K</kbd>
			</span>
			<a href="/notifications" aria-label="Notifications" class="relative w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors shrink-0">
				<Bell class="w-4.5 h-4.5" />
				<span class="absolute top-2 right-2 w-2 h-2 rounded-full bg-secondary ring-2 ring-surface-base"></span>
			</a>
			<div class="hidden xl:flex flex-col items-end leading-tight shrink-0">
				<span class="font-code text-label-badge text-on-surface">0x7E3…A14</span>
				<span class="font-code text-[10px] tracking-[0.14em] text-accent-emerald">GATE_PASS_ACTIVE</span>
			</div>
			<a href="/profile" aria-label="Your profile" class="shrink-0">
				<Avatar name={page.data.session?.name ?? 'Guest'} size="sm" />
			</a>
		</div>
	</header>

	<!-- search band -->
	<div class="border-b border-surface-glass-border bg-surface-container-low/60">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-4 flex flex-wrap items-center gap-4">
			<label class="relative flex-1 min-w-[280px]">
				<Search class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-outline-variant pointer-events-none" />
				<input
					type="search"
					placeholder="Search verified events, artists, venues in Nigeria…"
					value={query}
					oninput={(e) => onSearch(e.currentTarget.value)}
					class="w-full h-12 rounded-lg bg-surface-container border border-surface-glass-border pl-11 pr-36 text-body-md text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary/50 transition-colors"
				/>
				<kbd class="{MONO} absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant border border-surface-glass-border rounded px-2 py-1 bg-surface-container-high">Press / to focus</kbd>
			</label>
			<span class="flex items-center gap-2 {MONO} text-on-surface-variant shrink-0">
				<span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
				{(allEvents.data ?? events).length} Events Located in Nigeria
			</span>
			<span class="flex items-center gap-1 p-1 rounded-lg bg-surface-container border border-surface-glass-border shrink-0">
				{#each ([
					['grid', Grid3x3, 'Grid'],
					['map', MapIcon, 'Map'],
					['timeline', CalendarDays, 'Timeline']
				] as [typeof viewMode, any, string][]) as [id, Icon, label]}
					<button
						type="button"
						onclick={() => (viewMode = id)}
						class="h-9 px-3 rounded-md flex items-center gap-2 text-body-sm transition-colors
							{viewMode === id ? 'bg-surface-container-high text-on-surface font-semibold' : 'text-on-surface-variant hover:text-on-surface'}"
					>
						<Icon class="w-4 h-4" /> {label}
					</button>
				{/each}
			</span>
		</div>
	</div>

	<!-- body -->
	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-8 grid lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] gap-6 xl:gap-8 items-start">
		<!-- filters sidebar -->
		<aside class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-6 lg:sticky lg:top-24">
			<div class="flex items-center justify-between gap-3">
				<span class="flex items-center gap-2.5">
					<SlidersHorizontal class="w-4 h-4 text-primary" />
					<span class="font-display font-bold tracking-[0.08em] text-on-surface text-body-md uppercase">Discovery Filters</span>
				</span>
				<button
					type="button"
					onclick={() => {
						zone = '';
						maxPrice = 250_000;
						freeOnlyDesk = false;
						gateQR = true;
						gateBio = false;
						gateTurnstile = false;
						activeRange = null;
						apply({ category: null, free: null, from: null, to: null });
					}}
					class="text-body-sm text-on-surface-variant underline underline-offset-4 hover:text-on-surface"
				>
					Reset All
				</button>
			</div>

			<div class="flex flex-col gap-2">
				<span class="{MONO} text-on-surface-variant">Temporal Range</span>
				<div class="grid grid-cols-2 gap-2 pt-1">
					{#each (['today', 'tomorrow', 'weekend', 'custom'] as const) as r}
						<button
							type="button"
							onclick={() => setRange(r)}
							class="h-9 rounded-lg text-body-sm transition-colors border
								{activeRange === r
									? 'bg-surface-container-high border-surface-glass-border text-on-surface font-semibold'
									: 'bg-surface-container-low border-transparent text-on-surface-variant hover:text-on-surface'}"
						>
							{r === 'today' ? 'Today' : r === 'tomorrow' ? 'Tomorrow' : r === 'weekend' ? 'Weekend' : 'Custom Range'}
						</button>
					{/each}
				</div>
			</div>

			<div class="flex flex-col gap-2">
				<span class="{MONO} text-on-surface-variant">Discipline / Sector</span>
				<div class="flex flex-col gap-1 pt-1">
					{#each categories.filter((c) => c.id !== 'all') as cat (cat.id)}
						<label class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-container-high/60 cursor-pointer transition-colors">
							<input
								type="checkbox"
								class="accent-[#c0c1ff] w-4 h-4"
								checked={params.get('category') === cat.id}
								onchange={() => apply({ category: params.get('category') === cat.id ? null : cat.id })}
							/>
							<span class="flex-1 text-body-md text-on-surface">{cat.label}</span>
							<span class="font-code text-label-badge text-on-surface-variant">{String(countFor(cat.id)).padStart(2, '0')}</span>
						</label>
					{/each}
				</div>
			</div>

			<div class="flex flex-col gap-3">
				<span class="{MONO} text-on-surface-variant flex items-center justify-between">
					<span>Ticket Value</span>
					<span class="text-on-surface">₦0 - {formatMoney(maxPrice)}</span>
				</span>
				<input
					type="range"
					min="0"
					max="250000"
					step="5000"
					bind:value={maxPrice}
					class="w-full accent-[#c0c1ff]"
					aria-label="Maximum ticket value"
				/>
				<span class="flex items-center justify-between font-code text-label-badge text-on-surface-variant">
					<span>₦0</span><span>₦250,000</span>
				</span>
				<label class="flex items-center gap-3 px-2 py-1 cursor-pointer">
					<input type="checkbox" class="accent-[#c0c1ff] w-4 h-4" bind:checked={freeOnlyDesk} />
					<span class="text-body-md text-on-surface">Free Events Only</span>
				</label>
			</div>

			<div class="flex flex-col gap-2">
				<span class="{MONO} text-on-surface-variant">Zone &amp; Location</span>
				<div class="relative pt-1">
					<select
						bind:value={zone}
						aria-label="Zone and location"
						class="w-full h-11 appearance-none px-4 pr-10 rounded-lg bg-surface-container-low border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary/50"
					>
						<option value="">All Nigeria</option>
						<option value="Victoria Island, Lagos">Victoria Island, Lagos</option>
						<option value="Ikoyi, Lagos">Ikoyi, Lagos</option>
						<option value="Yaba, Lagos">Yaba, Lagos</option>
						<option value="Gbagada, Lagos">Gbagada, Lagos</option>
						<option value="Onikan, Lagos">Onikan, Lagos</option>
					</select>
					<ChevronDown class="w-4 h-4 text-on-surface-variant absolute right-3.5 top-1/2 translate-y-[-30%] pointer-events-none" />
				</div>
			</div>

			<div class="flex flex-col gap-2">
				<span class="{MONO} text-on-surface-variant">Gate Clearance Type</span>
				<div class="flex flex-col gap-1 pt-1">
					{#each [
						{ key: 'qr', title: 'Instant QR Node', sub: 'Offline cryptographically signed' },
						{ key: 'bio', title: 'Biometric Fast-Pass', sub: 'Hardware terminal gate sync' },
						{ key: 'turn', title: 'General Turnstile', sub: 'Standard RFID badge or code' }
					] as row (row.key)}
						<label class="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-surface-container-high/60 cursor-pointer transition-colors">
							<input
								type="checkbox"
								class="accent-[#c0c1ff] w-4 h-4 mt-0.5"
								checked={row.key === 'qr' ? gateQR : row.key === 'bio' ? gateBio : gateTurnstile}
								onchange={() => {
									if (row.key === 'qr') gateQR = !gateQR;
									else if (row.key === 'bio') gateBio = !gateBio;
									else gateTurnstile = !gateTurnstile;
								}}
							/>
							<span class="min-w-0">
								<span class="block text-body-md text-on-surface">{row.title}</span>
								<span class="block text-body-sm text-on-surface-variant pt-0.5">{row.sub}</span>
							</span>
						</label>
					{/each}
				</div>
			</div>
		</aside>

		<!-- results -->
		<section class="flex flex-col gap-6 min-w-0">
			<!-- active chips + sort -->
			<div class="rounded-xl border border-surface-glass-border bg-surface-container px-4 py-3 flex flex-wrap items-center gap-3">
				<span class="{MONO} text-on-surface-variant">Active:</span>
				{#each activeChips as chip (chip.label)}
					<span class="h-8 px-3 rounded-lg bg-surface-container-high border border-surface-glass-border flex items-center gap-2 text-body-sm text-on-surface">
						{chip.label}
						<button type="button" aria-label="Remove filter {chip.label}" onclick={chip.clear} class="text-on-surface-variant hover:text-error">
							<X class="w-3.5 h-3.5" />
						</button>
					</span>
				{:else}
					<span class="text-body-sm text-on-surface-variant">No filters — showing the full Lagos mesh</span>
				{/each}
				<span class="ml-auto flex items-center gap-3">
					<span class="{MONO} text-on-surface-variant">Sort:</span>
					<span class="relative">
						<select
							aria-label="Sort events"
							value={params.get('sort') ?? 'popular'}
							onchange={(e) => apply({ sort: e.currentTarget.value === 'popular' ? null : e.currentTarget.value })}
							class="h-9 appearance-none pl-3 pr-9 rounded-lg bg-surface-container-high border border-surface-glass-border text-body-sm text-on-surface focus:outline-none focus:border-primary/50"
						>
							<option value="popular">Relevance Node</option>
							<option value="date">Date Ascending</option>
							<option value="price_asc">Price Low → High</option>
							<option value="price_desc">Price High → Low</option>
						</select>
						<ChevronDown class="w-4 h-4 text-on-surface-variant absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
					</span>
				</span>
			</div>

			{#if viewMode === 'grid'}
				<div class="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
					{#each shown as event, i (event.id)}
						{@const mp = Math.min(...event.tiers.map((t) => t.price))}
						{@const soldPct = Math.round(
							(event.tiers.reduce((s, t) => s + t.sold, 0) /
								Math.max(1, event.tiers.reduce((s, t) => s + t.capacity, 0))) *
								100
						)}
						{@const [FeatureIcon, featureLabel] = cardFeatures[i % cardFeatures.length]}
						<button
							type="button"
							onclick={() => goto(`/events/${event.slug}`)}
							class="rounded-xl overflow-hidden border border-surface-glass-border bg-surface-container text-left flex flex-col hover:border-primary/40 transition-colors group"
						>
							<div class="relative aspect-[16/10] overflow-hidden">
								<Cover cover={event.cover} class="w-full h-full group-hover:scale-105 transition-transform duration-500" />
								<span class="{MONO} absolute top-3 left-3 bg-surface-base/80 backdrop-blur-md border border-surface-glass-border text-on-surface px-2 py-1 rounded">
									{event.category.replace('_', ' ')}
								</span>
								{#if mp === 0}
									<span class="{MONO} absolute top-3 right-3 bg-primary text-on-primary px-2 py-1 rounded">Community Grant</span>
								{:else if soldPct >= 90}
									<span class="{MONO} absolute top-3 right-3 bg-secondary-container text-on-secondary-container font-bold px-2 py-1 rounded">{soldPct}% Full</span>
								{/if}
							</div>
							<div class="p-5 flex flex-col gap-3 flex-1">
								<span class="flex items-center gap-2 font-code text-label-badge tracking-[0.08em] text-on-surface-variant">
									<CalendarDays class="w-3.5 h-3.5 text-primary" />
									{fmtDate(event.startsAt)} • {fmtTime(event.startsAt)} WAT
								</span>
								<h3 class="font-display text-headline-md text-on-surface leading-tight">{event.title}</h3>
								<span class="flex items-center gap-1.5 text-body-sm text-on-surface-variant min-w-0">
									<MapPin class="w-3.5 h-3.5 shrink-0" />
									<span class="truncate">{event.venue}, {event.city}</span>
								</span>
								<span class="flex items-center gap-2 text-body-sm text-on-surface-variant pt-1">
									<FeatureIcon class="w-4 h-4 text-tertiary shrink-0" /> {featureLabel}
								</span>
								<div class="mt-auto flex items-end justify-between gap-3 border-t border-surface-glass-border pt-3">
									<div>
										<span class="{MONO} text-on-surface-variant block">{cardLabels[i % cardLabels.length]}</span>
										<span class="font-code text-body-md font-bold block pt-0.5 {mp === 0 ? 'text-accent-emerald' : 'text-on-surface'}">
											{mp === 0 ? 'FREE' : formatMoney(mp)}
										</span>
									</div>
									<span
										class="h-9 px-3.5 rounded-lg flex items-center text-body-sm font-semibold transition-colors
											{mp === 0
												? 'bg-primary text-on-primary'
												: 'bg-surface-container-high border border-surface-glass-border text-on-surface group-hover:bg-primary group-hover:text-on-primary group-hover:border-primary'}"
									>
										{mp === 0 ? 'Claim Seat' : 'Pass Details'}
									</span>
								</div>
							</div>
						</button>
					{:else}
						<div class="col-span-full rounded-xl border border-dashed border-outline-variant/50 p-10 text-center flex flex-col items-center gap-3">
							<SearchX class="w-8 h-8 text-on-surface-variant" />
							<p class="text-body-md text-on-surface-variant">No protocol nodes match this filter mesh.</p>
						</div>
					{/each}
				</div>
			{:else if viewMode === 'map'}
				<div class="relative rounded-xl border border-surface-glass-border bg-surface-container-low overflow-hidden h-[520px]">
					<div
						class="absolute inset-0 opacity-60"
						style="background-image: linear-gradient(rgba(192,193,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(192,193,255,0.07) 1px, transparent 1px), radial-gradient(circle at 60% 40%, rgba(76,215,246,0.10) 0, transparent 45%); background-size: 28px 28px, 28px 28px, 100% 100%;"
					></div>
					{#each shown as event, i (event.id)}
						<a
							href="/events/{event.slug}"
							class="absolute -translate-x-1/2 -translate-y-1/2 group"
							style="left: {18 + (i % 3) * 28}%; top: {22 + Math.floor(i / 3) * 26}%"
						>
							<span class="block w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
								<MapPin class="w-4 h-4" />
							</span>
							<span class="{MONO} hidden group-hover:block absolute left-1/2 -translate-x-1/2 top-10 bg-surface-base/90 backdrop-blur-md border border-surface-glass-border text-on-surface px-2 py-1 rounded whitespace-nowrap">
								{event.title}
							</span>
						</a>
					{/each}
					<span class="{MONO} absolute bottom-3 left-3 bg-surface-base/85 backdrop-blur-md border border-surface-glass-border text-on-surface-variant px-2.5 py-1 rounded">
						Lagos Mesh • {shown.length} nodes pinned
					</span>
				</div>
			{:else}
				<div class="flex flex-col gap-5">
					{#each byDate as [dayLabel, dayEvents]}
						<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5">
							<span class="{MONO} text-on-surface-variant">{dayLabel}</span>
							<div class="flex flex-col gap-2 pt-3">
								{#each dayEvents as event (event.id)}
									<a href="/events/{event.slug}" class="flex items-center gap-4 rounded-lg bg-surface-container-low border border-surface-glass-border px-4 py-3 hover:border-primary/40 transition-colors">
										<span class="font-code text-body-md font-bold text-primary w-20 shrink-0">{fmtTime(event.startsAt)}</span>
										<span class="flex-1 text-body-md font-semibold text-on-surface truncate">{event.title}</span>
										<span class="text-body-sm text-on-surface-variant truncate hidden xl:block">{event.venue}</span>
									</a>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- load more + sync -->
			<div class="flex flex-col items-center gap-4 pt-2">
				<span class="{MONO} text-on-surface-variant">Showing {shown.length} of {displayed.length} Protocol Nodes</span>
				{#if visible < displayed.length}
					<button
						type="button"
						onclick={() => (visible += 6)}
						class="h-11 px-6 rounded-lg bg-surface-container border border-surface-glass-border text-body-sm font-semibold text-on-surface flex items-center gap-2 hover:border-primary/40 transition-colors"
					>
						<RefreshCw class="w-4 h-4" /> Load More Events
					</button>
				{/if}
				<span class="{MONO} text-on-surface-variant flex flex-wrap items-center justify-center gap-2">
					Sync: LAGOS-EDGE-01 <span class="text-outline-variant">•</span> Latency: 14ms
					<span class="text-outline-variant">•</span> Chain_State: Synchronized
				</span>
			</div>
		</section>
	</div>

	<!-- footer -->
	<footer class="mt-4 border-t border-surface-glass-border">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-col lg:flex-row items-center justify-between gap-3">
			<span class="flex items-center gap-3">
				<span class="font-display font-bold text-on-surface tracking-tight">OWLTSIDE</span>
				<span class="w-px h-4 bg-outline-variant/40"></span>
				<span class="{MONO} text-on-surface-variant">Event Ticketing Architecture</span>
			</span>
			<span class="flex items-center gap-5">
				<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
					System Status: 99.98% Optimal
				</span>
				<span class="{MONO} text-on-surface-variant">© {new Date().getFullYear()} Owltside Protocol</span>
			</span>
		</div>
	</footer>
</div>

<div class="md:hidden">
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
</div>
