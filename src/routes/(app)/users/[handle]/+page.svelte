<script lang="ts">
	import {
	BadgeCheck,
	Bell,
	BookmarkCheck,
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	Copy,
	Crown,
	Globe,
	Link2,
	Mic,
	QrCode,
	RefreshCw,
	Search,
	Settings2,
	Share2,
	ShieldCheck,
	UserCheck,
	UserPlus,
	Users,
	WifiOff
} from '@lucide/svelte';

	import Avatar from '$components/Avatar.svelte';
	import Chip from '$components/Chip.svelte';
	import EventRow from '$components/EventRow.svelte';
	import Sheet from '$components/Sheet.svelte';
	import TopBar from '$components/TopBar.svelte';
	import { page } from '$app/state';
	import { follows, toggleIn } from '$lib/state/prefs.svelte';
	import { mockProfiles } from '$lib/data/mock-profiles';
	import { toast } from '$lib/state/toast.svelte';
	import { fmtDate, fmtTime } from '$lib/utils/dates';
	import type { EventItem } from '$lib/types';

	let { data } = $props();
	const profile = $derived(data.profile);
	const isDemoMode = $derived(Boolean((data as { demoMode?: boolean }).demoMode ?? page.data.demoMode));
	const following = $derived(follows.value.includes(profile.id));

	type ProfileCategory = 'all' | 'organized' | 'roles';
	let category = $state('all' as ProfileCategory);
	let followersOpen = $state(false);
	let followingOpen = $state(false);
	let followersProfiles = $derived(isDemoMode && profile.followers > 0 ? mockProfiles.slice().reverse() : []);
	let followingProfiles = $derived(isDemoMode && profile.following > 0 ? mockProfiles.slice(0, 4) : []);

	const organizedEvents = $derived(data.events.filter((event) => event.organizer?.id === profile.id));
	const roleEvents = $derived(
		data.events.filter((event) => {
			if (event.organizer?.id === profile.id) return false;
			return event.speakers.some(
				(speaker) =>
					speaker.id === profile.id &&
					!speaker.displayOnly &&
					(!speaker.invited || speaker.inviteStatus === 'accepted')
			);
		})
	);

	const filtered = $derived(
		category === 'organized' ? organizedEvents : category === 'roles' ? roleEvents : data.events
	);

	const heading = $derived(
		category === 'organized' ? 'Organized Events' : category === 'roles' ? 'Event Roles' : 'Events & sessions'
	);

	function speakerFor(event: EventItem) {
		return event.speakers.find(
			(speaker) => speaker.id === profile.id && (!speaker.invited || speaker.inviteStatus === 'accepted')
		);
	}

	const MONO = 'font-code text-[11px] tracking-[0.12em] uppercase';
	const MONO_DESKTOP = 'font-code text-label-badge tracking-[0.14em] uppercase';

	// session avatar for header (logged-in user, never the visited profile)
	const session = $derived((page.data as { session?: typeof page.data.session }).session ?? (data as { session?: typeof page.data.session }).session ?? null);
	const sessionName = $derived(session?.name ?? profile.name);
	const sessionHandle = $derived(session?.handle ?? profile.handle);
	const sessionAvatar = $derived((session as { avatarUrl?: string | null })?.avatarUrl ?? null);
	const sessionAvatarColor = $derived((session as { avatarColor?: string | null })?.avatarColor ?? profile.avatarColor);

	// calendar state mirrors profile page but sourced from this profile's events
	let profileTab = $state<'calendar' | 'events'>('calendar');
	let monthOffset = $state(0);
	let selectedDay = $state<number | null>(null);
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth();
	const upcoming = $derived(
		[...data.events]
			.filter((e) => {
				const d = new Date(e.startsAt ?? (e as unknown as { startsAt: string }).startsAt);
				return !isNaN(d.getTime()) && d > now;
			})
			.sort((a, b) => new Date(a.startsAt ?? (a as unknown as { startsAt: string }).startsAt).getTime() - new Date(b.startsAt ?? (b as unknown as { startsAt: string }).startsAt).getTime())
	);
	// fall back to all events sorted if none upcoming
	const upcomingForCal = $derived(upcoming.length ? upcoming : [...data.events].sort((a,b)=> new Date(a.startsAt??'').getTime()-new Date(b.startsAt??'').getTime()));
	const view = $derived(new Date(year, month + monthOffset, 1));
	const viewLabel = $derived(view.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }));
	const viewFirst = $derived((view.getDay() + 6) % 7);
	const viewDays = $derived(new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate());
	const todayInView = $derived(view.getFullYear() === year && view.getMonth() === month);
	const activeDay = $derived(selectedDay ?? (todayInView ? now.getDate() : null));
	const passesOn = (d: number) =>
		upcomingForCal.filter((e) => {
			const s = new Date((e as unknown as { startsAt: string }).startsAt ?? (e as unknown as { date: string }).date ?? '');
			return s.getFullYear() === view.getFullYear() && s.getMonth() === view.getMonth() && s.getDate() === d;
		});
	const monthCount = $derived(
		upcomingForCal.filter((e) => {
			const s = new Date((e as unknown as { startsAt: string }).startsAt ?? (e as unknown as { date: string }).date ?? '');
			return s.getFullYear() === view.getFullYear() && s.getMonth() === view.getMonth();
		}).length
	);
	const daySchedule = $derived(activeDay ? passesOn(activeDay) : []);
	const activeLabel = $derived(
		activeDay ? fmtDate(new Date(view.getFullYear(), view.getMonth(), activeDay, 12).toISOString()) : ''
	);
	const vaultRows = $derived([
		{ icon: WifiOff, label: 'Offline Cache', value: 'Enabled' },
		{ icon: QrCode, label: 'Events On Device', value: String(data.events.length) },
		{ icon: ShieldCheck, label: 'Gate Biometrics', value: 'Active' },
		{ icon: RefreshCw, label: 'Last Vault Sync', value: '12m ago' }
	]);
	function shareProfile() {
		void navigator.clipboard?.writeText(`https://owltside.com/${profile.handle}`);
		toast('Profile link copied', 'success');
	}
	async function copyText(value: string, label: string) {
		try { await navigator.clipboard.writeText(value); toast(`${label} copied`, 'success'); } catch { toast(label, 'info'); }
	}


</script>

<svelte:head><title>{profile.name} • Owltside</title></svelte:head>

<!-- ── Desktop console (md+) — mirrors app header + community profile ── -->
<!-- ── Desktop (md+) — Profile & Pass Portfolio layout (mirrors /profile) but bound to visited profile data ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">
	<header class="sticky top-0 z-50 border-b border-surface-glass-border bg-surface-base/85 backdrop-blur-xl">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 h-16 flex items-center gap-5">
			<a href="/home" class="flex items-center gap-2.5 shrink-0">
				<span class="w-2 h-2 rounded-full bg-primary glow-primary"></span>
				<span class="font-display font-bold tracking-tight text-on-surface text-[17px]">OWLTSIDE</span>
			</a>
			<nav class="flex items-center gap-1" aria-label="Primary">
				{#each [['/home','Home'],['/explore','Explore'],['/tickets','Tickets'],['/organizer','Organizer']] as [href,label]}
					<a {href} class="px-3 h-9 rounded-lg flex items-center text-body-sm text-on-surface-variant hover:text-on-surface transition-colors">{label}</a>
				{/each}
			</nav>
			<div class="flex-1"></div>
			<span class="relative hidden lg:flex items-center w-72 h-10">
				<Search class="absolute left-3.5 w-4 h-4 text-outline-variant pointer-events-none" />
				<span class="w-full h-full rounded-full bg-surface-container-low border border-surface-glass-border pl-10 pr-12 flex items-center text-body-md text-outline-variant">Search events, gates, artists…</span>
				<kbd class="{MONO_DESKTOP} absolute right-3 text-on-surface-variant border border-surface-glass-border rounded px-1.5 py-0.5">⌘K</kbd>
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
				<Avatar name={sessionHandle} src={sessionAvatar} color={sessionAvatarColor} size="sm" />
			</a>
		</div>
	</header>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-10 pb-2 flex flex-wrap items-end justify-between gap-4">
		<div class="min-w-0">
			<span class="flex items-center gap-2 {MONO_DESKTOP} text-on-surface-variant">
				<span>Identity_Node</span>
				<span class="text-outline-variant">/</span>
				<span>Public_Profile</span>
			</span>
			<h1 class="font-display text-[30px] leading-9 font-bold tracking-tight text-on-surface mt-3">Profile & Pass Portfolio</h1>
			<p class="text-body-md text-on-surface-variant mt-2">Public identity, vault readiness and the pass calendar for {profile.name}.</p>
		</div>
		<div class="flex items-center gap-3">
			<a href="/settings" aria-label="Settings" class="w-10 h-10 rounded-lg bg-surface-container-high border border-surface-glass-border text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors">
				<Settings2 class="w-4 h-4" />
			</a>
			<button class="h-10 px-4 rounded-lg flex items-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors" onclick={shareProfile}>
				<Share2 class="w-4 h-4 text-on-surface-variant" /><span>Share Profile</span>
			</button>
			<button class="h-10 px-4 rounded-lg flex items-center gap-2 text-body-sm font-semibold active:scale-95 transition-all {following ? 'bg-surface-container-high text-on-surface border border-surface-glass-border' : 'bg-on-surface text-surface-base hover:opacity-90'}" onclick={() => { const added = toggleIn(follows, profile.id); toast(added ? `Following ${profile.name}` : 'Unfollowed', 'info'); }}>
				{#if following}<UserCheck class="w-4 h-4" /> Following{:else}<UserPlus class="w-4 h-4" /> Follow{/if}
			</button>
		</div>
	</div>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-8">
		<section class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden">
			<div class="relative h-32 overflow-hidden" style="background: linear-gradient(140deg, {profile.avatarColor} 0%, #1e1b4b 45%, #0b1326 100%);">
				<div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface-container"></div>
				<span class="absolute top-3 right-4 {MONO_DESKTOP} text-on-surface-variant">Node 0x7E3 • {profile.city ?? 'Somewhere loud'}</span>
			</div>
			<div class="px-6 pb-6 flex flex-wrap items-start gap-6 justify-between">
				<span class="flex items-start gap-5 -mt-10 relative min-w-0">
					<span class="relative shrink-0">
						<span class="block w-24 h-24 rounded-full overflow-hidden shadow-2xl p-0.5 bg-gradient-to-tr from-primary to-accent-emerald">
							<span class="block w-full h-full rounded-full bg-surface-container flex items-center justify-center">
								<Avatar name={profile.name} color={profile.avatarColor} size="xl" />
							</span>
						</span>
					</span>
					<span class="min-w-0 pt-1">
						<span class="flex items-center flex-wrap gap-2">
							<span class="font-display text-headline-lg text-on-surface tracking-tight">{profile.name}</span>
							{#if profile.verified}<BadgeCheck class="w-5 h-5 text-tertiary shrink-0" aria-label="Verified member" />{/if}
						</span>
						<span class="{MONO_DESKTOP} text-outline block mt-1.5">@{profile.handle} • {profile.city ?? 'Somewhere loud'}</span>
						{#if profile.bio}<span class="block text-body-md text-on-surface-variant mt-2 leading-relaxed max-w-xl">{profile.bio}</span>{/if}
						<span class="flex items-center gap-4 mt-2.5 flex-wrap">
							<span class="inline-flex items-center gap-1.5 {MONO_DESKTOP} text-tertiary"><Globe class="w-3.5 h-3.5" /> Owltside.com/{profile.handle}</span>
							{#if profile.link}<a href={profile.link} target="_blank" rel="noreferrer" class="inline-flex items-center gap-1.5 {MONO_DESKTOP} text-on-surface-variant hover:text-primary"><Link2 class="w-3.5 h-3.5" /> {profile.link.replace('https://','')}</a>{:else}<span class="inline-flex items-center gap-1.5 {MONO_DESKTOP} text-on-surface-variant"><Link2 class="w-3.5 h-3.5" /> @{profile.handle}</span>{/if}
						</span>
					</span>
				</span>
				<span class="flex items-center gap-3 flex-wrap">
					<span class="rounded-lg border border-surface-glass-border bg-surface-container-high/60 px-6 py-3 text-center">
						<span class="block font-display text-headline-md font-semibold text-primary">{data.events.length}</span>
						<span class="{MONO_DESKTOP} text-on-surface-variant block mt-0.5">Events</span>
					</span>
					<button type="button" onclick={() => (followingOpen = true)} class="rounded-lg border border-surface-glass-border bg-surface-container-high/60 px-6 py-3 text-center hover:bg-surface-container-high transition-colors text-left">
						<span class="block font-display text-headline-md font-semibold text-on-surface">{profile.following.toLocaleString()}</span>
						<span class="{MONO_DESKTOP} text-on-surface-variant block mt-0.5">Following</span>
					</button>
					<button type="button" onclick={() => (followersOpen = true)} class="rounded-lg border border-surface-glass-border bg-surface-container-high/60 px-6 py-3 text-center hover:bg-surface-container-high transition-colors text-left">
						<span class="block font-display text-headline-md font-semibold text-on-surface">{profile.followers.toLocaleString()}</span>
						<span class="{MONO_DESKTOP} text-on-surface-variant block mt-0.5">Followers</span>
					</button>
				</span>
			</div>
		</section>
	</div>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-5">
		<div role="tablist" aria-label="Profile sections" class="inline-flex items-center gap-1 rounded-full border border-surface-glass-border bg-surface-container p-1">
			<button type="button" role="tab" aria-selected={profileTab === 'calendar'} onclick={() => (profileTab = 'calendar')} class="h-10 px-4 rounded-full text-body-sm font-semibold flex items-center gap-2 transition-colors {profileTab === 'calendar' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}"><CalendarDays class="w-4 h-4" />Calendar</button>
			<button type="button" role="tab" aria-selected={profileTab === 'events'} onclick={() => (profileTab = 'events')} class="h-10 px-4 rounded-full text-body-sm font-semibold flex items-center gap-2 transition-colors {profileTab === 'events' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}"><BookmarkCheck class="w-4 h-4" />Events <span class="font-code text-label-badge">{data.events.length}</span></button>
		</div>
	</div>

	{#if profileTab === 'events'}
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-col gap-6">
			<div class="flex items-center justify-between">
				<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">{heading}</span>
				<span class="text-label-badge text-outline-variant">{filtered.length} total</span>
			</div>
			<div class="flex gap-2 flex-wrap">
				<Chip label={`All · ${data.events.length}`} icon={CalendarDays} active={category === 'all'} onclick={() => (category = 'all')} />
				<Chip label={`Organized · ${organizedEvents.length}`} icon={Crown} active={category === 'organized'} onclick={() => (category = 'organized')} />
				<Chip label={`Event Roles · ${roleEvents.length}`} icon={Mic} active={category === 'roles'} onclick={() => (category = 'roles')} />
			</div>
			{#if category === 'all'}
				{#if organizedEvents.length}
					<div class="flex flex-col gap-3">
						<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Organized</span>
						<div class="grid md:grid-cols-2 gap-3">
							{#each organizedEvents as event (event.id)}
								{@const profileSpeaker = speakerFor(event)}
								<EventRow {event} roleLabel={profileSpeaker?.role ? `Event role · ${profileSpeaker.role}` : 'Organizer'} />
							{/each}
						</div>
					</div>
				{/if}
				<div class="flex flex-col gap-3">
					<span class="flex items-center gap-1.5 text-label-badge text-on-surface-variant uppercase tracking-wider">
						<Mic class="w-3.5 h-3.5" /> Event Roles {#if roleEvents.length}<span class="text-outline-variant normal-case tracking-normal">· {roleEvents.length} accepted</span>{/if}
					</span>
					{#if roleEvents.length}
						<div class="grid md:grid-cols-2 gap-3">
							{#each roleEvents as event (event.id)}
								{@const profileSpeaker = speakerFor(event)}
								<EventRow {event} roleLabel={profileSpeaker?.role ? `Event role · ${profileSpeaker.role}` : 'Speaker'} />
							{/each}
						</div>
					{:else}
						<p class="text-body-sm text-on-surface-variant bg-surface-container rounded-xl p-4 border border-surface-glass-border">
							No accepted event roles yet - when {profile.name} accepts a speaker invitation, the role will appear here for anyone viewing this profile.
						</p>
					{/if}
				</div>
			{:else if category === 'organized'}
				<div class="flex flex-col gap-3">
					{#if organizedEvents.length}
						<div class="grid md:grid-cols-2 gap-3">
							{#each organizedEvents as event (event.id)}
								{@const profileSpeaker = speakerFor(event)}
								<EventRow {event} roleLabel={profileSpeaker?.role ? `Event role · ${profileSpeaker.role}` : 'Organizer'} />
							{/each}
						</div>
					{:else}
						<p class="text-body-sm text-on-surface-variant bg-surface-container rounded-xl p-4 border border-surface-glass-border">No organized events yet.</p>
					{/if}
				</div>
			{:else}
				<div class="flex flex-col gap-3">
					{#if roleEvents.length}
						<div class="grid md:grid-cols-2 gap-3">
							{#each roleEvents as event (event.id)}
								{@const profileSpeaker = speakerFor(event)}
								<EventRow {event} roleLabel={profileSpeaker?.role ? `Event role · ${profileSpeaker.role}` : 'Speaker'} />
							{/each}
						</div>
					{:else}
						<p class="text-body-sm text-on-surface-variant bg-surface-container rounded-xl p-4 border border-surface-glass-border">
							No accepted event roles yet - when {profile.name} accepts a speaker invitation, the role will appear here for anyone viewing this profile.
						</p>
					{/if}
				</div>
			{/if}
		</div>
	{:else}
	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
		<div class="flex flex-col gap-6 min-w-0">
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<span class="flex items-center gap-2.5">
						<CalendarDays class="w-4.5 h-4.5 text-primary" />
						<span class="font-display text-headline-md text-on-surface">{viewLabel}</span>
					</span>
					<span class="flex items-center gap-2">
						<button class="w-9 h-9 rounded-md bg-surface-container-high border border-surface-glass-border text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors" aria-label="Previous month" onclick={() => { monthOffset -= 1; selectedDay = null; }}>
							<ChevronLeft class="w-4 h-4" />
						</button>
						<button class="h-9 px-3 rounded-md bg-surface-container-high border border-surface-glass-border {MONO_DESKTOP} text-on-surface-variant hover:text-on-surface transition-colors" onclick={() => { monthOffset = 0; selectedDay = null; }}>
							Today
						</button>
						<button class="w-9 h-9 rounded-md bg-surface-container-high border border-surface-glass-border text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors" aria-label="Next month" onclick={() => { monthOffset += 1; selectedDay = null; }}>
							<ChevronRight class="w-4 h-4" />
						</button>
					</span>
				</div>
				<div class="grid grid-cols-7 gap-1.5 text-center {MONO_DESKTOP} text-outline py-2 mt-3">
					{#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as d}<span>{d}</span>{/each}
				</div>
				<div class="grid grid-cols-7 gap-1.5">
					{#each Array(viewFirst) as _, i (i)}<span></span>{/each}
					{#each Array(viewDays) as _, i (i)}
						{@const day = i + 1}
						{@const evs = passesOn(day)}
						{@const isSel = activeDay === day}
						{@const isToday = todayInView && now.getDate() === day}
						<button
							class="h-14 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors {isSel ? 'bg-primary text-on-primary' : evs.length ? 'bg-surface-container-high/70 text-on-surface hover:bg-surface-container-high' : 'bg-surface-container-high/40 text-on-surface-variant hover:bg-surface-container-high/60'} {isToday && !isSel ? 'ring-1 ring-primary/50' : ''}"
							onclick={() => (selectedDay = day)}
							aria-label="{viewLabel} day {day}{evs.length ? `, ${evs.length} events` : ''}"
						>
							<span class="text-body-sm {isSel ? 'font-bold' : ''}">{day}</span>
							{#if evs.length}<span class="w-1.5 h-1.5 rounded-full {isSel ? 'bg-on-primary' : 'bg-primary'}"></span>{/if}
						</button>
					{/each}
				</div>
				<div class="flex items-center gap-4 mt-4 pt-3 border-t border-surface-glass-border {MONO_DESKTOP} text-on-surface-variant">
					<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-primary"></span> Event day</span>
					<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ring-1 ring-primary/60"></span> Today</span>
					<span class="ml-auto">{monthCount} Events This Month</span>
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<span class="flex items-center gap-2.5">
						<span class="w-2 h-2 rounded-full bg-primary glow-primary"></span>
						<span class="font-display text-headline-md text-on-surface">Day Schedule{activeLabel ? ` — ${activeLabel}` : ''}</span>
					</span>
					<span class="{MONO_DESKTOP} text-on-surface-variant">{daySchedule.length} Events</span>
				</div>
				<div class="flex flex-col gap-2.5 mt-4">
					{#each daySchedule as event (event.id)}
						{@const profileSpeaker = speakerFor(event)}
						<a href="/events/{event.id}" class="flex items-center gap-4 rounded-lg border border-surface-glass-border bg-surface-container-high/50 p-3 hover:bg-surface-container-high transition-colors">
							<span class="{MONO_DESKTOP} text-on-surface shrink-0 w-16">{fmtTime((event as unknown as { startsAt: string }).startsAt ?? new Date().toISOString())}</span>
							<span class="flex-1 min-w-0">
								<span class="block text-body-md font-semibold text-on-surface truncate">{event.title}</span>
								<span class="block text-body-sm text-on-surface-variant truncate">{event.venue ?? profile.city} · {profileSpeaker?.role ?? (event.organizer?.id===profile.id ? 'Organizer' : 'Speaker')}</span>
							</span>
							<span class="{MONO_DESKTOP} px-2 py-1 rounded bg-surface-container-high border border-surface-glass-border text-on-surface-variant shrink-0">{event.category ?? 'Event'}</span>
							<ChevronRight class="w-4 h-4 text-outline-variant shrink-0" />
						</a>
					{:else}
						<p class="text-body-sm text-on-surface-variant py-6 text-center">No events on this day — pick a marked date or browse the events tab.</p>
					{/each}
				</div>
			</section>
		</div>

		<div class="flex flex-col gap-6 min-w-0">
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Next Up</h2>
					<span class="{MONO_DESKTOP} text-on-surface-variant">{upcomingForCal.length} Upcoming</span>
				</div>
				<div class="flex flex-col gap-2.5 mt-4">
					{#each upcomingForCal.slice(0, 4) as event (event.id)}
						{@const d = new Date((event as unknown as { startsAt: string }).startsAt ?? '')}
						<a href="/events/{event.id}" class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5 hover:bg-surface-container-high transition-colors">
							<span class="w-10 h-10 rounded-md bg-surface-container-highest border border-surface-glass-border flex flex-col items-center justify-center shrink-0">
								<span class="font-code text-[9px] tracking-[0.14em] text-on-surface-variant uppercase">{isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-NG', { month: 'short' })}</span>
								<span class="font-display text-body-sm font-bold text-on-surface leading-4">{isNaN(d.getTime()) ? '•' : d.getDate()}</span>
							</span>
							<span class="flex-1 min-w-0">
								<span class="block text-body-sm font-medium text-on-surface truncate">{event.title}</span>
								<span class="block text-xs text-on-surface-variant truncate">{isNaN(d.getTime()) ? '' : fmtDate(d.toISOString())} • {event.venue ?? profile.city}</span>
							</span>
							<ChevronRight class="w-4 h-4 text-outline-variant shrink-0" />
						</a>
					{:else}
						<p class="text-body-sm text-on-surface-variant">No upcoming events for {profile.name}.</p>
					{/each}
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Vault Readiness</h2>
					<span class="{MONO_DESKTOP} text-on-surface-variant">Local_Cache</span>
				</div>
				<div class="flex flex-col gap-2.5 mt-4">
					{#each vaultRows as row (row.label)}
						{@const VIcon = row.icon}
						<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
							<span class="w-8 h-8 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0">
								<VIcon class="w-4 h-4 text-on-surface-variant" />
							</span>
							<span class="flex-1 text-body-sm font-medium text-on-surface">{row.label}</span>
							<span class="{MONO_DESKTOP} text-accent-emerald">{row.value}</span>
						</div>
					{/each}
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Identity Links</h2>
					<span class="{MONO_DESKTOP} text-on-surface-variant">Public_DNS</span>
				</div>
				<div class="flex flex-col gap-2.5 mt-4">
					<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
						<Globe class="w-4 h-4 text-tertiary shrink-0" />
						<span class="flex-1 min-w-0 {MONO_DESKTOP} text-on-surface truncate">Owltside.com/{profile.handle}</span>
						<button class="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors shrink-0" aria-label="Copy profile link" onclick={() => copyText(`https://owltside.com/${profile.handle}`, 'Profile link')}>
							<Copy class="w-3.5 h-3.5" />
						</button>
					</div>
					<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
						<Link2 class="w-4 h-4 text-on-surface-variant shrink-0" />
						<span class="flex-1 min-w-0 {MONO_DESKTOP} text-on-surface truncate">@{profile.handle}</span>
						<button class="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors shrink-0" aria-label="Copy handle" onclick={() => copyText(`@${profile.handle}`, 'Handle')}>
							<Copy class="w-3.5 h-3.5" />
						</button>
					</div>
					<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
						<ShieldCheck class="w-4 h-4 text-accent-emerald shrink-0" />
						<span class="flex-1 min-w-0 text-body-sm text-on-surface truncate">{profile.link ?? `No external link`}</span>
						<span class="{MONO_DESKTOP} px-2 py-0.5 rounded text-accent-emerald bg-accent-emerald/10 border border-accent-emerald/20 shrink-0">Verified</span>
					</div>
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<h2 class="font-display text-headline-md text-on-surface">Quick Routes</h2>
				<div class="flex flex-col gap-2.5 mt-4">
					{#each [['/tickets', 'Ticket Wallet & Passes'],['/organizer', 'Organizer Console'],['/settings', 'Settings & Identity']] as [href, label]}
						<a {href} class="flex items-center justify-between gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5 hover:bg-surface-container-high transition-colors">
							<span class="text-body-sm font-medium text-on-surface">{label}</span>
							<ChevronRight class="w-4 h-4 text-outline-variant shrink-0" />
						</a>
					{/each}
				</div>
			</section>
		</div>
	</div>
	{/if}
	<footer class="mt-4 border-t border-surface-glass-border">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-col lg:flex-row items-center justify-between gap-3">
			<span class="flex items-center gap-3">
				<span class="font-display font-bold text-on-surface tracking-tight">OWLTSIDE</span>
				<span class="w-px h-4 bg-outline-variant/40"></span>
				<span class="{MONO_DESKTOP} text-on-surface-variant">Event Ticketing Architecture</span>
			</span>
			<span class="flex items-center gap-5">
				<span class="flex items-center gap-1.5 {MONO_DESKTOP} text-on-surface-variant">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
					System Status: 99.98% Optimal
				</span>
				<span class="{MONO_DESKTOP} text-on-surface-variant">© {new Date().getFullYear()} Owltside Protocol</span>
			</span>
		</div>
	</footer>
</div>


<!-- ── Mobile (unchanged layout, now md:hidden) ── -->
<div class="md:hidden flex flex-col min-h-dvh bg-surface">
<TopBar back title={`@${profile.handle}`} subtitle="Community profile" />

<main class="flex flex-col relative w-full pt-mobile-header pb-28 bg-surface min-h-dvh">
	<div class="flex flex-col w-full md:max-w-3xl md:mx-auto">
		<div class="relative w-full h-36 overflow-hidden">
			<div class="w-full h-full" style="background: linear-gradient(140deg, {profile.avatarColor}33 0%, #0b1326 80%), linear-gradient(#131b2e, #0b1120);"></div>
			<div class="absolute inset-0 bg-gradient-to-b from-transparent to-surface"></div>
		</div>
		<div class="px-gutter -mt-10 relative z-10 flex flex-col gap-space-md">
			<div class="flex items-end justify-between">
				<div class="relative">
					<div class="w-20 h-20 rounded-full p-0.5 bg-surface">
						<Avatar name={profile.name} color={profile.avatarColor} size="xl" />
					</div>
				</div>
				<button
					class="h-11 px-5 rounded-full flex items-center gap-2 text-body-sm font-semibold active:scale-95 transition-all shadow-md
						{following ? 'bg-surface-container-high text-on-surface' : 'bg-primary text-on-primary glow-primary'}"
					onclick={() => {
						const added = toggleIn(follows, profile.id);
						toast(added ? `Following ${profile.name}` : 'Unfollowed', 'info');
					}}
				>
					{#if following}<UserCheck class="w-4 h-4" /> Following{:else}<UserPlus class="w-4 h-4" /> Follow{/if}
				</button>
			</div>

			<div>
				<h1 class="font-display text-headline-lg-mobile text-on-surface tracking-tight flex items-center gap-2">
					{profile.name}
					{#if profile.verified}<BadgeCheck class="w-5 h-5 text-tertiary shrink-0" aria-label="Verified member" />{/if}
				</h1>
				<p class="font-code text-label-code text-outline mt-0.5">@{profile.handle} • {profile.city ?? 'Somewhere loud'}</p>
				{#if profile.bio}<p class="text-body-md text-on-surface-variant mt-2">{profile.bio}</p>{/if}
				{#if profile.link}
					<span class="inline-flex items-center gap-1 text-label-badge text-tertiary mt-2"><Globe class="w-3.5 h-3.5" />{profile.link.replace('https://', '')}</span>
				{/if}
			</div>

			<div class="grid grid-cols-2 gap-2 bg-surface-container-low rounded-xl p-3 shadow-md">
				<button type="button" onclick={() => (followersOpen = true)} class="flex flex-col items-center rounded-lg hover:bg-surface-container transition-colors py-1 active:scale-[0.98]">
					<span class="font-display text-headline-md text-primary font-semibold">{profile.followers.toLocaleString()}</span>
					<span class="text-label-badge text-on-surface-variant tracking-wider uppercase">Followers</span>
				</button>
				<button type="button" onclick={() => (followingOpen = true)} class="flex flex-col items-center rounded-lg hover:bg-surface-container transition-colors py-1 active:scale-[0.98]">
					<span class="font-display text-headline-md text-on-surface font-semibold">{profile.following.toLocaleString()}</span>
					<span class="text-label-badge text-on-surface-variant tracking-wider uppercase">Following</span>
				</button>
			</div>

			{#if data.events.length}
				<div class="flex flex-col gap-space-xs">
					<div class="flex items-center justify-between">
						<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">{heading}</span>
						<span class="text-label-badge text-outline-variant">{filtered.length} total</span>
					</div>
					<div class="flex gap-2 overflow-x-auto pb-1 -mx-gutter px-gutter scrollbar-none">
						<Chip label={`All · ${data.events.length}`} icon={CalendarDays} active={category === 'all'} onclick={() => (category = 'all')} />
						<Chip label={`Organized · ${organizedEvents.length}`} icon={Crown} active={category === 'organized'} onclick={() => (category = 'organized')} />
						<Chip label={`Event Roles · ${roleEvents.length}`} icon={Mic} active={category === 'roles'} onclick={() => (category = 'roles')} />
					</div>
				</div>

				{#if category === 'all'}
					{#if organizedEvents.length}
						<div class="flex flex-col gap-space-xs pb-2">
							<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Organized</span>
							{#each organizedEvents as event (event.id)}
								{@const profileSpeaker = speakerFor(event)}
								<EventRow {event} roleLabel={profileSpeaker?.role ? `Event role · ${profileSpeaker.role}` : 'Organizer'} />
							{/each}
						</div>
					{/if}
					<div class="flex flex-col gap-space-xs pb-6">
						<span class="flex items-center gap-1.5 text-label-badge text-on-surface-variant uppercase tracking-wider">
							<Mic class="w-3.5 h-3.5" /> Event Roles {#if roleEvents.length}<span class="text-outline-variant normal-case tracking-normal">· {roleEvents.length} accepted</span>{/if}
						</span>
						{#if roleEvents.length}
							{#each roleEvents as event (event.id)}
								{@const profileSpeaker = speakerFor(event)}
								<EventRow {event} roleLabel={profileSpeaker?.role ? `Event role · ${profileSpeaker.role}` : 'Speaker'} />
							{/each}
						{:else}
							<p class="text-body-sm text-on-surface-variant bg-surface-container rounded-xl p-4 border border-surface-glass-border">
								No accepted event roles yet - when {profile.name} accepts a speaker invitation, the role will appear here for anyone viewing this profile.
							</p>
						{/if}
					</div>
				{:else if category === 'organized'}
					<div class="flex flex-col gap-space-xs pb-6">
						{#if organizedEvents.length}
							{#each organizedEvents as event (event.id)}
								{@const profileSpeaker = speakerFor(event)}
								<EventRow {event} roleLabel={profileSpeaker?.role ? `Event role · ${profileSpeaker.role}` : 'Organizer'} />
							{/each}
						{:else}
							<p class="text-body-sm text-on-surface-variant bg-surface-container rounded-xl p-4 border border-surface-glass-border">No organized events yet.</p>
						{/if}
					</div>
				{:else}
					<div class="flex flex-col gap-space-xs pb-6">
						{#if roleEvents.length}
							{#each roleEvents as event (event.id)}
								{@const profileSpeaker = speakerFor(event)}
								<EventRow {event} roleLabel={profileSpeaker?.role ? `Event role · ${profileSpeaker.role}` : 'Speaker'} />
							{/each}
						{:else}
							<p class="text-body-sm text-on-surface-variant bg-surface-container rounded-xl p-4 border border-surface-glass-border">
								No accepted event roles yet - when {profile.name} accepts a speaker invitation, the role will appear here for anyone viewing this profile.
							</p>
						{/if}
					</div>
				{/if}
			{:else}
				<div class="flex flex-col gap-space-xs pb-6">
					<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Events & sessions</span>
					<p class="text-body-sm text-on-surface-variant">No events yet.</p>
					<div class="flex gap-2 overflow-x-auto pb-1 -mx-gutter px-gutter scrollbar-none">
						<Chip label="All · 0" icon={CalendarDays} active={category === 'all'} onclick={() => (category = 'all')} />
						<Chip label="Event Roles · 0" icon={Mic} active={category === 'roles'} onclick={() => (category = 'roles')} />
					</div>
					<p class="text-body-sm text-on-surface-variant bg-surface-container rounded-xl p-4 border border-surface-glass-border">
						No accepted event roles yet - when this member accepts a speaker invitation, the role will appear here for anyone viewing this profile.
					</p>
				</div>
			{/if}
		</div>
	</div>
</main>
</div>

<Sheet open={followersOpen} title="Followers • {profile.followers.toLocaleString()}" close={() => (followersOpen = false)}>
	<div class="flex flex-col gap-3 pt-2">
		<p class="text-body-sm text-on-surface-variant flex items-center gap-1.5"><Users class="w-4 h-4" /> People following {profile.name}</p>
		{#each followersProfiles as prof (prof.id)}
			<a href="/users/{prof.handle}" onclick={() => (followersOpen = false)} class="flex items-center gap-3 rounded-xl border border-surface-glass-border bg-surface-container-high/40 p-3 hover:bg-surface-container-high transition-colors">
				<Avatar name={prof.name} color={prof.avatarColor} size="md" />
				<span class="flex-1 min-w-0">
					<span class="block text-body-md font-semibold text-on-surface truncate flex items-center gap-1">{prof.name} {#if prof.verified}<BadgeCheck class="w-3.5 h-3.5 text-tertiary shrink-0" />{/if}</span>
					<span class="block text-body-sm text-on-surface-variant truncate">@{prof.handle} • {prof.city}</span>
				</span>
				<button type="button" class="text-label-badge px-3 py-1.5 rounded-full bg-primary text-on-primary font-semibold shrink-0" onclick={(e) => { e.preventDefault(); toggleIn(follows, prof.id); }}>{follows.value.includes(prof.id) ? 'Following' : 'Follow'}</button>
			</a>
		{/each}
		{#if followersProfiles.length === 0}
			<p class="text-body-sm text-on-surface-variant text-center py-6">No followers yet.</p>
		{/if}
	</div>
</Sheet>

<Sheet open={followingOpen} title="Following • {profile.following.toLocaleString()}" close={() => (followingOpen = false)}>
	<div class="flex flex-col gap-3 pt-2">
		<p class="text-body-sm text-on-surface-variant flex items-center gap-1.5"><Users class="w-4 h-4" /> People followed by {profile.name}</p>
		{#each followingProfiles as prof (prof.id)}
			<a href="/users/{prof.handle}" onclick={() => (followingOpen = false)} class="flex items-center gap-3 rounded-xl border border-surface-glass-border bg-surface-container-high/40 p-3 hover:bg-surface-container-high transition-colors">
				<Avatar name={prof.name} color={prof.avatarColor} size="md" />
				<span class="flex-1 min-w-0">
					<span class="block text-body-md font-semibold text-on-surface truncate flex items-center gap-1">{prof.name} {#if prof.verified}<BadgeCheck class="w-3.5 h-3.5 text-tertiary shrink-0" />{/if}</span>
					<span class="block text-body-sm text-on-surface-variant truncate">@{prof.handle} • {prof.city}</span>
				</span>
				<button type="button" class="text-label-badge px-3 py-1.5 rounded-full bg-primary text-on-primary font-semibold shrink-0" onclick={(e) => { e.preventDefault(); toggleIn(follows, prof.id); }}>{follows.value.includes(prof.id) ? 'Following' : 'Follow'}</button>
			</a>
		{/each}
		{#if followingProfiles.length === 0}
			<p class="text-body-sm text-on-surface-variant text-center py-6">Not following anyone yet.</p>
		{/if}
	</div>
</Sheet>

