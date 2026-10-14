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
		Users,
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
	import { mockProfiles } from '$lib/data/mock-profiles';
	import { useQuery } from '$lib/state/query.svelte';
	import { fmtDate, fmtTime } from '$lib/utils/dates';
	import { formatMoney } from '$lib/utils/money';
	import { NIGERIAN_STATES } from '$lib/constants/nigeria-states';
	import type { CategoryId, EventItem } from '$lib/types';

	let { data } = $props();

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	/* ── shared discovery state (desktop sidebar + mobile filter sheet) ── */
	const params = $derived(page.url.searchParams);
	const view = $derived(params.get('view') ?? 'list');
	const requestedZone = params.get('zone') ?? '';
	const viewMode = $derived<'grid' | 'map' | 'timeline'>(
		view === 'map' ? 'map' : view === 'timeline' || view === 'calendar' ? 'timeline' : 'grid'
	);
	const searchTab = $derived((params.get('tab') ?? 'events') as 'events' | 'users' | 'venues');
	function setTab(t: 'events' | 'users' | 'venues') {
		apply({ tab: t === 'events' ? null : t });
	}
	let zone = $state((NIGERIAN_STATES as readonly string[]).includes(requestedZone) ? requestedZone : '');
	let maxPrice = $state(Number(params.get('maxPrice') ?? 250_000));
	let freeOnlyDesk = $state(params.get('freeOnly') === '1' || params.get('free') === '1');
	let gateQR = $state(params.get('gateQR') !== '0');
	let gateBio = $state(params.get('gateBio') === '1');
	let gateTurnstile = $state(params.get('gateTurnstile') === '1');
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
			if (zone && !`${e.venue} ${e.city}`.toLowerCase().includes(zone.toLowerCase()))
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
		if (zone)
			chips.push({
				label: `${zone} State`,
				clear: () => {
					zone = '';
					apply({ zone: null });
				}
			});
		if (maxPrice < 250_000)
			chips.push({
				label: `Under ${formatMoney(maxPrice)}`,
				clear: () => {
					maxPrice = 250_000;
					apply({ maxPrice: null });
				}
			});
		if (freeOnlyDesk)
			chips.push({
				label: 'Free Only',
				clear: () => {
					freeOnlyDesk = false;
					apply({ free: null });
				}
			});
		if (gateBio)
			chips.push({
				label: 'Biometric gate',
				clear: () => {
					gateBio = false;
					apply({ gateBio: null });
				}
			});
		if (gateTurnstile)
			chips.push({
				label: 'Turnstile gate',
				clear: () => {
					gateTurnstile = false;
					apply({ gateTurnstile: null });
				}
			});
		if (!gateQR)
			chips.push({
				label: 'No QR gate',
				clear: () => {
					gateQR = true;
					apply({ gateQR: null });
				}
			});
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

	let query = $state(params.get('q') ?? '');
	let showFilters = $state(false);

	// Mobile sheet draft; synced from the live desktop/shared filters each time it opens.
	let fCategory = $state<CategoryId>((params.get('category') as CategoryId) ?? 'all');
	let fFree = $state(freeOnlyDesk);
	let fFrom = $state(params.get('from') ?? '');
	let fTo = $state(params.get('to') ?? '');
	let fSort = $state(params.get('sort') ?? 'date');
	let fZone = $state(zone);
	let fMaxPrice = $state(maxPrice);
	let fGateQR = $state(gateQR);
	let fGateBio = $state(gateBio);
	let fGateTurnstile = $state(gateTurnstile);

	function syncFilterDrafts() {
		fCategory = (params.get('category') as CategoryId) ?? 'all';
		fFree = freeOnlyDesk || params.get('free') === '1';
		fFrom = params.get('from') ?? '';
		fTo = params.get('to') ?? '';
		fSort = params.get('sort') ?? 'date';
		fZone = zone;
		fMaxPrice = maxPrice;
		fGateQR = gateQR;
		fGateBio = gateBio;
		fGateTurnstile = gateTurnstile;
	}

	function openFilters() {
		syncFilterDrafts();
		showFilters = true;
	}

	function setDraftRange(r: 'today' | 'tomorrow' | 'weekend') {
		const now = new Date();
		const start = new Date(now);
		if (r === 'tomorrow') start.setDate(start.getDate() + 1);
		if (r === 'weekend') start.setDate(start.getDate() + ((6 - start.getDay() + 7) % 7));
		const end = new Date(start);
		if (r === 'weekend') end.setDate(end.getDate() + 1);
		fFrom = iso(start);
		fTo = iso(end);
		activeRange = r;
	}

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
			(freeOnlyDesk ? 1 : 0) +
			(params.get('from') ? 1 : 0) +
			(params.get('to') ? 1 : 0) +
			(params.get('sort') ? 1 : 0) +
			(zone ? 1 : 0) +
			(maxPrice < 250_000 ? 1 : 0) +
			(gateBio ? 1 : 0) +
			(gateTurnstile ? 1 : 0) +
			(!gateQR ? 1 : 0)
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

	function clearFilters() {
		zone = '';
		maxPrice = 250_000;
		freeOnlyDesk = false;
		gateQR = true;
		gateBio = false;
		gateTurnstile = false;
		activeRange = null;
		visible = 6;
		query = '';
		apply({
			category: null,
			q: null,
			free: null,
			from: null,
			to: null,
			sort: null,
			zone: null,
			maxPrice: null,
			gateQR: null,
			gateBio: null,
			gateTurnstile: null,
			view: null
		});
	}

	function applySheet() {
		showFilters = false;
		zone = fZone;
		maxPrice = fMaxPrice;
		freeOnlyDesk = fFree;
		gateQR = fGateQR;
		gateBio = fGateBio;
		gateTurnstile = fGateTurnstile;
		visible = 6;
		apply({
			category: fCategory === 'all' ? null : fCategory,
			free: fFree ? '1' : null,
			from: fFrom || null,
			to: fTo || null,
			sort: fSort === 'date' ? null : fSort,
			zone: fZone || null,
			maxPrice: fMaxPrice >= 250_000 ? null : String(fMaxPrice),
			gateQR: fGateQR ? null : '0',
			gateBio: fGateBio ? '1' : null,
			gateTurnstile: fGateTurnstile ? '1' : null
		});
	}

	const byDate = $derived.by(() => {
		const map = new Map<string, EventItem[]>();
		for (const e of [...shown].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))) {
			const d = new Date(e.startsAt).toLocaleDateString('en-NG', { weekday: 'long', month: 'long', day: 'numeric' });
			map.set(d, [...(map.get(d) ?? []), e]);
		}
		return [...map.entries()];
	});

	const usersFiltered = $derived(
		mockProfiles.filter((p) => {
			if (!query) return true;
			const q = query.toLowerCase();
			return `${p.name} ${p.handle} ${p.bio ?? ''} ${p.city ?? ''}`.toLowerCase().includes(q);
		})
	);
	const venues = $derived.by(() => {
		const map = new Map<string, { venue: string; city: string; count: number; cover: any; events: EventItem[] }>();
		for (const e of (allEvents.data ?? [])) {
			const key = `${e.venue}||${e.city}`;
			const existing = map.get(key);
			if (existing) {
				existing.count += 1;
				existing.events.push(e);
			} else {
				map.set(key, { venue: e.venue, city: e.city, count: 1, cover: e.cover, events: [e] });
			}
		}
		return [...map.values()];
	});
	const venuesFiltered = $derived(
		venues.filter((v) => {
			if (!query) return true;
			const q = query.toLowerCase();
			return `${v.venue} ${v.city}`.toLowerCase().includes(q);
		})
	);
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

	<!-- search band with tabs -->
	<div class="border-b border-surface-glass-border bg-surface-container-low/60">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-4">
			<!-- tabs above search bar -->
			<div role="tablist" aria-label="Search categories" class="flex items-center gap-2 pb-3">
				{#each ([
					['events', Search, 'Events'],
					['users', Users, 'Users'],
					['venues', MapPin, 'Venues']
				] as [string, any, string][]) as [id, Icon, label]}
					<button
						role="tab"
						aria-selected={searchTab === id}
						type="button"
						onclick={() => setTab(id as 'events' | 'users' | 'venues')}
						class="h-9 px-4 rounded-full flex items-center gap-2 text-body-sm font-semibold transition-colors border {searchTab === id ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container text-on-surface-variant border-surface-glass-border hover:text-on-surface hover:border-primary/30'}"
					>
						<Icon class="w-4 h-4" /> {label}
					</button>
				{/each}
			</div>
			<div class="pb-4 flex flex-wrap items-center gap-4">
				<label class="relative flex-1 min-w-[280px]">
					<Search class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-outline-variant pointer-events-none" />
					<input
						type="search"
						placeholder={searchTab === 'users' ? 'Search users by name, handle, or city…' : searchTab === 'venues' ? 'Search venues by name or city…' : 'Search verified events, artists, venues in Nigeria…'}
						value={query}
						oninput={(e) => onSearch(e.currentTarget.value)}
						class="w-full h-12 rounded-lg bg-surface-container border border-surface-glass-border pl-11 pr-36 text-body-md text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary/50 transition-colors"
					/>
					<kbd class="{MONO} absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant border border-surface-glass-border rounded px-2 py-1 bg-surface-container-high">Press / to focus</kbd>
				</label>
				<span class="flex items-center gap-2 {MONO} text-on-surface-variant shrink-0">
					<span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
					{#if searchTab === 'users'}{usersFiltered.length} Users Found
					{:else if searchTab === 'venues'}{venuesFiltered.length} Venues Found
					{:else}{(allEvents.data ?? events).length} Events Located in Nigeria{/if}
				</span>
				{#if searchTab === 'events'}
				<span class="flex items-center gap-1 p-1 rounded-lg bg-surface-container border border-surface-glass-border shrink-0">
					{#each ([
						['grid', Grid3x3, 'Grid'],
						['map', MapIcon, 'Map'],
						['timeline', CalendarDays, 'Timeline']
					] as [typeof viewMode, any, string][]) as [id, Icon, label]}
						<button
							type="button"
							onclick={() => apply({ view: id === 'grid' ? null : id })}
							class="h-9 px-3 rounded-md flex items-center gap-2 text-body-sm transition-colors
								{viewMode === id ? 'bg-surface-container-high text-on-surface font-semibold' : 'text-on-surface-variant hover:text-on-surface'}"
						>
							<Icon class="w-4 h-4" /> {label}
						</button>
					{/each}
				</span>
				{/if}
			</div>
		</div>
	</div>

	<!-- body -->
	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-8 {searchTab === 'events' ? 'grid lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]' : ''} gap-6 xl:gap-8 items-start">
		{#if searchTab === 'events'}
		<!-- filters sidebar -->
		<aside class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-6 lg:sticky lg:top-24">
			<div class="flex items-center justify-between gap-3">
				<span class="flex items-center gap-2.5">
					<SlidersHorizontal class="w-4 h-4 text-primary" />
					<span class="font-display font-bold tracking-[0.08em] text-on-surface text-body-md uppercase">Discovery Filters</span>
				</span>
				<button
					type="button"
					onclick={clearFilters}
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
						{#each NIGERIAN_STATES as state (state)}
							<option value={state}>{state} State</option>
						{/each}
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
		{/if}

		<!-- results -->
		<section class="flex flex-col gap-6 min-w-0">
			{#if searchTab === 'events'}
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
			{:else if searchTab === 'users'}
			<div class="flex flex-col gap-4">
				<div class="flex items-center justify-between">
					<h2 class="font-display text-headline-md text-on-surface">Users</h2>
					<span class="{MONO} text-on-surface-variant">{usersFiltered.length} profiles</span>
				</div>
				{#if usersFiltered.length}
					<div class="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
						{#each usersFiltered as person (person.id)}
							<a href="/users/{person.handle}" class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-4 hover:border-primary/40 transition-colors">
								<div class="flex items-center gap-3">
									<Avatar name={person.name} color={person.avatarColor} size="md" />
									<span class="min-w-0">
										<span class="flex items-center gap-1.5"><span class="text-body-md font-semibold text-on-surface truncate">{person.name}</span>{#if person.verified}<BadgeCheck class="w-3.5 h-3.5 text-tertiary shrink-0" />{/if}</span>
										<span class="block text-body-sm text-on-surface-variant truncate">@{person.handle} {#if person.city}• {person.city}{/if}</span>
									</span>
								</div>
								<p class="text-body-sm text-on-surface-variant line-clamp-2 leading-relaxed">{person.bio ?? 'No bio yet.'}</p>
								<span class="flex items-center gap-3 text-label-badge text-on-surface-variant">
									<span>{person.followers.toLocaleString()} followers</span>
									<span class="w-px h-3 bg-outline-variant/40"></span>
									<span>{person.following.toLocaleString()} following</span>
								</span>
							</a>
						{/each}
					</div>
				{:else}
					<div class="rounded-xl border border-dashed border-outline-variant/50 p-10 text-center flex flex-col items-center gap-3">
						<SearchX class="w-8 h-8 text-on-surface-variant" />
						<p class="text-body-md text-on-surface-variant">No users match “{query}”.</p>
					</div>
				{/if}
			</div>
			{:else}
			<div class="flex flex-col gap-4">
				<div class="flex items-center justify-between">
					<h2 class="font-display text-headline-md text-on-surface">Venues</h2>
					<span class="{MONO} text-on-surface-variant">{venuesFiltered.length} venues</span>
				</div>
				{#if venuesFiltered.length}
					<div class="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
						{#each venuesFiltered as v (`${v.venue}::${v.city}`)}
							<div class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden flex flex-col">
								<div class="relative h-28">
									<Cover cover={v.cover} class="w-full h-full" />
									<span class="{MONO} absolute top-3 right-3 bg-surface-base/85 backdrop-blur-md border border-surface-glass-border text-on-surface px-2 py-1 rounded">{v.count} {v.count === 1 ? 'event' : 'events'}</span>
								</div>
								<div class="p-5 flex flex-col gap-2">
									<span class="flex items-center gap-2 text-body-sm text-on-surface-variant"><MapPin class="w-4 h-4 text-primary" /> {v.city}</span>
									<h3 class="font-display text-headline-md text-on-surface leading-tight line-clamp-1">{v.venue}</h3>
									<span class="text-body-sm text-on-surface-variant">{v.count} upcoming {v.count === 1 ? 'gathering' : 'gatherings'} at this hub</span>
									<div class="flex flex-col gap-1.5 pt-2">
										{#each v.events.slice(0, 2) as ev (ev.id)}
											<a href="/events/{ev.slug}" class="text-body-sm text-primary hover:underline truncate">→ {ev.title}</a>
										{/each}
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="rounded-xl border border-dashed border-outline-variant/50 p-10 text-center flex flex-col items-center gap-3">
						<SearchX class="w-8 h-8 text-on-surface-variant" />
						<p class="text-body-md text-on-surface-variant">No venues match “{query}”.</p>
					</div>
				{/if}
			</div>
			{/if}
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
		{#if searchTab === 'events'}
		<button
			aria-label="Open filters"
			class="relative w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface"
			onclick={openFilters}
		>
			<SlidersHorizontal class="w-5 h-5" />
			{#if activeCount > 0}
				<span class="absolute top-2 right-2 min-w-4 h-4 px-1 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center">{activeCount}</span>
			{/if}
		</button>
		{/if}
	{/snippet}
</TopBar>

<main class="flex flex-col relative w-full pt-mobile-header pb-28 md:pb-16 bg-surface min-h-dvh">
	<div class="flex flex-col w-full md:max-w-5xl md:mx-auto">
		<div class="px-space-md py-space-sm bg-surface sticky top-16 z-30">
			<!-- tabs above search bar -->
			<div role="tablist" aria-label="Search categories" class="flex items-center gap-2 pb-3">
				{#each ([
					['events', Search, 'Events'],
					['users', Users, 'Users'],
					['venues', MapPin, 'Venues']
				] as [string, any, string][]) as [id, Icon, label]}
					<button
						role="tab"
						aria-selected={searchTab === id}
						type="button"
						onclick={() => setTab(id as 'events' | 'users' | 'venues')}
						class="h-9 px-4 rounded-full flex items-center gap-2 text-body-sm font-semibold transition-colors border {searchTab === id ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container text-on-surface-variant border-surface-glass-border hover:text-on-surface'}"
					>
						<Icon class="w-4 h-4" /> {label}
					</button>
				{/each}
			</div>
			<SearchBar value={query} oninput={onSearch} placeholder={searchTab === 'users' ? 'Search users by name, handle, or city…' : searchTab === 'venues' ? 'Search venues by name or city…' : 'Search artists, tech summits, venues...'} />
			{#if searchTab === 'events'}
			<div class="flex items-center justify-between pt-space-sm">
				<div class="flex items-center gap-space-xs overflow-x-auto pb-1 scrollbar-none">
					<button
						class="flex items-center gap-1 px-3 py-1.5 rounded-full text-label-badge transition-all {viewMode === 'grid' ? 'bg-primary text-on-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'}"
						onclick={() => apply({ view: null })}
					>
						<List class="w-4 h-4" /><span>List</span>
					</button>
					<button
						class="flex items-center gap-1 px-3 py-1.5 rounded-full text-label-badge transition-all {viewMode === 'map' ? 'bg-primary text-on-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'}"
						onclick={() => apply({ view: 'map' })}
					>
						<MapIcon class="w-4 h-4" /><span>Map</span>
					</button>
					<button
						class="flex items-center gap-1 px-3 py-1.5 rounded-full text-label-badge transition-all {viewMode === 'timeline' ? 'bg-primary text-on-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'}"
						onclick={() => apply({ view: 'timeline' })}
					>
						<CalendarDays class="w-4 h-4" /><span>Calendar</span>
					</button>
				</div>
			</div>
			{/if}
			{#if searchTab === 'events' && (activeCount > 0 || params.get('q'))}
				<div class="mt-2 rounded-xl bg-surface-container-low border border-surface-glass-border px-3 py-2.5">
					<div class="flex items-center justify-between gap-2">
						<span class="flex items-center gap-2 text-label-badge text-on-surface-variant">
							<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span>
							{activeCount} active {activeCount === 1 ? 'filter' : 'filters'}
						</span>
						<button class="text-primary text-label-badge underline shrink-0" onclick={clearFilters}>Clear all</button>
					</div>
					<div class="flex flex-wrap gap-1.5 pt-2">
						{#each activeChips as chip (chip.label)}
							<button class="h-7 px-2 rounded-full bg-surface-container-high text-label-badge text-on-surface flex items-center gap-1" onclick={chip.clear}>
								{chip.label}<X class="w-3 h-3 text-on-surface-variant" />
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<div class="px-gutter pt-space-md flex flex-col gap-space-lg">
				{#if searchTab === 'events'}
				{#if viewMode === 'grid'}
				<div class="flex flex-col gap-space-md w-full">
					{#each shown as event (event.id)}
						<ExploreCard {event} />
					{:else}
						<EmptyState title="Nothing on the radar" sub="Loosen the filters or try another vibe.">
							{#snippet icon()}<SearchX class="w-6 h-6" />{/snippet}
						</EmptyState>
					{/each}
				</div>
				{:else if viewMode === 'timeline'}
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
					{#each shown.slice(0, 6) as event, i (event.id)}
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
					<span class="absolute bottom-3 left-3 font-code text-label-code text-outline">LAGOS GRID • {displayed.length} EVENTS</span>
				</div>
			{/if}
			<div class="flex flex-col items-center gap-3 pt-1">
				<span class="text-label-badge text-on-surface-variant">Showing {viewMode === 'map' ? Math.min(displayed.length, 6) : shown.length} of {displayed.length} events</span>
				{#if viewMode !== 'map' && visible < displayed.length}
					<button type="button" class="h-11 px-6 rounded-full bg-surface-container border border-surface-glass-border text-body-sm font-semibold text-on-surface flex items-center gap-2" onclick={() => (visible += 6)}>
						<RefreshCw class="w-4 h-4" /> Load more events
					</button>
				{/if}
			</div>
				{:else if searchTab === 'users'}
				<div class="flex flex-col gap-4">
					<span class="font-code text-label-badge text-on-surface-variant">{usersFiltered.length} users found</span>
					{#each usersFiltered as person (person.id)}
						<a href="/users/{person.handle}" class="rounded-xl border border-surface-glass-border bg-surface-container p-4 flex items-center gap-3 hover:border-primary/40 transition-colors">
							<Avatar name={person.name} color={person.avatarColor} size="md" />
							<span class="min-w-0 flex-1">
								<span class="flex items-center gap-1.5"><span class="text-body-md font-semibold text-on-surface truncate">{person.name}</span>{#if person.verified}<BadgeCheck class="w-3.5 h-3.5 text-tertiary shrink-0" />{/if}</span>
								<span class="block text-body-sm text-on-surface-variant truncate">@{person.handle} {#if person.city}• {person.city}{/if}</span>
								<span class="block text-body-sm text-on-surface-variant truncate pt-1 line-clamp-1">{person.bio}</span>
							</span>
						</a>
					{:else}
						<EmptyState title="No users found" sub={`No users match “${query}”.`}>
							{#snippet icon()}<Users class="w-6 h-6" />{/snippet}
						</EmptyState>
					{/each}
				</div>
				{:else}
				<div class="flex flex-col gap-4">
					<span class="font-code text-label-badge text-on-surface-variant">{venuesFiltered.length} venues found</span>
					{#each venuesFiltered as v (`${v.venue}::${v.city}`)}
						<div class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden">
							<div class="relative h-20">
								<Cover cover={v.cover} class="w-full h-full" />
								<span class="font-code text-label-badge bg-surface-base/85 backdrop-blur-md border border-surface-glass-border text-on-surface px-2 py-1 rounded absolute top-3 right-3">{v.count} {v.count === 1 ? 'event' : 'events'}</span>
							</div>
							<div class="p-4 flex flex-col gap-1">
								<span class="flex items-center gap-1.5 text-body-sm text-on-surface-variant"><MapPin class="w-4 h-4 text-primary" /> {v.city}</span>
								<span class="font-display text-body-lg font-semibold text-on-surface">{v.venue}</span>
								<span class="text-body-sm text-on-surface-variant">{v.count} upcoming gathering{v.count === 1 ? '' : 's'}</span>
								{#each v.events.slice(0,2) as ev (ev.id)}
									<a href="/events/{ev.slug}" class="text-body-sm text-primary hover:underline truncate pt-1">→ {ev.title}</a>
								{/each}
							</div>
						</div>
					{:else}
						<EmptyState title="No venues found" sub={`No venues match “${query}”.`}>
							{#snippet icon()}<MapPin class="w-6 h-6" />{/snippet}
						</EmptyState>
					{/each}
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
			<div class="flex flex-wrap gap-2">
				{#each [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['weekend', 'Weekend']] as [id, label]}
					<button type="button" class="h-9 px-3 rounded-full border text-label-badge {activeRange === id ? 'border-primary bg-primary/10 text-primary' : 'border-surface-glass-border bg-surface-container-low text-on-surface-variant'}" onclick={() => setDraftRange(id as 'today' | 'tomorrow' | 'weekend')}>{label}</button>
				{/each}
				<button type="button" class="h-9 px-3 rounded-full border border-surface-glass-border bg-surface-container-low text-label-badge text-on-surface-variant" onclick={() => { fFrom = ''; fTo = ''; activeRange = null; }}>Any date</button>
			</div>
			<div class="grid grid-cols-2 gap-2 pt-1">
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
		<div class="flex flex-col gap-space-xs">
			<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Zone &amp; Location</span>
			<select bind:value={fZone} aria-label="Zone and location" class="h-11 px-3 rounded-lg bg-surface-container-low border border-surface-glass-border text-body-md text-on-surface focus:outline-none focus:border-primary/50">
				<option value="">All Nigeria</option>
				{#each NIGERIAN_STATES as state (state)}
					<option value={state}>{state} State</option>
				{/each}
			</select>
		</div>
		<div class="flex flex-col gap-2">
			<span class="text-label-badge text-on-surface-variant uppercase tracking-wider flex items-center justify-between"><span>Maximum ticket value</span><span class="text-on-surface">{formatMoney(fMaxPrice)}</span></span>
			<input type="range" min="0" max="250000" step="5000" bind:value={fMaxPrice} aria-label="Maximum ticket value" class="w-full accent-[#c0c1ff]" />
			<div class="flex justify-between text-label-badge text-on-surface-variant"><span>{formatMoney(0)}</span><span>{formatMoney(250_000)}</span></div>
		</div>
		<label class="flex items-center justify-between bg-surface-container-low border border-surface-glass-border rounded-lg p-3 cursor-pointer">
			<span class="text-body-md text-on-surface">Free events only</span>
			<input type="checkbox" bind:checked={fFree} class="w-4 h-4 accent-[#c0c1ff]" />
		</label>
		<div class="flex flex-col gap-space-xs">
			<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Gate clearance type</span>
			{#each [
				{ key: 'qr', title: 'Instant QR node', sub: 'Offline cryptographically signed' },
				{ key: 'bio', title: 'Biometric fast-pass', sub: 'Hardware terminal gate sync' },
				{ key: 'turnstile', title: 'General turnstile', sub: 'Standard RFID badge or code' }
			] as gate (gate.key)}
				<label class="flex items-start gap-3 rounded-xl bg-surface-container-low border border-surface-glass-border p-3 cursor-pointer">
					<input type="checkbox" class="mt-0.5 w-4 h-4 accent-[#c0c1ff]" checked={gate.key === 'qr' ? fGateQR : gate.key === 'bio' ? fGateBio : fGateTurnstile} onchange={() => {
						if (gate.key === 'qr') fGateQR = !fGateQR;
						else if (gate.key === 'bio') fGateBio = !fGateBio;
						else fGateTurnstile = !fGateTurnstile;
					}} />
					<span><span class="block text-body-sm text-on-surface">{gate.title}</span><span class="block text-label-badge text-on-surface-variant pt-0.5">{gate.sub}</span></span>
				</label>
			{/each}
		</div>
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
