<script lang="ts">
	import FollowButton from '$components/FollowButton.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
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
		MessageSquare,
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
	import SpeakerInviteNotice from '$components/SpeakerInviteNotice.svelte';
	import { bookmarks, toggleIn } from '$lib/state/prefs.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { countdownLabel, fmtDate, fmtDateFull, fmtTime } from '$lib/utils/dates';
	import { formatMoney } from '$lib/utils/money';
	import { currency } from '$lib/state/prefs.svelte';
	import { promoDiscount } from '$lib/utils/promo';
import { requestEventPromo } from '$lib/utils/promo-client';
import type { MessageRequest, ResolvedPromo } from '$lib/types';
	import { categories } from '$components/iconMap';

	let { data } = $props();
	const event = $derived(data.event);
	const categoryLabel = $derived(
		categories.find((category) => category.id === event.category)?.label ?? event.category.replaceAll('_', ' ')
	);
	const session = $derived(page.data.session);
	const isOrganizer = $derived(session?.userId === event.organizer.id);
	const visibleSpeakers = $derived(event.speakers.filter((speaker) => !speaker.invited || speaker.inviteStatus === 'accepted'));
	const currentSpeakerInvite = $derived(
		event.speakers.find((speaker) => speaker.id === session?.userId && speaker.invited && !speaker.displayOnly) ?? null
	);
	const speakerInviteStatus = $derived(currentSpeakerInvite?.inviteStatus ?? 'pending');
	const showSpeakerInviteNotice = $derived(!!currentSpeakerInvite && speakerInviteStatus !== 'declined');
	let speakerInviteResponding = $state(false);
	let messageRequest = $state<MessageRequest | null>(null);
	$effect(() => { messageRequest = data.messageRequest ?? null; });
	let showMessageDialog = $state(false);
	let messageDraft = $state('');
	let messageError = $state('');
	let messageSending = $state(false);

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	let tierId = $state(event.tiers.find((t) => t.capacity - t.sold > 0)?.id ?? event.tiers[0].id);
	let qty = $state(1);
	let openPolicy = $state<number | null>(null);

	const tier = $derived(event.tiers.find((t) => t.id === tierId)!);
	const left = $derived(tier.capacity - tier.sold);
	const saved = $derived(bookmarks.value.includes(event.id));

	/* ── desktop ticket selector extras ── */
	let promoInput = $state('');
	let appliedPromo = $state<ResolvedPromo | null>(null);
	let promoApplying = $state(false);
	let agendaDayIdx = $state(0);

	const base = $derived(tier.price * qty);
	const fee = $derived(base > 0 ? Math.min(Math.round(base * 0.015), 1000) : 0);
	const discount = $derived(promoDiscount(base, appliedPromo));
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

	function contactOrganizer() {
		if (!session) {
			void goto('/auth/login');
			return;
		}
		if (isOrganizer) {
			toast('You are the organizer of this event', 'info');
			return;
		}
		if (messageRequest?.status === 'accepted' && messageRequest.conversationId) {
			void goto(`/inbox/${messageRequest.conversationId}`);
			return;
		}
		if (messageRequest?.status === 'pending') {
			toast('Your message request is waiting for the organizer', 'info');
			return;
		}
		messageDraft = '';
		messageError = '';
		showMessageDialog = true;
	}

	async function sendMessageRequest() {
		const body = messageDraft.trim();
		if (!body || messageSending) return;
		messageSending = true;
		messageError = '';
		try {
			const response = await fetch('/api/message-requests', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ eventSlug: event.slug, body })
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error ?? 'Your request could not be sent');
			messageRequest = result.request as MessageRequest;
			showMessageDialog = false;
			toast('Message request sent to the organizer', 'success');
		} catch (error) {
			messageError = error instanceof Error ? error.message : 'Your request could not be sent';
		} finally {
			messageSending = false;
		}
	}

	async function respondToSpeakerInvite(accept: boolean) {
		if (!session || !currentSpeakerInvite || speakerInviteResponding) return;
		speakerInviteResponding = true;
		try {
			const response = await fetch(`/api/events/${encodeURIComponent(event.slug)}/speaker-invite`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ accept })
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error ?? 'Your invitation response could not be saved');
			await invalidateAll();
			toast(accept ? 'Speaker invitation accepted' : 'Speaker invitation declined', 'success');
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Your invitation response could not be saved', 'error');
		} finally {
			speakerInviteResponding = false;
		}
	}

	async function applyPromo() {
		if (promoApplying) return;
		promoApplying = true;
		try {
			appliedPromo = await requestEventPromo(event.slug, promoInput);
			toast(`Promo ${appliedPromo.code} applied`, 'success');
		} catch (error) {
			appliedPromo = null;
			toast(error instanceof Error ? error.message : 'That code isn’t valid for this event', 'error');
		} finally {
			promoApplying = false;
		}
	}

	const policyItems = $derived([
		...event.policies.map((p) => ({ icon: CircleCheck, color: 'text-accent-emerald', title: p, body: '' })),
		...event.faqs.map((f) => ({ icon: Lock, color: 'text-tertiary', title: f.q, body: f.a }))
	]);

	function checkout() {
		goto(
			`/checkout?event=${encodeURIComponent(event.slug)}&tier=${encodeURIComponent(tierId)}&qty=${qty}${appliedPromo ? `&promo=${encodeURIComponent(appliedPromo.code)}` : ''}`
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
					<span class="{MONO} bg-surface-base/80 backdrop-blur-md border border-surface-glass-border text-on-surface px-2.5 py-1 rounded">{categoryLabel}</span>
					<span class="{MONO} bg-surface-base/80 backdrop-blur-md border border-surface-glass-border text-on-surface px-2.5 py-1 rounded">{agendaDays.length}-Day Summit</span>
					<span class="{MONO} bg-primary text-on-primary px-2.5 py-1 rounded">{leftAll} VIP Left</span>
					{#if event.organizer.verified}
						<span class="{MONO} bg-surface-base/80 backdrop-blur-md border border-surface-glass-border text-on-surface px-2.5 py-1 rounded flex items-center gap-1.5">
							Verified Organizer
						</span>
					{/if}
				</div>
				<h1 class="font-display text-display-hero text-on-surface max-w-3xl">{event.title}</h1>
				<p class="text-body-lg text-on-surface-variant max-w-2xl line-clamp-2">{event.description}</p>
				<div class="flex flex-wrap items-center justify-between gap-4 pt-1">
					<span class="flex items-center gap-3 min-w-0">
						<a href="/users/{event.organizer.handle}" class="flex items-center gap-3 min-w-0 rounded-lg hover:bg-surface-container-high/40 transition-colors">
							<Avatar name={event.organizer.name} color={event.organizer.avatarColor} src={event.organizer.avatarUrl} size="md" />
							<span class="min-w-0">
								<span class="flex items-center gap-1.5 min-w-0">
									<span class="text-body-md font-semibold text-on-surface truncate">{event.organizer.name}</span>
									{#if event.organizer.verified}<BadgeCheck class="w-4 h-4 text-tertiary shrink-0" />{/if}
								</span>
								<span class="block text-body-sm text-on-surface-variant truncate pt-0.5">
									{event.organizer.followers.toLocaleString()} followers • {event.organizer.bio ?? 'Verified host node'}
								</span>
							</span>
						</a>
					</span>
					<span class="flex items-center gap-2">
						<FollowButton profileId={event.organizer.id} />
						{#if !session}
							<a href="/auth/login" class="h-10 px-4 rounded-lg text-body-sm font-semibold flex items-center gap-2 bg-surface-container border border-surface-glass-border text-on-surface hover:border-primary/50 transition-colors"><MessageSquare class="w-4 h-4" />Message organizer</a>
						{:else if isOrganizer}
							<span class="h-10 px-4 rounded-lg text-body-sm font-semibold flex items-center gap-2 bg-surface-container-high text-on-surface-variant"><MessageSquare class="w-4 h-4" />Your event</span>
						{:else if messageRequest?.status === 'accepted' && messageRequest.conversationId}
							<a href="/inbox/{messageRequest.conversationId}" class="h-10 px-4 rounded-lg text-body-sm font-semibold flex items-center gap-2 bg-primary text-on-primary"><MessageSquare class="w-4 h-4" />Continue chat</a>
						{:else if messageRequest?.status === 'pending'}
							<button type="button" disabled class="h-10 px-4 rounded-lg text-body-sm font-semibold flex items-center gap-2 bg-surface-container-high text-on-surface-variant opacity-80"><MessageSquare class="w-4 h-4" />Request sent</button>
						{:else}
							<button type="button" onclick={contactOrganizer} class="h-10 px-4 rounded-lg text-body-sm font-semibold flex items-center gap-2 bg-surface-container border border-surface-glass-border text-on-surface hover:border-primary/50 transition-colors"><MessageSquare class="w-4 h-4" />{messageRequest?.status === 'declined' ? 'Request again' : 'Message organizer'}</button>
						{/if}
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
			<div class="rounded-xl border border-surface-glass-border bg-surface-container grid grid-cols-3 divide-x divide-surface-glass-border">
				{#each [
					[`${event.attendees.toLocaleString()}+`, 'Global Engineers'],
					[`${visibleSpeakers.length}`, 'Speaker/Performer'],
					[`${agendaDays.length}`, 'Day(s)']
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
							{#if visibleSpeakers.length}
								{@const previewSpeaker = visibleSpeakers[i % visibleSpeakers.length]}
								{#if previewSpeaker.handle}
									<a href="/users/{previewSpeaker.handle}" aria-label="View {previewSpeaker.name}'s profile" class="rounded-lg bg-surface-base border border-surface-glass-border px-4 py-2.5 flex items-center gap-3 hover:bg-surface-container-low transition-colors">
										<Avatar name={previewSpeaker.name} src={previewSpeaker.avatarUrl} color={previewSpeaker.avatarColor} size="xs" />
										<span class="text-body-sm font-semibold text-on-surface hover:underline">{previewSpeaker.name}</span>
										<span class="font-code text-[11px] tracking-[0.08em] text-on-surface-variant truncate">• {previewSpeaker.role ?? previewSpeaker.bio ?? `@${previewSpeaker.handle}`}</span>
									</a>
								{:else}
								<div class="rounded-lg bg-surface-base border border-surface-glass-border px-4 py-2.5 flex items-center gap-3">
									<Avatar name={previewSpeaker.name} src={previewSpeaker.avatarUrl} color={previewSpeaker.avatarColor} size="xs" />
									<span class="text-body-sm font-semibold text-on-surface">{previewSpeaker.name}</span>
									<span class="font-code text-[11px] tracking-[0.08em] text-on-surface-variant truncate">• {previewSpeaker.role ?? previewSpeaker.bio ?? 'Guest performer'}</span>
								</div>
								{/if}
							{/if}
						</div>
					{/each}
				</section>
			{/if}

			<!-- speakers -->
			{#if visibleSpeakers.length || showSpeakerInviteNotice}
				<section class="flex flex-col gap-4">
					<div class="flex items-center justify-between gap-4">
						<h2 class="font-display text-headline-lg text-on-surface border-l-2 border-primary pl-3">Speaker/Performer</h2>
						{#if visibleSpeakers.length}
							<button type="button" onclick={() => toast('Full speaker index ships with the agenda node', 'info')} class="text-body-sm text-primary font-semibold hover:underline flex items-center gap-1 shrink-0">
								View All {visibleSpeakers.length} speaker profiles <ArrowRight class="w-3.5 h-3.5" />
							</button>
						{/if}
					</div>
					{#if showSpeakerInviteNotice && currentSpeakerInvite}
						<SpeakerInviteNotice
							speaker={currentSpeakerInvite}
							status={speakerInviteStatus}
							busy={speakerInviteResponding}
							onRespond={respondToSpeakerInvite}
						/>
					{/if}
					{#if visibleSpeakers.length}
						<div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
							{#each visibleSpeakers.slice(0, 3) as person, i (person.id)}
								{#if person.handle}
								<a href="/users/{person.handle}" aria-label="View {person.name}'s profile" class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden hover:border-primary/40 hover:bg-surface-container-high transition-colors block">
									<div class="relative">
										<Cover cover={{ from: '#1e293b', to: '#0b1326', icon: 'pen-tool' }} class="w-full h-40 grayscale" iconClass="w-10 h-10 text-white/25" />
										<span class="{MONO} absolute top-3 right-3 bg-surface-base/85 backdrop-blur-md border border-surface-glass-border text-on-surface px-2 py-0.5 rounded">{['Keynote', 'Architect', 'Panelist'][i % 3]}</span>
									</div>
									<div class="p-4 flex flex-col gap-1">
										<span class="text-body-md font-semibold text-on-surface truncate hover:underline">{person.name}</span>
										<span class="text-body-sm text-on-surface-variant truncate">{person.role ?? person.bio ?? person.city ?? 'Performer'}</span>
										<span class="font-code text-[11px] tracking-[0.08em] text-on-surface-variant pt-1">@{person.handle}</span>
									</div>
								</a>
								{:else}
								<div class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden">
									<div class="relative">
										<Cover cover={{ from: '#1e293b', to: '#0b1326', icon: 'pen-tool' }} class="w-full h-40 grayscale" iconClass="w-10 h-10 text-white/25" />
										<span class="{MONO} absolute top-3 right-3 bg-surface-base/85 backdrop-blur-md border border-surface-glass-border text-on-surface px-2 py-0.5 rounded">{['Keynote', 'Architect', 'Panelist'][i % 3]}</span>
									</div>
									<div class="p-4 flex flex-col gap-1">
										<span class="text-body-md font-semibold text-on-surface truncate">{person.name}</span>
										<span class="text-body-sm text-on-surface-variant truncate">{person.role ?? person.bio ?? person.city ?? 'Performer'}</span>
										<span class="font-code text-[11px] tracking-[0.08em] text-on-surface-variant pt-1">Display only</span>
									</div>
								</div>
								{/if}
							{/each}
						</div>
					{/if}
				</section>
			{/if}

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
							<span class="{MONO} text-accent-emerald flex items-center gap-1.5"><CircleCheck class="w-3.5 h-3.5" /> {appliedPromo.code}_Applied</span>
							<span class="font-code text-body-sm font-bold text-accent-emerald">-{formatMoney(discount, currency.value)}</span>
						</div>
					</div>
				{:else}
					<div class="flex items-center gap-2">
						<input bind:value={promoInput} placeholder="PROMO CODE" class="flex-1 h-10 px-3 rounded-lg bg-surface-base border border-surface-glass-border font-code text-label-code text-on-surface uppercase placeholder:text-outline-variant focus:outline-none focus:border-primary/50" />
						<button type="button" disabled={promoApplying} onclick={applyPromo} class="{MONO} h-10 px-3 rounded-lg bg-surface-container-high border border-surface-glass-border text-on-surface hover:bg-primary hover:text-on-primary hover:border-primary transition-colors disabled:opacity-50">{promoApplying ? 'Checking…' : 'Apply'}</button>
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

<section class="border-b border-surface-glass-border">
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

	</div>
</section>

<main class="flex flex-col relative w-full  pb-safe bg-surface min-h-dvh">
	<div class="flex flex-col w-full pb-28 md:pb-32 md:max-w-5xl md:mx-auto">
		<!-- hero -->
		<div class="relative w-full aspect-[16/10] overflow-hidden bg-surface-container-low shadow-lg">
			<Cover cover={event.cover} class="w-full h-full" iconClass="w-20 h-20 text-white/25" />
			<div class="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-black/30"></div>
			<div class="absolute top-4 right-4 flex items-center gap-space-xs z-10">
				<button aria-label={saved ? 'Remove bookmark' : 'Bookmark'} aria-pressed={saved} onclick={() => toggleIn(bookmarks, event.id)} class="w-10 h-10 rounded-full bg-surface-raised/80 backdrop-blur-md text-on-surface flex items-center justify-center shadow-md active:scale-90 transition-transform">
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

			<!-- compact version of the desktop date, time and venue metadata -->
			<div class="rounded-xl border border-surface-glass-border bg-surface-container divide-y divide-surface-glass-border">
				<div class="flex items-start gap-3 p-3.5"><CalendarClock class="w-4.5 h-4.5 text-primary mt-0.5 shrink-0" /><span><span class="block text-label-badge uppercase tracking-wider text-on-surface-variant">Date &amp; duration</span><span class="block text-body-sm font-semibold text-on-surface pt-1">{fmtDate(event.startsAt)} – {fmtDate(event.endsAt ?? event.startsAt)} · {agendaDays.length} day{agendaDays.length === 1 ? '' : 's'}</span></span></div>
				<div class="flex items-start gap-3 p-3.5"><Clock class="w-4.5 h-4.5 text-primary mt-0.5 shrink-0" /><span><span class="block text-label-badge uppercase tracking-wider text-on-surface-variant">Summit hours</span><span class="block text-body-sm font-semibold text-on-surface pt-1">{fmtTime(event.startsAt)} – {event.endsAt ? fmtTime(event.endsAt) : 'Late'} · West Africa Time</span></span></div>
				<div class="flex items-start gap-3 p-3.5"><MapPin class="w-4.5 h-4.5 text-primary mt-0.5 shrink-0" /><span class="min-w-0"><span class="block text-label-badge uppercase tracking-wider text-on-surface-variant">Physical hub</span><span class="block text-body-sm font-semibold text-on-surface pt-1 truncate">{event.venue}, {event.city}</span></span></div>
			</div>

			<!-- host -->
			<div class="flex items-center justify-between p-space-md bg-surface-container rounded-xl shadow-sm">
				<a href="/users/{event.organizer.handle}" class="flex items-center gap-space-sm min-w-0">
					<div class="relative flex-shrink-0">
						<Avatar name={event.organizer.name} color={event.organizer.avatarColor} src={event.organizer.avatarUrl} size="lg" />
					</div>
					<div class="flex flex-col min-w-0">
						<span class="text-label-badge text-primary-fixed-dim uppercase tracking-wider">Host & Curator</span>
						<span class="flex items-center gap-1.5 min-w-0">
							<span class="font-display text-headline-md text-on-surface truncate">{event.organizer.name}</span>
							{#if event.organizer.verified}<BadgeCheck class="w-4 h-4 text-tertiary shrink-0" />{/if}
						</span>
						<span class="text-body-sm text-on-surface-variant truncate">{event.organizer.followers.toLocaleString()} followers</span>
					</div>
				</a>
				<FollowButton profileId={event.organizer.id} />
				{#if !session}
					<a href="/auth/login" aria-label="Sign in to message organizer" class="h-10 px-3 rounded-full bg-surface-bright text-on-surface text-body-sm font-semibold flex items-center gap-1.5 shrink-0"><MessageSquare class="w-4 h-4" />Message</a>
				{:else if isOrganizer}
					<span class="h-10 px-3 rounded-full bg-surface-bright text-on-surface-variant text-body-sm font-semibold flex items-center gap-1.5 shrink-0"><MessageSquare class="w-4 h-4" />Your event</span>
				{:else if messageRequest?.status === 'accepted' && messageRequest.conversationId}
					<a href="/inbox/{messageRequest.conversationId}" class="h-10 px-3 rounded-full bg-primary text-on-primary text-body-sm font-semibold flex items-center gap-1.5 shrink-0"><MessageSquare class="w-4 h-4" />Chat</a>
				{:else if messageRequest?.status === 'pending'}
					<button type="button" disabled class="h-10 px-3 rounded-full bg-surface-bright text-on-surface-variant text-body-sm font-semibold flex items-center gap-1.5 shrink-0"><MessageSquare class="w-4 h-4" />Sent</button>
				{:else}
					<button type="button" onclick={contactOrganizer} class="h-10 px-3 rounded-full bg-surface-bright text-on-surface text-body-sm font-semibold flex items-center gap-1.5 shrink-0"><MessageSquare class="w-4 h-4" />Message</button>
				{/if}
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
					<button class="px-3 py-1.5 rounded-full bg-surface-container-highest text-tertiary text-label-badge flex items-center gap-1 flex-shrink-0 active:scale-95" onclick={() => toast('Directions open in your maps node', 'info')}>
						<span>Directions</span><Navigation class="w-3.5 h-3.5" />
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

			<!-- event stats -->
			<div class="rounded-xl border border-surface-glass-border bg-surface-container grid grid-cols-3 divide-x divide-surface-glass-border">
				<div class="p-3.5"><span class="font-display text-headline-md font-bold text-on-surface">{event.attendees.toLocaleString()}+</span><span class="block text-label-badge text-on-surface-variant pt-1">Global attendees</span></div>
				<div class="p-3.5"><span class="font-display text-headline-md font-bold text-on-surface">{visibleSpeakers.length}</span><span class="block text-label-badge text-on-surface-variant pt-1">Speaker/Performer</span></div>
				<div class="p-3.5"><span class="font-display text-headline-md font-bold text-on-surface">{agendaDays.length}</span><span class="block text-label-badge text-on-surface-variant pt-1">Day(s)</span></div>
			</div>
			{#if event.tags.length}
				<div class="flex flex-col gap-2"><span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Tracks &amp; topics</span><div class="flex flex-wrap gap-2">{#each event.tags as tag (tag)}<span class="px-3 py-1 rounded-full bg-surface-container-high border border-surface-glass-border text-label-badge text-on-surface">{tag}</span>{/each}</div></div>
			{/if}

			<!-- agenda -->
			{#if event.agenda.length}
				<div class="flex flex-col gap-space-sm">
					<div class="flex items-center justify-between">
						<h2 class="font-display text-headline-md text-on-surface">Event Agenda</h2>
						<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">{agendaDays.length} days · {event.agenda.length} sessions</span>
					</div>
					<div class="flex gap-2 overflow-x-auto -mx-gutter px-gutter pb-1 scrollbar-none">
						{#each agendaDays as day, i (i)}
							<button type="button" aria-pressed={agendaDayIdx === i} onclick={() => (agendaDayIdx = i)} class="min-w-[130px] rounded-xl border px-3 py-2 text-left {agendaDayIdx === i ? 'border-primary/40 bg-primary/10' : 'border-surface-glass-border bg-surface-container'}"><span class="block text-body-sm font-semibold text-on-surface">Day {i + 1}: {day[0].title.split(':')[0]}</span><span class="block text-label-badge text-on-surface-variant pt-1">{fmtDate(day[0].start)}</span></button>
						{/each}
					</div>
					<div class="flex flex-col gap-space-xs mt-1">
						{#each (agendaDays[agendaDayIdx] ?? []) as item (item.id)}
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
									{@const sp = visibleSpeakers.find((s) => s.id === sid)}
									{#if sp}
										{#if sp.handle}
										<a href="/users/{sp.handle}" aria-label="View {sp.name}'s profile" class="flex items-center gap-space-sm pt-space-xs mt-space-xs bg-surface-container-low p-2 rounded-lg hover:bg-surface-container-high transition-colors">
											<Avatar name={sp.name} color={sp.avatarColor} src={sp.avatarUrl} size="md" />
											<div class="flex flex-col min-w-0">
												<span class="text-body-md text-on-surface font-semibold truncate hover:underline">{sp.name}</span>
												<span class="text-body-sm text-primary-fixed-dim truncate">{sp.bio}</span>
											</div>
										</a>
										{:else}
										<div class="flex items-center gap-space-sm pt-space-xs mt-space-xs bg-surface-container-low p-2 rounded-lg">
											<Avatar name={sp.name} color={sp.avatarColor} src={sp.avatarUrl} size="md" />
											<div class="flex flex-col min-w-0">
												<span class="text-body-md text-on-surface font-semibold truncate">{sp.name}</span>
												<span class="text-body-sm text-primary-fixed-dim truncate">{sp.bio}</span>
											</div>
										</div>
										{/if}
									{/if}
								{/each}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- speaker roster parity -->
			{#if visibleSpeakers.length || showSpeakerInviteNotice}
				<section class="flex flex-col gap-space-sm">
					<div class="flex items-center justify-between gap-2">
						<h2 class="font-display text-headline-md text-on-surface">Speaker/Performer</h2>
						{#if visibleSpeakers.length}<button type="button" onclick={() => toast('Full speaker index ships with the agenda node', 'info')} class="text-label-badge text-primary font-semibold whitespace-nowrap">View all {visibleSpeakers.length}</button>{/if}
					</div>
					{#if showSpeakerInviteNotice && currentSpeakerInvite}
						<SpeakerInviteNotice
							speaker={currentSpeakerInvite}
							status={speakerInviteStatus}
							busy={speakerInviteResponding}
							onRespond={respondToSpeakerInvite}
						/>
					{/if}
					{#if visibleSpeakers.length}
						<div class="flex gap-3 overflow-x-auto -mx-gutter px-gutter pb-1 scrollbar-none">
							{#each visibleSpeakers.slice(0, 3) as person, i (person.id)}
								{#if person.handle}
								<a href="/users/{person.handle}" aria-label="View {person.name}'s profile" class="w-56 shrink-0 rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden hover:border-primary/40 transition-colors block">
									<div class="relative"><Cover cover={{ from: '#1e293b', to: '#0b1326', icon: 'pen-tool' }} class="w-full h-28 grayscale" iconClass="w-8 h-8 text-white/25" /><span class="absolute top-2 right-2 px-2 py-0.5 rounded bg-surface-base/85 text-label-badge text-on-surface">{['Keynote', 'Architect', 'Panelist'][i % 3]}</span></div>
									<div class="p-3 flex items-center gap-2.5"><Avatar name={person.name} color={person.avatarColor} src={person.avatarUrl} size="sm" /><span class="min-w-0"><span class="block text-body-sm font-semibold text-on-surface truncate hover:underline">{person.name}</span><span class="block text-label-badge text-on-surface-variant truncate">{person.role ?? person.bio ?? person.city ?? 'Performer'}</span><span class="block text-label-badge text-on-surface-variant pt-1">@{person.handle}</span></span></div>
								</a>
								{:else}
								<div class="w-56 shrink-0 rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden">
									<div class="relative"><Cover cover={{ from: '#1e293b', to: '#0b1326', icon: 'pen-tool' }} class="w-full h-28 grayscale" iconClass="w-8 h-8 text-white/25" /><span class="absolute top-2 right-2 px-2 py-0.5 rounded bg-surface-base/85 text-label-badge text-on-surface">{['Keynote', 'Architect', 'Panelist'][i % 3]}</span></div>
									<div class="p-3 flex items-center gap-2.5"><Avatar name={person.name} color={person.avatarColor} src={person.avatarUrl} size="sm" /><span class="min-w-0"><span class="block text-body-sm font-semibold text-on-surface truncate">{person.name}</span><span class="block text-label-badge text-on-surface-variant truncate">{person.role ?? person.bio ?? person.city ?? 'Performer'}</span><span class="block text-label-badge text-on-surface-variant pt-1">Display only</span></span></div>
								</div>
								{/if}
							{/each}
						</div>
					{/if}
				</section>
			{/if}

			<!-- tiers -->
			<div class="flex flex-col gap-space-sm">
				<div class="flex items-center justify-between">
					<h2 class="font-display text-headline-md text-on-surface">Select Tickets</h2>
					<span class="text-label-badge text-accent-emerald uppercase tracking-wider flex items-center gap-1">
						<Lock class="w-3.5 h-3.5" /> Instant Mint
					</span>
				</div>
				<div class="rounded-xl bg-surface-container-low border border-surface-glass-border p-3">
					<div class="flex items-center justify-between gap-2 text-label-badge"><span class="text-on-surface-variant">Inventory status</span><span class="font-code text-on-surface">{soldPct}% sold · {leftAll} minimum remaining</span></div>
					<div class="h-1.5 rounded-full bg-surface-container-highest overflow-hidden mt-2"><div class="h-full rounded-full bg-primary" style="width: {soldPct}%"></div></div>
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
							<div class="rounded-xl shadow-sm transition-all {selected ? 'bg-surface-container-high border border-outline-variant' : 'bg-surface-container'}">
								<button
									type="button"
									aria-pressed={selected}
									class="w-full p-space-md rounded-xl flex flex-col gap-space-xs cursor-pointer active:scale-[0.99] text-left"
									onclick={() => (tierId = t.id)}
								>
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-space-xs">
											<span class="text-body-lg text-on-surface font-semibold">{t.name}</span>
											{#if t.id === recommendedId}<span class="px-2 py-0.5 rounded-full bg-primary text-on-primary text-label-badge">Recommended</span>{/if}
											<span class="px-2 py-0.5 rounded-full bg-surface-container-highest text-primary text-label-badge">Available</span>
										</div>
										<span class="font-code text-label-code text-on-surface font-semibold">{formatMoney(t.price, currency.value)}</span>
									</div>
									{#if t.benefits}<p class="text-body-sm text-on-surface-variant">{t.benefits}</p>{/if}
									<span class="text-label-badge text-tertiary pt-1">{t.capacity - t.sold} left</span>
								</button>
								{#if selected}
									<div role="group" aria-label="Ticket quantity" class="px-space-md pb-space-md flex items-center gap-2">
										<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Tickets</span>
										<Stepper value={qty} min={1} max={Math.min(6, t.capacity - t.sold)} onchange={(v) => (qty = v)} />
									</div>
								{/if}
							</div>
						{/if}
				{/each}
			</div>

			<!-- desktop promo code and complete price breakdown parity -->
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-space-md flex flex-col gap-space-sm">
				<div class="flex items-center justify-between gap-2"><h2 class="font-display text-headline-md text-on-surface">Promo &amp; total</h2><span class="text-label-badge text-on-surface-variant">Secure checkout</span></div>
				{#if appliedPromo}
					<div class="flex items-center justify-between gap-2 rounded-lg bg-accent-emerald/10 border border-accent-emerald/20 px-3 py-2.5"><span class="flex items-center gap-1.5 text-label-badge text-accent-emerald"><CircleCheck class="w-4 h-4" />{appliedPromo.code} applied</span><span class="font-code text-body-sm font-bold text-accent-emerald">−{formatMoney(discount, currency.value)}</span></div>
				{:else}
					<div class="flex gap-2"><input bind:value={promoInput} aria-label="Promo code" placeholder="PROMO CODE" class="flex-1 min-w-0 h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border font-code text-label-code text-on-surface uppercase placeholder:text-outline-variant focus:outline-none focus:border-primary/50" onkeydown={(e) => { if (e.key === 'Enter') applyPromo(); }} /><button type="button" disabled={promoApplying} onclick={applyPromo} class="h-11 px-4 rounded-lg bg-surface-container-high border border-surface-glass-border text-body-sm font-semibold text-on-surface disabled:opacity-50">{promoApplying ? 'Checking…' : 'Apply'}</button></div>
				{/if}
				<div class="flex flex-col gap-2 border-t border-surface-glass-border pt-3">
					<div class="flex items-center justify-between gap-2 text-body-sm"><span class="text-on-surface-variant">{qty}× {tier.name}</span><span class="font-code text-on-surface">{formatMoney(base, currency.value)}</span></div>
					<div class="flex items-center justify-between gap-2 text-body-sm"><span class="text-on-surface-variant">Network protocol &amp; VAT</span><span class="font-code text-on-surface">{formatMoney(fee, currency.value)}</span></div>
					{#if discount > 0}<div class="flex items-center justify-between gap-2 text-body-sm"><span class="text-on-surface-variant">Partner pass incentive</span><span class="font-code font-bold text-accent-emerald">−{formatMoney(discount, currency.value)}</span></div>{/if}
					<div class="flex items-center justify-between gap-2 border-t border-surface-glass-border pt-3"><span class="text-body-md font-semibold text-on-surface">Total payable</span><span class="font-display text-headline-md font-bold text-on-surface">{formatMoney(totalPayable, currency.value)}</span></div>
				</div>
				<div class="flex flex-col gap-1.5 border-t border-surface-glass-border pt-3 text-label-badge text-on-surface-variant"><span class="flex items-center gap-2"><Lock class="w-3.5 h-3.5 text-accent-emerald" />256-bit SSL encrypted checkout</span><span class="flex items-center gap-2"><ShieldCheck class="w-3.5 h-3.5 text-accent-emerald" />Dynamic HMAC anti-clone ticket</span><span class="flex items-center gap-2"><BadgeCheck class="w-3.5 h-3.5 text-accent-emerald" />Paystack &amp; Flutterwave rails</span></div>
			</section>

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
		<div class="fixed bottom-0 left-0 right-0 z-40 bg-surface-container-high/90 backdrop-blur-2xl p-space-md pb-safe shadow-2xl md:left-20">
			<div class="max-w-md mx-auto flex items-center justify-between gap-space-md">
				<div class="flex flex-col">
					<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Total Amount</span>
					<div class="flex items-baseline gap-1">
						<span class="font-display text-headline-lg-mobile text-on-surface font-bold tracking-tight">{totalPayable === 0 ? 'Free' : formatMoney(totalPayable, currency.value)}</span>
						<span class="text-body-sm text-on-surface-variant font-medium">({qty} {tier.name})</span>
					</div>
				</div>
				<button class="h-12 px-6 rounded-full bg-primary-fixed text-surface-base font-display text-body-md font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md hover:bg-white" onclick={checkout}>
					<span>Select & Checkout</span>
					<ArrowRight class="w-4.5 h-4.5" />
				</button>
			</div>
		</div>
	</div>
</main>
</div>

{#if showMessageDialog}
	<div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
		<button type="button" aria-label="Close message request dialog" class="absolute inset-0 bg-surface-base/80 backdrop-blur-sm" onclick={() => (showMessageDialog = false)}></button>
		<div role="dialog" aria-modal="true" aria-labelledby="message-request-title" class="relative z-10 w-full max-w-lg rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-6 shadow-2xl">
			<div class="flex items-start gap-3 pb-4">
				<span class="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0"><MessageSquare class="w-5 h-5" /></span>
				<div class="min-w-0">
					<h2 id="message-request-title" class="font-display text-headline-md text-on-surface">Message {event.organizer.name}</h2>
					<p class="text-body-sm text-on-surface-variant pt-1">Your first message is sent as a request about <span class="text-on-surface font-semibold">{event.title}</span>. The chat opens if the organizer accepts.</p>
				</div>
			</div>
			<form onsubmit={(e) => { e.preventDefault(); void sendMessageRequest(); }} class="flex flex-col gap-3">
				<label for="organizer-message" class="text-label-badge uppercase tracking-wider text-on-surface-variant">Your message</label>
				<textarea id="organizer-message" bind:value={messageDraft} maxlength="2000" rows="5" placeholder="Introduce yourself and tell the organizer what you’d like to discuss…" class="w-full resize-y min-h-28 rounded-xl border border-surface-glass-border bg-surface-base p-3.5 text-body-md text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary/50"></textarea>
				<div class="flex items-center justify-between gap-3 text-label-badge text-on-surface-variant"><span>Up to 2,000 characters</span><span>{messageDraft.length}/2000</span></div>
				{#if messageError}<p role="alert" class="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error">{messageError}</p>{/if}
				<div class="flex items-center justify-end gap-2 pt-1">
					<button type="button" class="h-10 px-4 rounded-full border border-surface-glass-border bg-surface-container-high text-body-sm font-semibold text-on-surface" onclick={() => (showMessageDialog = false)}>Cancel</button>
					<button type="submit" disabled={!messageDraft.trim() || messageSending} class="h-10 px-4 rounded-full bg-primary text-on-primary text-body-sm font-semibold disabled:opacity-50">{messageSending ? 'Sending…' : 'Send request'}</button>
				</div>
			</form>
		</div>
	</div>
{/if}
