<script lang="ts">
	import FollowButton from '$components/FollowButton.svelte';
	/**
	 * Desktop (md+) composition of the home feed, adapted from the supplied
	 * desktop design source. All colours come from the Evently Pulse theme
	 * tokens in `src/app.css` (indigo primary, coral secondary, cyan tertiary,
	 * deep-slate surfaces) — the layout is desktop-only; mobile keeps the
	 * original phone-first feed.
	 */
	import { goto } from '$app/navigation';
	import {
		ArrowRight,
		ArrowUpRight,
		BadgeCheck,
		Bell,
		Bookmark,
		BookmarkCheck,
		CalendarDays,
		ChevronLeft,
		ChevronRight,
		MapPin,
		Radio,
		Search,
		ShieldCheck
	} from '@lucide/svelte';
	import Avatar from './Avatar.svelte';
	import Carousel from './Carousel.svelte';
	import EventCard from './EventCard.svelte';
	import Cover from './Cover.svelte';
	import { categories } from './iconMap';
	import { bookmarks, currency, toggleIn } from '$lib/state/prefs.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { fmtDate, fmtTime, fmtDateFull } from '$lib/utils/dates';
	import { formatMoney } from '$lib/utils/money';
	import type { CategoryId, EventItem } from '$lib/types';

	let { events }: { events: EventItem[] } = $props();

	const WRAP = 'mx-auto w-full max-w-[1400px] px-6 xl:px-10';
	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	/* ── feed state ─────────────────────────────────────────────────────── */
	let category = $state<CategoryId>('all');
	let curatedPage = $state(0);

	const rail = $derived(
		[...events]
			.filter((event) => category === 'all' || event.category === category)
			.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
			.slice(0, 12)
	);
	const featured = $derived(rail.find((e) => e.featured) ?? rail[0]);
	const trending = $derived(
		rail
			.filter((e) => e.trendingRank !== undefined)
			.sort((a, b) => (a.trendingRank ?? 99) - (b.trendingRank ?? 99))
			.slice(0, 3)
	);
	const curated = $derived(
		[...rail].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)).slice(0, 9)
	);
	const curatedSlice = $derived(curated.slice(curatedPage * 3, curatedPage * 3 + 3));
	const curatedPages = $derived(Math.max(1, Math.ceil(curated.length / 3)));

	const organizers = $derived(() => {
		const map = new Map<string, { name: string; handle: string; avatarColor: string; avatarUrl?: string | null; events: number; attended: number; id: string }>();
		for (const e of events) {
			if (!e.organizer.verified) continue;
			const cur = map.get(e.organizer.id) ?? {
				id: e.organizer.id,
				handle: e.organizer.handle,
				name: e.organizer.name,
				avatarColor: e.organizer.avatarColor,
				avatarUrl: e.organizer.avatarUrl,
				events: 0,
				attended: 0
			};
			cur.events += 1;
			cur.attended += e.attendees;
			map.set(e.organizer.id, cur);
		}
		return [...map.values()].sort((a, b) => b.events - a.events).slice(0, 3);
	});

	/* ── helpers ────────────────────────────────────────────────────────── */
	const minPrice = (e: EventItem) => Math.min(...e.tiers.map((t) => t.price));
	const spotsLeft = (e: EventItem) => Math.min(...e.tiers.map((t) => t.capacity - t.sold));
	const sellingFast = (e: EventItem) =>
		e.tiers.some((t) => t.capacity > 0 && (t.capacity - t.sold) / t.capacity < 0.15);
	const catLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? id;
	const dayBadge = (iso: string) =>
		new Date(iso)
			.toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' })
			.toUpperCase();
	const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
	const price = (e: EventItem) => (minPrice(e) === 0 ? 'Free' : formatMoney(minPrice(e), currency.value));
	const seatTier = (e: EventItem) =>
		minPrice(e) === 0 ? 'Free / Invite' : formatMoney(minPrice(e), currency.value);
	const saved = (id: string) => bookmarks.value.includes(id);
</script>

<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">
	<!-- ── top bar ──────────────────────────────────────────────────────── -->


	<!-- ── feed header ──────────────────────────────────────────────────── -->
	<div class="{WRAP} pt-10 pb-2">
		<div class="flex items-end justify-between gap-6">
			<div>
				<div class="flex items-center gap-2">
					<span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
					<span class="{MONO} text-on-surface-variant">Regional Feed // NGA-LOS-01</span>
				</div>
				<h1 class="font-display text-display-hero text-on-surface pt-3">Live Signals &amp; Gatherings</h1>
			</div>
			<div class="hidden lg:flex items-center gap-2 pb-2">
				<Radio class="w-4 h-4 text-tertiary" />
				<span class="{MONO} text-on-surface-variant">42 active gates in Lagos today</span>
			</div>
		</div>
		<div class="flex flex-wrap items-center gap-2 pt-7">
			{#each categories as cat (cat.id)}
				{@const CategoryIcon = cat.icon}
				<button
					onclick={() => {
						category = cat.id as CategoryId;
						curatedPage = 0;
					}}
					aria-pressed={category === cat.id}
					class="px-4 py-2 rounded-full text-label-badge tracking-wide transition-colors
						{category === cat.id
							? 'bg-primary text-on-primary font-semibold shadow-sm glow-primary'
							: 'bg-surface-container text-on-surface-variant hover:text-on-surface border border-surface-glass-border'}"
				>
					<CategoryIcon class="w-4 h-4 shrink-0" />
					{cat.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- ── spotlight ────────────────────────────────────────────────────── -->
	{#if featured}
		<div class="{WRAP} pt-8">
			<div class="grid lg:grid-cols-[1.1fr_1fr] rounded-2xl overflow-hidden border border-surface-glass-border bg-surface-container">
				<div class="relative min-h-[300px] lg:min-h-[430px]">
					<Cover cover={featured.cover} class="absolute inset-0 w-full h-full" iconClass="w-20 h-20 text-white/25" />
					<div class="absolute inset-0 bg-gradient-to-tr from-surface-base/70 via-transparent to-transparent"></div>
					<div class="absolute top-4 left-4 flex items-center gap-2">
						<span class="{MONO} bg-surface-base/80 backdrop-blur-md border border-surface-glass-border text-on-surface px-2.5 py-1 rounded">Spotlight Protocol</span>
						<span class="{MONO} bg-secondary-container text-on-secondary-container font-bold px-2.5 py-1 rounded">{spotsLeft(featured)} VIP left</span>
					</div>
				</div>
				<div class="flex flex-col gap-5 p-7 xl:p-9">
					<span class="{MONO} text-tertiary">
						{catLabel(featured.category)} • {featured.organizer.name}
					</span>
					<h2 class="font-display font-bold text-on-surface text-[32px] xl:text-[40px] leading-[1.05] tracking-tight">
						{featured.title}
					</h2>
					<p class="text-body-lg text-on-surface-variant line-clamp-3">{featured.description}</p>
					<div class="grid grid-cols-2 gap-6 pt-1">
						<div>
							<span class="{MONO} text-on-surface-variant">Date &amp; Window</span>
							<div class="flex items-center gap-2 pt-2">
								<CalendarDays class="w-4 h-4 text-primary shrink-0" />
								<span class="text-body-md font-semibold text-on-surface">{fmtDateFull(featured.startsAt)}</span>
							</div>
						</div>
						<div>
							<span class="{MONO} text-on-surface-variant">Venue Dock</span>
							<div class="flex items-center gap-2 pt-2 min-w-0">
								<MapPin class="w-4 h-4 text-primary shrink-0" />
								<span class="text-body-md font-semibold text-on-surface truncate">{featured.venue}, {featured.city}</span>
							</div>
						</div>
					</div>
					<div class="flex-1"></div>
					<div class="flex items-center gap-3 pt-2">
						<button
							onclick={() => goto(`/events/${featured.slug}`)}
							class="flex-1 h-12 rounded-lg bg-primary text-on-primary font-semibold text-body-md flex items-center justify-center gap-3 hover:bg-primary-container transition-colors glow-primary"
						>
							<span>Get Tickets</span>
							<span class="font-code text-label-badge opacity-80">from {formatMoney(minPrice(featured), currency.value)}</span>
							<ArrowRight class="w-4 h-4" />
						</button>
						<button
							aria-label={saved(featured.id) ? 'Remove bookmark' : 'Bookmark'}
							onclick={() => toggleIn(bookmarks, featured.id)}
							class="h-12 px-5 rounded-lg bg-surface-container-high text-on-surface text-body-sm font-semibold flex items-center gap-2 hover:bg-surface-container-highest transition-colors border border-surface-glass-border"
						>
							{#if saved(featured.id)}<BookmarkCheck class="w-4 h-4 text-primary" />{:else}<Bookmark class="w-4 h-4" />{/if}
							<span>Save</span>
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- ── near-you event slides ────────────────────────────────────────── -->
	{#if rail.length}
		<section class="{WRAP} pt-8">
			<div class="flex items-end justify-between gap-4">
				<div>
					<h2 class="font-display text-headline-lg text-on-surface">Happening Near You</h2>
					<p class="text-body-sm text-on-surface-variant mt-1">Handpicked sessions in your geo-zone</p>
				</div>
				<button type="button" onclick={() => goto('/explore')} class="{MONO} text-primary hover:underline flex items-center gap-1 shrink-0">View all <ArrowUpRight class="w-3.5 h-3.5" /></button>
			</div>
			<div class="pt-5">
				<Carousel items={rail}>
					{#snippet children(event: EventItem)}<EventCard {event} />{/snippet}
				</Carousel>
			</div>
		</section>
	{/if}

	<!-- ── main grid ────────────────────────────────────────────────────── -->
	<div class="{WRAP} pt-10 grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_380px] gap-6 xl:gap-8 items-start">
		<!-- left column -->
		<div class="flex flex-col gap-10 min-w-0">
			<!-- trending -->
			<section>
				<div class="flex items-center justify-between gap-4">
					<div class="flex items-center gap-2.5 min-w-0">
						<span class="w-2 h-2 rounded-full bg-primary"></span>
						<h2 class="font-display text-headline-lg text-on-surface truncate">Trending This Week in Lagos</h2>
					</div>
					<button
						onclick={() => goto('/explore')}
						class="{MONO} text-primary flex items-center gap-1 hover:underline shrink-0"
					>
						<span>View Index</span>
						<ArrowUpRight class="w-3.5 h-3.5" />
					</button>
				</div>
				<div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4 pt-5">
					{#each trending as event (event.id)}
						<button
							onclick={() => goto(`/events/${event.slug}`)}
							class="rounded-xl overflow-hidden bg-surface-container border border-surface-glass-border hover:border-primary/40 transition-colors text-left group flex flex-col"
						>
							<div class="relative aspect-[16/10] overflow-hidden">
								<Cover cover={event.cover} class="w-full h-full group-hover:scale-105 transition-transform duration-500" />
								<span class="{MONO} absolute top-3 right-3 bg-surface-base/80 backdrop-blur-md border border-surface-glass-border text-on-surface px-2 py-1 rounded">
									{dayBadge(event.startsAt)}
								</span>
								<span class="{MONO} absolute bottom-3 left-3 bg-surface-base/75 backdrop-blur-md text-tertiary px-2 py-0.5 rounded">
									{(event.tags[0] ?? event.category).toUpperCase()}
								</span>
							</div>
							<div class="p-4 flex flex-col gap-3 flex-1">
								<h3 class="font-display text-body-lg font-semibold text-on-surface truncate">{event.title}</h3>
								<span class="flex items-center gap-1.5 text-body-sm text-on-surface-variant min-w-0">
									<MapPin class="w-3.5 h-3.5 shrink-0" />
									<span class="truncate">{event.venue}</span>
								</span>
								<div class="mt-auto border-t border-surface-glass-border pt-3 flex items-end justify-between gap-3">
									<div>
										<span class="{MONO} text-on-surface-variant">Pass Entry</span>
										<div class="font-code text-[15px] font-bold pt-0.5 {minPrice(event) === 0 ? 'text-accent-emerald' : 'text-primary'}">
											{price(event)}
										</div>
									</div>
									<div class="text-right">
										<span class="{MONO} text-on-surface-variant">Capacity</span>
										<div
											class="font-code text-label-badge font-bold pt-1
												{sellingFast(event)
													? 'text-secondary'
													: minPrice(event) === 0
														? 'text-accent-emerald'
														: 'text-on-surface-variant'}"
										>
											{sellingFast(event)
												? `Last ${spotsLeft(event)} passes`
												: minPrice(event) === 0
													? 'RSVP open'
													: `${spotsLeft(event)} spots left`}
										</div>
									</div>
								</div>
							</div>
						</button>
					{:else}
						<span class="text-body-sm text-on-surface-variant">No trending signals in this channel yet.</span>
					{/each}
				</div>
			</section>

			<!-- curated -->
			<section>
				<span class="{MONO} text-on-surface-variant">Intellectual Hubs</span>
				<div class="flex items-center justify-between gap-4 pt-2">
					<h2 class="font-display text-headline-lg text-on-surface">Curated For You</h2>
					<div class="flex items-center gap-2">
						<button
							aria-label="Previous curated page"
							disabled={curatedPage === 0}
							onclick={() => (curatedPage = Math.max(0, curatedPage - 1))}
							class="w-9 h-9 rounded-lg bg-surface-container border border-surface-glass-border text-on-surface-variant hover:text-on-surface hover:border-primary/40 disabled:opacity-40 disabled:hover:border-surface-glass-border flex items-center justify-center transition-colors"
						>
							<ChevronLeft class="w-4 h-4" />
						</button>
						<button
							aria-label="Next curated page"
							disabled={curatedPage >= curatedPages - 1}
							onclick={() => (curatedPage = Math.min(curatedPages - 1, curatedPage + 1))}
							class="w-9 h-9 rounded-lg bg-surface-container border border-surface-glass-border text-on-surface-variant hover:text-on-surface hover:border-primary/40 disabled:opacity-40 disabled:hover:border-surface-glass-border flex items-center justify-center transition-colors"
						>
							<ChevronRight class="w-4 h-4" />
						</button>
					</div>
				</div>
				<div class="flex flex-col gap-3 pt-5">
					{#each curatedSlice as event (event.id)}
						<div class="flex items-center gap-4 rounded-xl bg-surface-container border border-surface-glass-border p-4 hover:border-primary/40 transition-colors">
							<div class="w-14 h-14 rounded-lg bg-surface-container-high border border-surface-glass-border flex flex-col items-center justify-center shrink-0">
								<span class="font-code text-[10px] tracking-[0.14em] text-on-surface-variant uppercase">
									{fmtDate(event.startsAt, { month: 'short' })}
								</span>
								<span class="font-display text-headline-md text-on-surface leading-none pt-0.5">
									{new Date(event.startsAt).getDate().toString().padStart(2, '0')}
								</span>
							</div>
							<button onclick={() => goto(`/events/${event.slug}`)} class="flex-1 min-w-0 text-left">
								<span class="flex items-center gap-2 min-w-0">
									<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-tertiary px-2 py-0.5 rounded truncate">
										{event.organizer.name}
									</span>
									<span class="{MONO} text-on-surface-variant truncate">{catLabel(event.category)}</span>
								</span>
								<span class="block font-display text-body-lg font-semibold text-on-surface truncate pt-1">{event.title}</span>
								<span class="block text-body-sm text-on-surface-variant truncate pt-0.5">
									{event.venue} • {fmtTime(event.startsAt)} WAT
								</span>
							</button>
							<div class="hidden sm:flex flex-col items-end shrink-0 pr-1">
								<span class="{MONO} text-on-surface-variant">Seat Tier</span>
								<span class="font-code text-[15px] font-bold pt-0.5 {minPrice(event) === 0 ? 'text-accent-emerald' : 'text-primary'}">
									{seatTier(event)}
								</span>
							</div>
							<button
								onclick={() => goto(`/events/${event.slug}`)}
								class="h-9 px-4 rounded-lg bg-surface-container-high border border-surface-glass-border text-body-sm font-semibold text-on-surface hover:bg-primary hover:text-on-primary hover:border-primary transition-colors shrink-0"
							>
								{minPrice(event) === 0 ? 'RSVP' : 'Reserve'}
							</button>
						</div>
					{:else}
						<span class="text-body-sm text-on-surface-variant">Nothing curated in this channel yet.</span>
					{/each}
				</div>
			</section>
		</div>

		<!-- right rail -->
		<aside class="flex flex-col gap-6 min-w-0">
			<!-- verified organizers -->
			<div class="rounded-2xl border border-surface-glass-border bg-surface-container p-5">
				<div class="flex items-center justify-between gap-3">
					<h3 class="font-display text-headline-md text-on-surface">Verified Organizers</h3>
					<span class="{MONO} text-on-surface-variant">Lagos</span>
				</div>
				<div class="flex flex-col gap-4 pt-4">
					{#each organizers() as org (org.id)}
						<div class="flex items-center gap-3">
							<a href="/users/{org.handle}" aria-label="View {org.name}'s profile" class="flex flex-1 min-w-0 items-center gap-3 rounded-lg hover:bg-surface-container-high/60 transition-colors">
								<Avatar name={org.name} color={org.avatarColor} src={org.avatarUrl} size="md" />
								<span class="flex-1 min-w-0">
									<span class="flex items-center gap-1 min-w-0"><span class="text-body-md font-semibold text-on-surface truncate">{org.name}</span><BadgeCheck class="w-3.5 h-3.5 text-tertiary shrink-0" /></span>
									<span class="block text-body-sm text-on-surface-variant truncate">{org.events} Events • {compact(org.attended)} Attended</span>
								</span>
							</a>
							<FollowButton profileId={org.id} />
						</div>
					{/each}
				</div>
			</div>

			<!-- engine -->
			<div class="rounded-2xl border border-surface-glass-border bg-surface-container-low p-5">
				<div class="flex items-center gap-2">
					<ShieldCheck class="w-4 h-4 text-primary" />
					<span class="font-display font-bold text-on-surface tracking-wide text-body-md">OWLTSIDE ENGINE</span>
				</div>
				<p class="text-body-sm text-on-surface-variant leading-relaxed pt-3">
					Tamper-evident HMAC tickets. Zero scalping guaranteed. Dynamic keys rotate at sub-minute
					intervals directly signed by venue node hardware.
				</p>
				<div class="flex items-center gap-5 pt-4">
					<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
						<span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
						P2P Fraud: 0%
					</span>
					<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
						<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
						Zero Speculation
					</span>
				</div>
			</div>
		</aside>
	</div>

	<!-- ── footer ───────────────────────────────────────────────────────── -->
	<footer class="mt-12 border-t border-surface-glass-border">
		<div class="{WRAP} py-6 flex flex-col lg:flex-row items-center justify-between gap-3">
			<div class="flex items-center gap-3">
				<span class="font-display font-bold text-on-surface tracking-tight">OWLTSIDE</span>
				<span class="w-px h-4 bg-outline-variant/40"></span>
				<span class="{MONO} text-on-surface-variant">Event Ticketing Architecture</span>
			</div>
			<div class="flex items-center gap-5">
				<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
					System Status: 99.98% Optimal
				</span>
				<span class="{MONO} text-on-surface-variant">© {new Date().getFullYear()} Owltside Protocol</span>
			</div>
		</div>
	</footer>
</div>
