<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		ArrowRight,
		BadgeCheck,
		Bookmark,
		BookmarkCheck,
		CalendarClock,
		ChevronDown,
		CircleCheck,
		Flame,
		Lock,
		MapPin,
		Navigation,
		Share2,
		Shirt,
		Clock,
		Zap
	} from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import Cover from '$components/Cover.svelte';
	import Stepper from '$components/Stepper.svelte';
	import { bookmarks, follows, toggleIn } from '$lib/state/prefs.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { countdownLabel, fmtDateFull, fmtTime } from '$lib/utils/dates';
	import { formatMoney } from '$lib/utils/money';
	import { currency } from '$lib/state/prefs.svelte';

	let { data } = $props();
	const event = $derived(data.event);

	let tierId = $state(event.tiers.find((t) => t.capacity - t.sold > 0)?.id ?? event.tiers[0].id);
	let qty = $state(1);
	let openPolicy = $state<number | null>(null);

	const tier = $derived(event.tiers.find((t) => t.id === tierId)!);
	const total = $derived(tier.price * qty);
	const left = $derived(tier.capacity - tier.sold);
	const saved = $derived(bookmarks.value.includes(event.id));
	const following = $derived(follows.value.includes(event.organizer.id));

	const policyItems = $derived([
		...event.policies.map((p) => ({ icon: CircleCheck, color: 'text-accent-emerald', title: p, body: '' })),
		...event.faqs.map((f) => ({ icon: Lock, color: 'text-tertiary', title: f.q, body: f.a }))
	]);

	function checkout() {
		goto(`/checkout?event=${event.slug}&tier=${tierId}&qty=${qty}`);
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
									<div class="flex items-center gap-2" onclick={(e) => e.stopPropagation()}>
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
