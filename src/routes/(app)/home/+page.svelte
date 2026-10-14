<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		BadgeCheck,
		Bell,
		MessageSquare,
		ChevronDown,
		Flame,
		History,
				MapPin,
		QrCode,
		Navigation,
		Sparkles,
		TrendingUp,
		WifiOff,
		X,
		Zap
	} from '@lucide/svelte';
	import Carousel from '$components/Carousel.svelte';
	import Chip from '$components/Chip.svelte';
	import CurrencyPill from '$components/CurrencyPill.svelte';
	import EventCard from '$components/EventCard.svelte';
	import EventRow from '$components/EventRow.svelte';
	import HeroCard from '$components/HeroCard.svelte';
	import SearchBar from '$components/SearchBar.svelte';
	import SectionHeader from '$components/SectionHeader.svelte';
	import Avatar from '$components/Avatar.svelte';
	import QrPass from '$components/QrPass.svelte';
	import DesktopHomeFeed from '$components/DesktopHomeFeed.svelte';
	import { categories } from '$components/iconMap';
	import { useQuery } from '$lib/state/query.svelte';
	import { follows, toggleIn } from '$lib/state/prefs.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import type { CategoryId, EventItem, Ticket } from '$lib/types';

	let { data } = $props();

	const events = useQuery<EventItem[]>(
		'events:all',
		async () => {
			const res = await fetch('/api/events');
			return res.json();
		},
		{ staleTime: 20_000 },
		data.events
	);

	const list = $derived(events.data ?? []);
	const featured = $derived(list.find((e) => e.featured) ?? list[0]);
	const trending = $derived(
		list
			.filter((e) => e.trendingRank !== undefined)
			.sort((a, b) => (a.trendingRank ?? 99) - (b.trendingRank ?? 99))
			.slice(0, 3)
	);
	const curated = $derived(
		[...list].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)).slice(0, 4)
	);
	const verifiedOrganizers = $derived.by(() => {
		const map = new Map<string, { id: string; handle: string; name: string; avatarColor: string; events: number; attended: number }>();
		for (const event of list) {
			if (!event.organizer.verified) continue;
			const current = map.get(event.organizer.id) ?? {
				id: event.organizer.id,
				handle: event.organizer.handle,
				name: event.organizer.name,
				avatarColor: event.organizer.avatarColor,
				events: 0,
				attended: 0
			};
			current.events += 1;
			current.attended += event.attendees;
			map.set(event.organizer.id, current);
		}
		return [...map.values()].sort((a, b) => b.events - a.events).slice(0, 3);
	});
	const activeTicket = $derived((data.tickets as Ticket[] | undefined)?.find((ticket) => ticket.status === 'valid'));
	const following = (id: string) => follows.value.includes(id);
	const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

	let category = $state<CategoryId>('all');
	const rail = $derived(
		[...list]
			.filter((event) => category === 'all' || event.category === category)
			.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
			.slice(0, 12)
	);

	let search = $state('');
	let showPwaBanner = $state(true);
	let installPrompt = $state<any>(null);

	$effect(() => {
		const handler = (e: Event) => {
			e.preventDefault();
			installPrompt = e;
		};
		window.addEventListener('beforeinstallprompt', handler);
		return () => window.removeEventListener('beforeinstallprompt', handler);
	});

	async function install() {
		if (installPrompt) {
			installPrompt.prompt();
			installPrompt = null;
		} else {
			toast('Use your browser menu → “Install app”', 'info');
		}
	}
</script>

<svelte:head><title>Home • Owltside</title></svelte:head>

<!-- desktop (md+) composition — see DesktopHomeFeed; mobile feed below is unchanged -->
<DesktopHomeFeed events={list} unread={data.unread} initialTickets={data.tickets} />

<div class="md:hidden">
<header class="fixed top-0 inset-x-0 z-50 bg-surface/80 backdrop-blur-xl pt-safe md:left-20">
	<div class="h-16 px-gutter md:max-w-5xl md:mx-auto flex items-center justify-between gap-space-sm">
		<a href="/home" aria-label="Owltside home" class="flex items-center gap-space-sm">
			<img src="/logo.png" alt="Owltside logo" class="h-5 w-auto object-contain" />
			<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Home</span>
		</a>
		<div class="flex items-center gap-space-xs">
			<a href="/notifications" aria-label="Notifications" class="relative w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition-colors">
				<Bell class="w-5 h-5" />
				{#if data.unread > 0}
					<span class="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-secondary ring-2 ring-surface"></span>
				{/if}
			</a>
			<a href="/inbox" aria-label="Inbox" class="relative w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition-colors">
				<MessageSquare class="w-5 h-5" />
			</a>
			<a href="/profile" aria-label="Your profile" class="w-11 h-11 flex items-center justify-center">
				<Avatar name={page.data.session?.name ?? 'Guest'} size="sm" />
			</a>
		</div>
	</div>
</header>

<main class="flex flex-col relative w-full pt-mobile-header pb-28 md:pb-16 bg-surface min-h-dvh">
	<div class="flex flex-col w-full px-margin md:max-w-5xl md:mx-auto pb-space-xl gap-space-lg">
		<!-- location + currency + search -->
		<div class="flex flex-col gap-space-sm pt-space-xs">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-space-xs">
					<Navigation class="w-5 h-5 text-primary" fill="currentColor" fill-opacity="0.2" />
					<button class="flex items-center gap-1 text-on-surface text-body-sm hover:text-primary transition-colors" onclick={() => toast('Location picker ships with the map view', 'info')}>
						<span class="font-semibold">Lagos</span>
						<ChevronDown class="w-4 h-4 text-on-surface-variant" />
					</button>
				</div>
				<CurrencyPill />
			</div>
			<SearchBar
				value={search}
				oninput={(v) => (search = v)}
				onFilter={() => goto('/explore')}
			/>
			{#if search}
				<button class="text-body-sm text-primary text-left hover:underline" onclick={() => goto(`/explore?q=${encodeURIComponent(search)}`)}>
					See results for “{search}” →
				</button>
			{/if}
		</div>

		<!-- PWA banner -->
		{#if showPwaBanner}
			<div class="relative overflow-hidden rounded-xl bg-surface-container-high p-space-md shadow-md flex items-center justify-between gap-space-sm">
				<div class="flex items-center gap-space-sm min-w-0">
					<div class="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
						<WifiOff class="w-5 h-5" />
					</div>
					<div class="flex flex-col min-w-0">
						<span class="font-display text-headline-md text-on-surface truncate text-[14px] leading-tight">Fast Pass & Offline Wallet</span>
						<span class="text-body-sm text-on-surface-variant truncate">Instant gate entry with offline HMAC tokens</span>
					</div>
				</div>
				<div class="flex items-center gap-1.5 shrink-0">
					<button class="px-3 h-8 rounded-full bg-primary text-on-primary text-label-badge font-semibold active:scale-95 transition-all shadow-sm flex items-center gap-1" onclick={install}>
						<span>Install</span>
						<Zap class="w-3.5 h-3.5" />
					</button>
					<button aria-label="Dismiss banner" class="w-7 h-7 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface" onclick={() => (showPwaBanner = false)}>
						<X class="w-4 h-4" />
					</button>
				</div>
			</div>
		{/if}

		<!-- category chips -->
		<div class="flex flex-col gap-space-xs">
			<div class="flex items-center justify-between">
				<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Explore Channels</span>

			</div>
			<div class="flex gap-2 overflow-x-auto pb-1 pt-1 -mx-margin px-margin scrollbar-none">
				{#each categories as cat (cat.id)}
					<Chip label={cat.label} icon={cat.icon} active={category === cat.id} onclick={() => (category = cat.id as CategoryId)} />
				{/each}
			</div>
		</div>

		<!-- featured hero -->
		{#if featured && (category === 'all' || featured.category === category)}
			<div class="flex flex-col gap-space-xs">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1.5">
						<span class="w-2 h-2 rounded-full bg-accent-amber animate-pulse"></span>
						<span class="font-display text-headline-md text-on-surface">Curated Spotlight</span>
					</div>
					<span class="text-label-badge text-tertiary">Official Partner</span>
				</div>
				<HeroCard event={featured} />
			</div>
		{/if}

		<!-- near you carousel -->
		<div class="flex flex-col gap-space-sm">
			<SectionHeader
				title="Happening Near You"
				sub="Handpicked sessions in your geo-zone"
				actionLabel="View all"
				onAction={() => goto('/explore')}
			>
				{#snippet icon()}<MapPin class="w-4.5 h-4.5" />{/snippet}
			</SectionHeader>
			<Carousel items={rail}>
				{#snippet children(event: EventItem)}
					<EventCard {event} />
				{/snippet}
			</Carousel>
		</div>

		<!-- trending -->
		{#if trending.length && category === 'all'}
			<div class="flex flex-col gap-space-sm">
				<SectionHeader title="Trending This Week" sub="Top velocity across Lagos">
					{#snippet icon()}<TrendingUp class="w-4.5 h-4.5" fill="currentColor" fill-opacity="0.25" />{/snippet}
				</SectionHeader>
				<div class="flex flex-col gap-space-xs">
					{#each trending as event, i (event.id)}
						<EventRow {event} rank={i + 1} />
					{/each}
				</div>
			</div>
		{/if}

		<!-- desktop curated feed parity -->
		{#if curated.length}
			<div class="flex flex-col gap-space-sm">
				<SectionHeader title="Curated For You" sub="A handpicked shortlist from the live feed">
					{#snippet icon()}<Sparkles class="w-4.5 h-4.5" />{/snippet}
				</SectionHeader>
				<div class="flex flex-col gap-space-xs">
					{#each curated as event (event.id)}
						<EventRow {event} />
					{/each}
				</div>
			</div>
		{/if}

		<!-- desktop active pass parity -->
		<div class="rounded-2xl border border-surface-glass-border bg-surface-container p-space-md flex flex-col gap-space-sm">
			<div class="flex items-center justify-between gap-2">
				<span class="font-display text-headline-md text-on-surface">Your Active Pass</span>
				<span class="text-label-badge uppercase tracking-wider {activeTicket ? 'text-accent-emerald' : 'text-on-surface-variant'}">{activeTicket ? 'Passport OK' : 'No active pass'}</span>
			</div>
			{#if activeTicket}
				<p class="text-body-sm text-on-surface-variant">{activeTicket.eventTitle} · {activeTicket.tierName}</p>
				<div class="flex justify-center py-2"><QrPass code={activeTicket.code} /></div>
				<div class="flex items-center justify-between gap-2 rounded-xl bg-surface-container-low px-3 py-2.5">
					<span class="text-label-badge text-on-surface-variant">Gate pass code</span>
					<span class="font-code text-label-code text-on-surface">{activeTicket.code}</span>
				</div>
				<a href="/tickets/{activeTicket.id}" class="h-11 rounded-full bg-primary text-on-primary text-body-sm font-semibold flex items-center justify-center gap-2">
					<QrCode class="w-4 h-4" /> Open live dynamic QR
				</a>
			{:else}
				<p class="text-body-sm text-on-surface-variant">Reserve a seat and your rotating, offline-ready HMAC pass will appear here.</p>
				<a href="/explore" class="h-11 rounded-full bg-surface-container-high text-on-surface text-body-sm font-semibold flex items-center justify-center">Browse events</a>
			{/if}
		</div>

		<!-- desktop verified-organizer follow controls parity -->
		{#if verifiedOrganizers.length}
			<div class="rounded-2xl border border-surface-glass-border bg-surface-container p-space-md">
				<div class="flex items-center justify-between gap-2">
					<h2 class="font-display text-headline-md text-on-surface">Verified Organizers</h2>
					<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Lagos</span>
				</div>
				<div class="flex flex-col gap-3 pt-space-sm">
					{#each verifiedOrganizers as org (org.id)}
						<div class="flex items-center gap-3">
							<a href="/users/{org.handle}" aria-label="View {org.name}'s profile" class="flex flex-1 min-w-0 items-center gap-3 rounded-lg hover:bg-surface-container-high/60 transition-colors">
								<Avatar name={org.name} color={org.avatarColor} size="sm" />
								<span class="flex-1 min-w-0">
									<span class="flex items-center gap-1 text-body-sm font-semibold text-on-surface truncate">{org.name}<BadgeCheck class="w-3.5 h-3.5 text-tertiary shrink-0" /></span>
									<span class="block text-label-badge text-on-surface-variant">{org.events} Events · {compact(org.attended)} Attended</span>
								</span>
							</a>
							<button
								aria-pressed={following(org.id)}
								onclick={() => {
									const added = toggleIn(follows, org.id);
									toast(added ? `Following ${org.name}` : `Unfollowed ${org.name}`, 'info');
								}}
								class="h-9 px-3 rounded-full border text-label-badge font-semibold shrink-0 {following(org.id) ? 'border-primary/30 bg-primary/10 text-primary' : 'border-surface-glass-border bg-surface-container-high text-on-surface'}"
							>{following(org.id) ? 'Following' : 'Follow'}</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- gate teaser -->
		<div class="rounded-2xl bg-surface-container-low p-space-md flex flex-col gap-space-sm shadow-inner">
			<div class="flex items-center gap-space-sm">
				<div class="w-9 h-9 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center shrink-0">
					<QrCode class="w-5 h-5" />
				</div>
				<div class="flex flex-col min-w-0">
					<span class="font-display text-headline-md text-on-surface text-[15px]">At a venue door right now?</span>
					<span class="text-body-sm text-on-surface-variant">Tap your offline pass for frictionless zero-wait entry</span>
				</div>
			</div>
			<div class="flex items-center gap-2 pt-1">
				<a class="flex-1 h-10 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body-sm font-semibold flex items-center justify-center gap-1.5 transition-colors" href="/tickets">
					<Sparkles class="w-4 h-4" />
					<span>Open Ticket Wallet</span>
				</a>
				<a href="/tickets" aria-label="Check-in history" class="h-10 px-4 rounded-full bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors">
					<History class="w-4 h-4" />
				</a>
			</div>
		</div>

		{#if list.some((e) => e.live)}
			<div class="flex items-center gap-2 text-body-sm text-on-surface-variant">
				<Flame class="w-4 h-4 text-secondary" />
				<span>Underground Warehouse 04 is live right now — 38 passes left.</span>
			</div>
		{/if}
	</div>
</main>
</div>
