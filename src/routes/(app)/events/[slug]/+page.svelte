<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		ArrowRight,
		BadgeCheck,
		Bell,
		Bookmark,
		BookmarkCheck,
		CalendarClock,
		ChevronDown,
		CircleCheck,
		Flame,
		Lock,
		MapPin,
		Mic,
		Navigation,
		Search,
		Share2,
		ShieldCheck,
		Shirt,
		Clock,
		Users,
		Zap
	} from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import Cover from '$components/Cover.svelte';
	import Stepper from '$components/Stepper.svelte';
	import { bookmarks, follows, toggleIn } from '$lib/state/prefs.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { countdownLabel, fmtDate, fmtDateFull, fmtTime } from '$lib/utils/dates';
	import { formatMoney } from '$lib/utils/money';
	import { currency } from '$lib/state/prefs.svelte';

	let { data } = $props();
	const event = $derived(data.event);

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	let tierId = $state(event.tiers.find((t) => t.capacity - t.sold > 0)?.id ?? event.tiers[0].id);
	let qty = $state(1);
	let openPolicy = $state<number | null>(null);

	const tier = $derived(event.tiers.find((t) => t.id === tierId)!);
	const total = $derived(tier.price * qty);
	const left = $derived(tier.capacity - tier.sold);
	const saved = $derived(bookmarks.value.includes(event.id));
	const following = $derived(follows.value.includes(event.organizer.id));

	/* ── desktop ticket selector extras ── */
	let promoInput = $state('');
	let appliedPromo = $state<string | null>(null);
	let agendaDayIdx = $state(0);

	const base = $derived(tier.price * qty);
	const fee = $derived(base > 0 ? Math.min(Math.round(base * 0.015), 1000) : 0);
	const discount = $derived.by(() => {
		if (!appliedPromo) return 0;
		if (appliedPromo === 'TECHCOMMUNITY') return Math.min(5000, base);
		if (appliedPromo === 'OWL10') return Math.round(base * 0.1);
		return 0;
	});
	const totalPayable = $derived(Math.max(0, base + fee - discount));
	const soldPct = $derived.by(() => {
		const cap = event.tiers.reduce((s, t) => s + t.capacity, 0);
		const sold = event.tiers.reduce((s, t) => s + t.sold, 0);
		return cap > 0 ? Math.round((sold / cap) * 100) : 0;
	});
	const leftAll = $derived(Math.min(...event.tiers.map((t) => t.capacity - t.sold)));
	const recommendedId = $derived(
		[...event.tiers].filter((t) => t.capacity - t.sold > 0).sort((a, b) => b.price - a.price)[0]?.id
	);
	const agendaDays = $derived.by(() => {
		const map = new Map<string, typeof event.agenda>();
		for (const a of event.agenda) {
			const key = new Date(a.start).toDateString();
			map.set(key, [...(map.get(key) ?? []), a]);
		}
		return [...map.values()];
	});
	const sessionId = $derived(`0x${event.id.replace(/[^a-z0-9]/gi, '').slice(0, 5).toUpperCase() || 'P4I5M'}`);

	function applyPromo() {
		const code = promoInput.trim().toUpperCase();
		if (code === 'TECHCOMMUNITY' || code === 'OWL10') {
			appliedPromo = code;
			toast(`Promo ${code} applied`, 'success');
		} else {
			toast('That code isn’t valid', 'error');
		}
	}

	const policyItems = $derived([
		...event.policies.map((p) => ({ icon: CircleCheck, color: 'text-accent-emerald', title: p, body: '' })),
		...event.faqs.map((f) => ({ icon: Lock, color: 'text-tertiary', title: f.q, body: f.a }))
	]);

	function checkout() {
		goto(
			`/checkout?event=${event.slug}&tier=${tierId}&qty=${qty}${appliedPromo ? `&promo=${appliedPromo}` : ''}`
		);
	}

	function share() {
		if (navigator.share) {
			void navigator.share({ title: event.title, url: location.href });
		} else {
			void navigator.clipboard?.writeText(location.href);
			toast('Link copied to clipboard', 'success');
		}
	}
</script>

<svelte:head><title>{event.title} • Owltside</title></svelte:head>

<!-- ── desktop (md+) event detail + ticket selector per the desktop design
     source, themed with Evently Pulse tokens; mobile below unchanged ── -->
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
			<a href="/explore" class="relative hidden lg:flex items-center w-72 h-10">
				<Search class="absolute left-3.5 w-4 h-4 text-outline-variant pointer-events-none" />
				<span class="w-full h-full rounded-full bg-surface-container-low border border-surface-glass-border pl-10 pr-12 flex items-center text-body-md text-outline-variant">Search events, gates, artists…</span>
				<kbd class="{MONO} absolute right-3 text-on-surface-variant border border-surface-glass-border rounded px-1.5 py-0.5">⌘K</kbd>
			</a>
			<a href="/notifications" aria-label="Notifications" class="relative w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors shrink-0">
				<Bell class="w-4.5 h-4.5" />
				<span class="absolute top-2 right-2 w-2 h-2 rounded-full bg-secondary ring-2 ring-surface-base"></span>
			</a>
			<div class="hidden xl:flex flex-col items-end leading-tight shrink-0">
				<span class="font-code text-label-badge text-on-surface">0x7E3…A14</span>
				<span class="font-code text-[10px] tracking-[0.14em] text-accent-emerald">GATE_PASS_ACTIVE</span>
			</div>
			<a href="/profile" aria-label="Your profile" class="shrink-0">
				<Avatar name="Guest Explorer" size="sm" />
			</a>
		</div>
	</header>

	<!-- breadcrumb strip -->
	<div class="border-b border-surface-glass-border bg-surface-container-low/60">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-3 flex flex-wrap items-center justify-between gap-3">
			<nav class="{MONO} text-on-surface-variant flex items-center gap-2 min-w-0" aria-label="Breadcrumb">
				<a href="/explore" class="hover:text-on-surface shrink-0">Events</a>
				<span class="text-outline-variant">/</span>
				<span class="truncate">{event.category}</span>
				<span class="text-outline-variant">/</span>
				<span class="text-on-surface truncate">{event.title}</span>
			</nav>
			<span class="flex items-center gap-4 {MONO} text-on-surface-variant">
				<span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-primary"></span> Session_ID: {sessionId}</span>
				<span class="hidden lg:inline">Protocol V4.2_Verified</span>
			</span>
		</div>
	</div>

	<!-- hero -->
	<div class="relative">
		<Cover cover={event.cover} class="w-full h-[380px] xl:h-[440px]" iconClass="w-24 h-24 text-white/20" />
		<div class="absolute inset-0 bg-gradient-to-t from-surface-base via-surface-base/40 to-transparent"></div>
		<div class="absolute inset-x-0 bottom-0">
			<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pb-8 flex flex-col gap-4">
				<div class="flex items-center gap-2 flex-wrap">
					<span class="{MONO} bg-surface-base/80 backdrop-blur-md border border-surface-glass-border text-on-surface px-2.5 py-1 rounded">{event.category.replace('_', ' ')}</span>
					<span class="{MONO} bg-surface-base/80 backdrop-blur-md border border-surface-glass-border text-on-surface px-2.5 py-1 rounded">{agendaDays.length}-Day Summit</span>
					<span class="{MONO} bg-primary text-on-primary px-2.5 py-1 rounded">{leftAll} VIP Left</span>
					{#if event.organizer.verified}
						<span class="{MONO} bg-surface-base/80 backdrop-blur-md border border-surface-glass-border text-on-surface px-2.5 py-1 rounded flex items-center gap-1.5">
							<BadgeCheck class="w-3.5 h-3.5 text-accent-emerald" /> Verified Organizer
						</span>
					{/if}
				</div>
				<h1 class="font-display text-display-hero text-on-surface max-w-3xl">{event.title}</h1>
				<p class="text-body-lg text-on-surface-variant max-w-2xl line-clamp-2">{event.description}</p>
				<div class="flex flex-wrap items-center justify-between gap-4 pt-1">
					<span class="flex items-center gap-3 min-w-0">
						<Avatar name={event.organizer.name} size="md" />
						<span class="min-w-0">
							<span class="flex items-center gap-1.5 min-w-0">
								<span class="text-body-md font-semibold text-on-surface truncate">{event.organizer.name}</span>
								{#if event.organizer.verified}<BadgeCheck class="w-4 h-4 text-tertiary shrink-0" />{/if}
							</span>
							<span class="block text-body-sm text-on-surface-variant truncate pt-0.5">
								{event.organizer.followers.toLocaleString()} followers • {event.organizer.bio ?? 'Verified host node'}
							</span>
						</span>
					</span>
					<span class="flex items-center gap-2">
						<button
							type="button"
							onclick={() => {
								const added = toggleIn(follows, event.organizer.id);
								toast(added ? `Following ${event.organizer.name}` : `Unfollowed ${event.organizer.name}`, 'info');
							}}
							class="h-10 px-4 rounded-lg text-body-sm font-semibold flex items-center gap-2 transition-colors border
								{following
									? 'bg-primary/15 text-primary border-primary/30'
									: 'bg-surface-container border-surface-glass-border text-on-surface hover:bg-primary hover:text-on-primary hover:border-primary'}"
						>
							{following ? 'Following' : '+ Follow'}
						</button>
						<button type="button" aria-label="Share event" onclick={share} class="w-10 h-10 rounded-lg bg-surface-container border border-surface-glass-border text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors">
							<Share2 class="w-4 h-4" />
						</button>
					</span>
				</div>
			</div>
		</div>
	</div>

	<!-- main grid -->
	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-8 grid lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_420px] gap-6 xl:gap-8 items-start">
		<!-- left column -->
		<div class="flex flex-col gap-6 min-w-0">
			<!-- meta strip -->
			<div class="rounded-xl border border-surface-glass-border bg-surface-container grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-surface-glass-border">
				<div class="flex gap-3 p-5">
					<CalendarClock class="w-4.5 h-4.5 text-primary shrink-0 mt-0.5" />
					<div class="min-w-0">
						<span class="{MONO} text-on-surface-variant block">Date &amp; Duration</span>
						<span class="text-body-md font-semibold text-on-surface block pt-1">{fmtDate(event.startsAt)} – {fmtDate(event.endsAt ?? event.startsAt)}</span>
						<span class="text-body-sm text-on-surface-variant block pt-0.5">{agendaDays.length} Full Days</span>
					</div>
				</div>
				<div class="flex gap-3 p-5">
					<Clock class="w-4.5 h-4.5 text-primary shrink-0 mt-0.5" />
					<div class="min-w-0">
						<span class="{MONO} text-on-surface-variant block">Summit Hours</span>
						<span class="text-body-md font-semibold text-on-surface block pt-1">{fmtTime(event.startsAt)} – {event.endsAt ? fmtTime(event.endsAt) : 'Late'}</span>
						<span class="text-body-sm text-on-surface-variant block pt-0.5">West Africa Time (WAT)</span>
					</div>
				</div>
				<div class="flex gap-3 p-5">
					<MapPin class="w-4.5 h-4.5 text-primary shrink-0 mt-0.5" />
					<div class="min-w-0">
						<span class="{MONO} text-on-surface-variant block">Physical Hub</span>
						<span class="text-body-md font-semibold text-on-surface block pt-1 truncate">{event.venue}</span>
						<span class="text-body-sm text-on-surface-variant block pt-0.5 truncate">{event.city}</span>
					</div>
				</div>
			</div>

			<!-- map -->
			<div class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden">
				<div class="relative h-56 bg-surface-container-low">
					<div
						class="absolute inset-0 opacity-60"
						style="background-image: linear-gradient(rgba(192,193,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(192,193,255,0.07) 1px, transparent 1px), radial-gradient(circle at 65% 35%, rgba(76,215,246,0.12) 0, transparent 45%); background-size: 28px 28px, 28px 28px, 100% 100%;"
					></div>
					<div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
						<span class="absolute -inset-4 rounded-full border border-primary/30 animate-ping"></span>
						<span class="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center"><MapPin class="w-4 h-4" /></span>
					</div>
					<button type="button" onclick={() => toast('Directions open in your maps node', 'info')} class="{MONO} absolute top-3 right-3 bg-surface-base/85 backdrop-blur-md border border-surface-glass-border text-on-surface px-2.5 py-1 rounded hover:text-primary transition-colors flex items-center gap-1.5">
						<Navigation class="w-3.5 h-3.5" /> Get Directions
					</button>
				</div>
				<div class="px-5 py-3 border-t border-surface-glass-border">
					<span class="{MONO} text-on-surface-variant block">Primary Campus</span>
					<span class="text-body-sm text-on-surface block pt-0.5">{event.venue}, Water Corporation Dr, Oniru, {event.city}</span>
				</div>
			</div>

			<!-- about -->
			<section>
				<h2 class="font-display text-headline-lg text-on-surface border-l-2 border-primary pl-3">About The Summit</h2>
				<p class="text-body-md text-on-surface-variant leading-relaxed pt-4">{event.description}</p>
				{#if event.tags.length}
					<p class="text-body-md text-on-surface-variant leading-relaxed pt-3">
						Tracks span {event.tags.join(', ')} — with hands-on labs, founder demos and an
						exclusive nocturnal showcase curated by {event.organizer.name}.
					</p>
				{/if}
			</section>

			<!-- stats -->
			<div class="rounded-xl border border-surface-glass-border bg-surface-container grid grid-cols-2 lg:grid-cols-4 divide-x divide-surface-glass-border">
				{#each [
					[`${event.attendees.toLocaleString()}+`, 'Global Engineers'],
					[`${event.agenda.length}`, 'Tech Sessions'],
					[`${event.speakers.length}`, 'Verified Speakers'],
					[`${agendaDays.length}`, 'Summit Days']
				] as [value, label]}
					<div class="p-5 flex flex-col gap-1">
						<span class="font-display text-headline-lg text-on-surface font-bold">{value}</span>
						<span class="{MONO} text-on-surface-variant">{label}</span>
					</div>
				{/each}
			</div>

			<!-- agenda -->
			{#if agendaDays.length}
				<section class="flex flex-col gap-4">
					<div class="flex items-center justify-between gap-4">
						<h2 class="font-display text-headline-lg text-on-surface border-l-2 border-primary pl-3">Summit Agenda</h2>
						<span class="{MONO} text-on-surface-variant">West Africa Time (GMT+1)</span>
					</div>
					<div class="grid grid-cols-2 xl:grid-cols-3 gap-2">
						{#each agendaDays as day, i (i)}
							<button
								type="button"
								onclick={() => (agendaDayIdx = i)}
								class="rounded-lg border p-3 text-left transition-colors
									{i === agendaDayIdx
										? 'border-surface-glass-border bg-surface-container-high'
										: 'border-transparent bg-surface-container/50 hover:bg-surface-container'}"
							>
								<span class="text-body-sm font-semibold text-on-surface block">Day {i + 1}: {day[0].title.split(':')[0]}</span>
								<span class="{MONO} text-on-surface-variant block pt-1">{fmtDate(day[0].start)}</span>
							</button>
						{/each}
					</div>
					{#each (agendaDays[agendaDayIdx] ?? []) as item, i (item.id)}
						<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-3">
							<div class="flex items-start justify-between gap-4">
								<span class="{MONO} text-tertiary flex items-center gap-1.5 min-w-0">
									<Mic class="w-3.5 h-3.5 shrink-0" />
									<span class="truncate">{['Keynote Opening', 'Technical Deep-Dive', 'Networking & Demo'][i % 3]} • {item.location ?? 'Main Auditorium A'}</span>
								</span>
								<span class="text-right shrink-0">
									<span class="font-code text-body-md font-bold text-on-surface block">{fmtTime(item.start)}</span>
									<span class="{MONO} text-on-surface-variant">75 min block</span>
								</span>
							</div>
							<h3 class="font-display text-headline-md text-on-surface leading-tight">{item.title}</h3>
							{#if event.speakers[i % Math.max(1, event.speakers.length)]}
								<div class="rounded-lg bg-surface-base border border-surface-glass-border px-4 py-2.5 flex items-center gap-3">
									<Avatar name={event.speakers[i % event.speakers.length].name} size="xs" />
									<span class="text-body-sm font-semibold text-on-surface">{event.speakers[i % event.speakers.length].name}</span>
									<span class="font-code text-[11px] tracking-[0.08em] text-on-surface-variant truncate">• {event.speakers[i % event.speakers.length].bio ?? event.speakers[i % event.speakers.length].handle}</span>
								</div>
							{/if}
						</div>
					{/each}
				</section>
			{/if}

			<!-- speakers -->
			{#if event.speakers.length}
				<section class="flex flex-col gap-4">
					<div class="flex items-center justify-between gap-4">
						<h2 class="font-display text-headline-lg text-on-surface border-l-2 border-primary pl-3">Keynote Speakers</h2>
						<button type="button" onclick={() => toast('Full speaker index ships with the agenda node', 'info')} class="text-body-sm text-primary font-semibold hover:underline flex items-center gap-1 shrink-0">
							View All {event.speakers.length + 29} Speakers <ArrowRight class="w-3.5 h-3.5" />
						</button>
					</div>
					<div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
						{#each event.speakers.slice(0, 3) as person, i (person.id)}
							<div class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden">
								<div class="relative">
									<Cover cover={{ from: '#1e293b', to: '#0b1326', icon: 'pen-tool' }} class="w-full h-40 grayscale" iconClass="w-10 h-10 text-white/25" />
									<span class="{MONO} absolute top-3 right-3 bg-surface-base/85 backdrop-blur-md border border-surface-glass-border text-on-surface px-2 py-0.5 rounded">{['Keynote', 'Architect', 'Panelist'][i % 3]}</span>
								</div>
								<div class="p-4 flex flex-col gap-1">
									<span class="text-body-md font-semibold text-on-surface truncate">{person.name}</span>
									<span class="text-body-sm text-on-surface-variant truncate">{person.bio ?? person.city}</span>
									<span class="font-code text-[11px] tracking-[0.08em] text-on-surface-variant pt-1">@{person.handle}</span>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- floorplan -->
			<section class="flex flex-col gap-4">
				<div class="flex items-center justify-between gap-4">
					<h2 class="font-display text-headline-lg text-on-surface border-l-2 border-primary pl-3">Hall A &amp; B Floorplan Guide</h2>
					<span class="{MONO} text-on-surface-variant">Interactive SVG Map</span>
				</div>
				<div class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
					<div class="grid md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
						<div class="rounded-lg border border-surface-glass-border bg-surface-container-low p-4 flex flex-col gap-3">
							<span class="text-body-md font-semibold text-on-surface">HALL A – MAIN STAGE</span>
							<span class="text-body-sm text-on-surface-variant">Keynotes • 1,200 Seats • Live Stream Ops</span>
							<span class="mt-auto flex items-center gap-2 text-body-sm text-on-surface-variant">
								<span class="w-2.5 h-2.5 rounded-full bg-primary"></span> Main Stage Podia
							</span>
						</div>
						<span class="{MONO} text-on-surface-variant hidden md:flex items-center [writing-mode:vertical-rl] rotate-180">Service Corridor</span>
						<div class="rounded-lg border border-surface-glass-border bg-surface-container-low p-4 flex flex-col gap-3">
							<span class="text-body-md font-semibold text-on-surface">HALL B – HACKATHON &amp; LABS</span>
							<span class="text-body-sm text-on-surface-variant">Hardware Sandbox • 40 Developer Pods</span>
							<div class="grid grid-cols-3 gap-2 mt-auto">
								{#each Array(6) as _, i (i)}
									<span class="h-8 rounded border {i === 2 ? 'border-primary/60 bg-primary/15' : 'border-surface-glass-border bg-surface-container'}"></span>
								{/each}
							</div>
						</div>
					</div>
					<div class="flex flex-wrap items-center justify-between gap-3 border-t border-surface-glass-border mt-5 pt-4">
						<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
							<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span> Turnstiles Open: 08:00 AM Daily
						</span>
						<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
							<span class="w-1.5 h-1.5 rounded-full bg-primary"></span> NFC &amp; Dynamic QR Wristband Issued at Gate 1
						</span>
					</div>
				</div>
			</section>

			<!-- policies -->
			<section class="flex flex-col gap-3">
				<h2 class="font-display text-headline-lg text-on-surface border-l-2 border-primary pl-3">Policies &amp; Key Details</h2>
				{#each policyItems as item, i (item.title)}
					<div class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden">
						<button type="button" onclick={() => (openPolicy = openPolicy === i ? null : i)} class="w-full px-5 py-4 flex items-center gap-3 text-left">
							<item.icon class="w-4.5 h-4.5 {item.color} shrink-0" />
							<span class="flex-1 text-body-md font-semibold text-on-surface min-w-0 truncate">{item.title}</span>
							<ChevronDown class="w-4 h-4 text-on-surface-variant transition-transform {openPolicy === i ? 'rotate-180' : ''}" />
						</button>
						{#if openPolicy === i && item.body}
							<p class="px-5 pb-4 text-body-sm text-on-surface-variant leading-relaxed border-t border-surface-glass-border pt-3">{item.body}</p>
						{/if}
					</div>
				{/each}
			</section>
		</div>

		<!-- right column: ticket selector -->
		<aside class="flex flex-col gap-5 min-w-0 lg:sticky lg:top-24">
			<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-col gap-4">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Select Pass</h2>
					<span class="{MONO} text-on-surface-variant flex items-center gap-1.5"><ShieldCheck class="w-3.5 h-3.5 text-accent-emerald" /> HMAC Auth</span>
				</div>

				<div class="flex flex-col gap-2">
					{#each event.tiers as t (t.id)}
						{@const soldOut = t.capacity - t.sold <= 0}
						<button
							type="button"
							disabled={soldOut}
							onclick={() => {
								tierId = t.id;
								qty = 1;
							}}
							class="rounded-lg border p-4 text-left transition-colors
								{tierId === t.id
									? 'border-primary/60 bg-surface-container-high glow-primary'
									: 'border-surface-glass-border bg-surface-container-low hover:border-primary/30'}
								{soldOut ? 'opacity-50 cursor-not-allowed' : ''}"
						>
							<span class="flex items-start gap-3">
								<span class="w-4 h-4 rounded-full border mt-0.5 shrink-0 flex items-center justify-center {tierId === t.id ? 'border-primary' : 'border-outline-variant'}">
									{#if tierId === t.id}<span class="w-2 h-2 rounded-full bg-primary"></span>{/if}
								</span>
								<span class="flex-1 min-w-0">
									<span class="flex items-center gap-2 flex-wrap min-w-0">
										<span class="text-body-md font-semibold text-on-surface truncate">{t.name}</span>
										{#if soldOut}
											<span class="{MONO} bg-secondary-container text-on-secondary-container px-1.5 py-0.5 rounded">Sold Out</span>
										{:else if t.id === recommendedId}
											<span class="{MONO} bg-primary text-on-primary px-1.5 py-0.5 rounded">Recommended</span>
										{/if}
									</span>
									<span class="block text-body-sm text-on-surface-variant pt-0.5">{t.benefits ?? 'Standard gate access'}</span>
								</span>
								<span class="font-code text-body-md font-bold shrink-0 {soldOut ? 'text-on-surface-variant line-through' : 'text-on-surface'}">
									{t.price === 0 ? 'Free' : formatMoney(t.price, currency.value)}
								</span>
							</span>
						</button>
					{/each}
				</div>

				<div class="rounded-lg border border-surface-glass-border bg-surface-container-low px-4 py-3 flex items-center justify-between gap-3">
					<span class="text-body-sm text-on-surface-variant">Pass Quantity</span>
					<span class="flex items-center gap-3">
						<button type="button" aria-label="Fewer passes" class="w-8 h-8 rounded-lg bg-surface-container-high border border-surface-glass-border text-on-surface" onclick={() => (qty = Math.max(1, qty - 1))}>−</button>
						<span class="font-code text-body-md font-bold text-on-surface w-4 text-center">{qty}</span>
						<button type="button" aria-label="More passes" class="w-8 h-8 rounded-lg bg-surface-container-high border border-surface-glass-border text-on-surface" onclick={() => (qty = Math.min(6, qty + 1))}>+</button>
					</span>
				</div>

				{#if appliedPromo}
					<div class="flex flex-col gap-2">
						<span class="text-body-sm text-on-surface-variant">Have a community promo code?</span>
						<div class="flex items-center justify-between gap-3">
							<span class="{MONO} text-accent-emerald flex items-center gap-1.5"><CircleCheck class="w-3.5 h-3.5" /> {appliedPromo}_Applied</span>
							<span class="font-code text-body-sm font-bold text-accent-emerald">-{formatMoney(discount, currency.value)}</span>
						</div>
					</div>
				{:else}
					<div class="flex items-center gap-2">
						<input bind:value={promoInput} placeholder="PROMO CODE" class="flex-1 h-10 px-3 rounded-lg bg-surface-base border border-surface-glass-border font-code text-label-code text-on-surface uppercase placeholder:text-outline-variant focus:outline-none focus:border-primary/50" />
						<button type="button" onclick={applyPromo} class="{MONO} h-10 px-3 rounded-lg bg-surface-container-high border border-surface-glass-border text-on-surface hover:bg-primary hover:text-on-primary hover:border-primary transition-colors">Apply</button>
					</div>
				{/if}

				<div class="flex flex-col gap-2 border-t border-surface-glass-border pt-4">
					<div class="flex items-center justify-between gap-3">
						<span class="text-body-sm text-on-surface-variant">{qty}x {tier.name}</span>
						<span class="font-code text-body-sm text-on-surface">{formatMoney(base, currency.value)}</span>
					</div>
					<div class="flex items-center justify-between gap-3">
						<span class="text-body-sm text-on-surface-variant">Network Protocol &amp; VAT (2.5%)</span>
						<span class="font-code text-body-sm text-on-surface">{formatMoney(fee, currency.value)}</span>
					</div>
					{#if discount > 0}
						<div class="flex items-center justify-between gap-3">
							<span class="text-body-sm text-on-surface-variant">Partner Pass Incentive</span>
							<span class="font-code text-body-sm font-bold text-accent-emerald">-{formatMoney(discount, currency.value)}</span>
						</div>
					{/if}
					<div class="flex items-center justify-between gap-3 border-t border-surface-glass-border pt-3">
						<span class="text-body-md font-semibold text-on-surface">Total Payable</span>
						<span class="font-display text-headline-md font-bold text-on-surface">{formatMoney(totalPayable, currency.value)}</span>
					</div>
				</div>

				<button type="button" onclick={checkout} class="w-full h-12 rounded-lg bg-primary text-on-primary font-semibold flex items-center justify-center gap-2 hover:bg-primary-container transition-colors glow-primary">
					<span class="{MONO}">Proceed to Checkout • {formatMoney(totalPayable, currency.value)}</span>
					<ArrowRight class="w-4 h-4" />
				</button>
				<span class="text-body-sm text-on-surface-variant text-center">Zero risk. Tickets are transferable &amp; verifiable in real-time.</span>

				<div class="flex flex-col gap-2 border-t border-surface-glass-border pt-4">
					{#each ([
						[Lock, '256-Bit SSL Encrypted Checkout Session'],
						[ShieldCheck, 'Dynamic HMAC Ticket Pass with Anti-Clone'],
						[BadgeCheck, 'Paystack & Flutterwave Verified Payment Rails']
					] as [any, string][]) as [Icon, label]}
						<span class="flex items-center gap-2 text-body-sm text-on-surface-variant">
							<Icon class="w-3.5 h-3.5 text-accent-emerald shrink-0" /> {label}
						</span>
					{/each}
				</div>
			</div>

			<div class="rounded-xl border border-surface-glass-border bg-surface-container px-5 py-4 flex items-center gap-3">
				<span class="flex -space-x-2 shrink-0">
					<Avatar name="Ada Ugo" size="xs" />
					<Avatar name="Bola Ken" size="xs" />
					<span class="w-7 h-7 rounded-full bg-surface-container-high border-2 border-surface-container font-code text-[10px] text-on-surface-variant flex items-center justify-center">+85</span>
				</span>
				<span class="flex-1 text-body-sm text-on-surface min-w-0 truncate">84 developers joined today</span>
				<span class="{MONO} text-on-surface-variant shrink-0">{soldPct}% Cap</span>
			</div>
		</aside>
	</div>

	<!-- footer -->
	<footer class="mt-10 border-t border-surface-glass-border">
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

<header class="fixed top-0 inset-x-0 z-50 bg-surface/80 backdrop-blur-xl pt-safe md:left-20">
	<div class="h-16 px-gutter md:max-w-5xl md:mx-auto flex items-center justify-between gap-space-sm">
		<div class="flex items-center gap-space-xs">
			<button aria-label="Go back" onclick={() => history.back()} class="w-11 h-11 -ml-2 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
				<ArrowRight class="w-6 h-6 rotate-180" />
			</button>
			<div class="flex items-center gap-2 min-w-0">
				<span class="font-display text-headline-md text-on-surface font-semibold tracking-tight">OWLTSIDE</span>
				<span class="text-outline-variant">/</span>
				<span class="text-body-md text-on-surface-variant truncate">Event Detail</span>
			</div>
		</div>
		<span class="inline-flex items-center gap-1.5 bg-surface-container px-2.5 py-1 rounded-full border border-surface-glass-border">
			<span class="w-2 h-2 rounded-full bg-accent-emerald animate-pulse"></span>
			<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Online</span>
		</span>
	</div>
</header>

<main class="flex flex-col relative w-full pt-16 pb-safe bg-surface min-h-dvh">
	<div class="flex flex-col w-full pb-28 md:pb-32 md:max-w-5xl md:mx-auto">
		<!-- hero -->
		<div class="relative w-full aspect-[16/10] overflow-hidden bg-surface-container-low shadow-lg">
			<Cover cover={event.cover} class="w-full h-full" iconClass="w-20 h-20 text-white/25" />
			<div class="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-black/30"></div>
			<div class="absolute top-4 right-4 flex items-center gap-space-xs z-10">
				<button aria-label="Bookmark" onclick={() => toggleIn(bookmarks, event.id)} class="w-10 h-10 rounded-full bg-surface-raised/80 backdrop-blur-md text-on-surface flex items-center justify-center shadow-md active:scale-90 transition-transform">
					{#if saved}<BookmarkCheck class="w-5 h-5 text-primary" />{:else}<Bookmark class="w-5 h-5" />{/if}
				</button>
				<button aria-label="Share" onclick={share} class="w-10 h-10 rounded-full bg-surface-raised/80 backdrop-blur-md text-on-surface flex items-center justify-center shadow-md active:scale-90 transition-transform">
					<Share2 class="w-5 h-5" />
				</button>
			</div>
			<div class="absolute bottom-4 left-4 right-4 flex flex-wrap items-center gap-space-xs">
				<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface text-label-badge border border-outline-variant/40 shadow-sm">
					<CalendarClock class="w-3.5 h-3.5 text-on-surface-variant" />
					{fmtDateFull(event.startsAt)} • {countdownLabel(event.startsAt)}
				</span>
				<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container text-on-surface text-label-badge border border-outline-variant/40 shadow-sm">
					<Zap class="w-3.5 h-3.5 text-on-surface-variant" />{event.tags[0] ?? event.category}
				</span>
				{#if left < 50}
					<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-highest text-on-surface text-label-badge border border-outline-variant/40 shadow-sm">
						<Flame class="w-3.5 h-3.5 text-error" />Selling Fast • {left} Left
					</span>
				{/if}
			</div>
		</div>

		<div class="px-gutter pt-space-md flex flex-col gap-space-lg">
			<!-- title -->
			<div class="flex flex-col gap-space-xs">
				<h1 class="font-display text-headline-lg-mobile md:text-headline-lg text-on-surface tracking-tight">{event.title}</h1>
				<p class="text-body-md text-on-surface-variant leading-relaxed">{event.description}</p>
			</div>

			<!-- host -->
			<div class="flex items-center justify-between p-space-md bg-surface-container rounded-xl shadow-sm">
				<a href="/users/{event.organizer.handle}" class="flex items-center gap-space-sm min-w-0">
					<div class="relative flex-shrink-0">
						<Avatar name={event.organizer.name} color={event.organizer.avatarColor} size="lg" />
						{#if event.organizer.verified}
							<span class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center text-on-primary">
								<BadgeCheck class="w-3 h-3" />
							</span>
						{/if}
					</div>
					<div class="flex flex-col min-w-0">
						<span class="text-label-badge text-primary-fixed-dim uppercase tracking-wider">Host & Curator</span>
						<span class="font-display text-headline-md text-on-surface truncate">{event.organizer.name}</span>
						<span class="text-body-sm text-on-surface-variant truncate">{event.organizer.followers.toLocaleString()} followers</span>
					</div>
				</a>
				<button
					class="flex-shrink-0 px-4 py-2 rounded-full text-body-sm active:scale-95 transition-all shadow-sm {following ? 'bg-primary text-on-primary' : 'bg-surface-bright text-on-surface'}"
					onclick={() => {
						const added = toggleIn(follows, event.organizer.id);
						toast(added ? `Following ${event.organizer.name}` : 'Unfollowed', 'info');
					}}
				>
					{following ? 'Following' : 'Follow'}
				</button>
			</div>

			<!-- venue -->
			<div class="p-space-md bg-surface-container rounded-xl flex flex-col gap-space-md shadow-sm">
				<div class="flex items-start justify-between gap-space-sm">
					<div class="flex items-start gap-space-xs">
						<div class="w-9 h-9 rounded-full bg-tertiary-container flex items-center justify-center text-on-tertiary-container flex-shrink-0 mt-0.5">
							<MapPin class="w-4.5 h-4.5" />
						</div>
						<div class="flex flex-col">
							<span class="font-display text-headline-md text-on-surface">{event.venue}</span>
							<span class="text-body-sm text-on-surface-variant">{event.city}</span>
						</div>
					</div>
					<button class="px-3 py-1.5 rounded-full bg-surface-container-highest text-tertiary text-label-badge flex items-center gap-1 flex-shrink-0 active:scale-95" onclick={() => toast('Map view lives in Explore', 'info')}>
						<span>Map</span><Navigation class="w-3.5 h-3.5" />
					</button>
				</div>
				<div class="relative w-full h-36 rounded-lg overflow-hidden shadow-inner" style="background: linear-gradient(160deg, #171f33, #0b1120 75%);">
					<div class="absolute inset-0 opacity-30" style="background-image: linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px); background-size: 28px 28px;"></div>
					<span class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-primary ring-4 ring-primary/25"></span>
					<div class="absolute bottom-2 left-2 right-2 px-3 py-1.5 rounded-lg bg-surface-base/85 backdrop-blur-md flex items-center justify-between text-on-surface shadow-md">
						<span class="flex items-center gap-1.5 min-w-0">
							<span class="w-2 h-2 rounded-full bg-accent-emerald animate-ping"></span>
							<span class="font-code text-label-code truncate">{event.venue}</span>
						</span>
						<span class="text-body-sm text-tertiary underline cursor-pointer">Indoor Nav</span>
					</div>
				</div>
			</div>

			<!-- agenda -->
			{#if event.agenda.length}
				<div class="flex flex-col gap-space-sm">
					<div class="flex items-center justify-between">
						<h2 class="font-display text-headline-md text-on-surface">Event Agenda</h2>
						<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">{event.agenda.length} sessions</span>
					</div>
					<div class="flex flex-col gap-space-xs mt-1">
						{#each event.agenda as item (item.id)}
							<div class="p-space-md bg-surface-container rounded-xl flex flex-col gap-space-xs shadow-sm">
								<div class="flex items-center justify-between">
									<span class="font-code text-label-code text-tertiary flex items-center gap-1">
										<Clock class="w-4 h-4" /> {fmtTime(item.start)}
									</span>
									{#if item.location}
										<span class="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant text-label-badge">{item.location}</span>
									{/if}
								</div>
								<span class="font-display text-headline-md text-on-surface">{item.title}</span>
								{#each item.speakerIds ?? [] as sid}
									{@const sp = event.speakers.find((s) => s.id === sid)}
									{#if sp}
										<div class="flex items-center gap-space-sm pt-space-xs mt-space-xs bg-surface-container-low p-2 rounded-lg">
											<Avatar name={sp.name} color={sp.avatarColor} size="md" />
											<div class="flex flex-col min-w-0">
												<span class="text-body-md text-on-surface font-semibold truncate">{sp.name}</span>
												<span class="text-body-sm text-primary-fixed-dim truncate">{sp.bio}</span>
											</div>
										</div>
									{/if}
								{/each}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- tiers -->
			<div class="flex flex-col gap-space-sm">
				<div class="flex items-center justify-between">
					<h2 class="font-display text-headline-md text-on-surface">Select Tickets</h2>
					<span class="text-label-badge text-accent-emerald uppercase tracking-wider flex items-center gap-1">
						<Lock class="w-3.5 h-3.5" /> Instant Mint
					</span>
				</div>
				{#each event.tiers as t (t.id)}
					{@const soldOut = t.capacity - t.sold <= 0}
					{@const selected = t.id === tierId}
					{#if soldOut}
						<div class="p-space-md bg-surface-container-low/60 rounded-xl flex items-center justify-between opacity-50 cursor-not-allowed">
							<div class="flex flex-col">
								<div class="flex items-center gap-space-xs">
									<span class="text-body-lg text-on-surface font-semibold">{t.name}</span>
									<span class="px-2 py-0.5 rounded-full bg-surface-variant text-on-surface-variant text-label-badge uppercase">Sold Out</span>
								</div>
								{#if t.benefits}<span class="text-body-sm text-on-surface-variant">{t.benefits}</span>{/if}
							</div>
							<span class="font-code text-label-code text-on-surface-variant line-through">{formatMoney(t.price, currency.value)}</span>
						</div>
					{:else}
						<button
							class="p-space-md rounded-xl flex flex-col gap-space-xs cursor-pointer shadow-sm active:scale-[0.99] transition-all text-left w-full
								{selected ? 'bg-surface-container-high border border-outline-variant' : 'bg-surface-container'}"
							onclick={() => (tierId = t.id)}
						>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-space-xs">
									<span class="text-body-lg text-on-surface font-semibold">{t.name}</span>
									<span class="px-2 py-0.5 rounded-full bg-surface-container-highest text-primary text-label-badge">Available</span>
								</div>
								<span class="font-code text-label-code text-on-surface font-semibold">{formatMoney(t.price, currency.value)}</span>
							</div>
							{#if t.benefits}<p class="text-body-sm text-on-surface-variant">{t.benefits}</p>{/if}
							<div class="flex items-center justify-between pt-1">
								<span class="text-label-badge text-tertiary">{t.capacity - t.sold} left</span>
								{#if selected}
									<div class="flex items-center gap-2" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
										<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Tickets</span>
										<Stepper value={qty} min={1} max={Math.min(6, t.capacity - t.sold)} onchange={(v) => (qty = v)} />
									</div>
								{:else}
									<span class="w-5 h-5 rounded-full border border-outline"></span>
								{/if}
							</div>
						</button>
					{/if}
				{/each}
			</div>

			<!-- policies accordion -->
			{#if policyItems.length}
				<div class="flex flex-col gap-space-xs">
					<h2 class="font-display text-headline-md text-on-surface">Pass Policies & Access Perks</h2>
					{#each policyItems as item, i (i)}
						<div class="bg-surface-container rounded-xl overflow-hidden shadow-sm">
							<button class="w-full p-space-md flex items-center justify-between text-left" onclick={() => (openPolicy = openPolicy === i ? null : i)}>
								<span class="flex items-center gap-space-xs text-on-surface">
									<item.icon class="w-5 h-5 {item.color}" />
									<span class="text-body-md font-medium">{item.title}</span>
								</span>
								<ChevronDown class="w-5 h-5 text-on-surface-variant transition-transform {openPolicy === i ? 'rotate-180' : ''}" />
							</button>
							{#if openPolicy === i}
								<p class="px-space-md pb-space-md text-on-surface-variant text-body-sm">
									{item.body || 'Applies to every pass on this event. Gate staff enforce politely but firmly.'}
								</p>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- sticky dock -->
		<div class="fixed bottom-0 left-0 right-0 z-40 bg-surface-container-high/90 backdrop-blur-2xl p-space-md shadow-2xl md:left-20">
			<div class="max-w-md mx-auto flex items-center justify-between gap-space-md">
				<div class="flex flex-col">
					<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Total Amount</span>
					<div class="flex items-baseline gap-1">
						<span class="font-display text-headline-lg-mobile text-on-surface font-bold tracking-tight">{tier.price === 0 ? 'Free' : formatMoney(total, currency.value)}</span>
						<span class="text-body-sm text-on-surface-variant font-medium">({qty} {tier.name})</span>
					</div>
				</div>
				<button class="h-12 px-6 rounded-full bg-primary-fixed text-surface-base font-display text-headline-md font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md hover:bg-white" onclick={checkout}>
					<span>Select & Checkout</span>
					<ArrowRight class="w-4.5 h-4.5" />
				</button>
			</div>
		</div>
	</div>
</main>
</div>
