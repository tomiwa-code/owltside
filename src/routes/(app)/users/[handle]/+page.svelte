<script lang="ts">
	import { BadgeCheck, Bell, Globe, Search, UserPlus, UserCheck, Users, Mic, CalendarDays, Crown } from '@lucide/svelte';

	import Avatar from '$components/Avatar.svelte';
	import Chip from '$components/Chip.svelte';
	import EventRow from '$components/EventRow.svelte';
	import Sheet from '$components/Sheet.svelte';
	import TopBar from '$components/TopBar.svelte';
	import { page } from '$app/state';
	import { follows, toggleIn } from '$lib/state/prefs.svelte';
	import { mockProfiles } from '$lib/data/mock-profiles';
	import { toast } from '$lib/state/toast.svelte';
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

</script>

<svelte:head><title>{profile.name} • Owltside</title></svelte:head>

<!-- ── Desktop console (md+) — mirrors app header + community profile ── -->
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
				<kbd class="{MONO} absolute right-3 text-on-surface-variant border border-surface-glass-border rounded px-1.5 py-0.5">⌘K</kbd>
			</span>
			<a href="/notifications" aria-label="Notifications" class="relative w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors shrink-0">
				<Bell class="w-4.5 h-4.5" />
				<span class="absolute top-2 right-2 w-2 h-2 rounded-full bg-secondary ring-2 ring-surface-base"></span>
			</a>
			<a href="/profile" aria-label="Your profile" class="shrink-0"><Avatar name={page.data.session?.handle ?? profile.name} color={profile.avatarColor} size="sm" /></a>
		</div>
	</header>

	<main class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-8 flex flex-col flex-1">
		<div class="mx-auto w-full max-w-3xl flex flex-col">
			<div class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden">
				<div class="relative w-full h-44 overflow-hidden">
					<div class="w-full h-full" style="background: linear-gradient(140deg, {profile.avatarColor}33 0%, #0b1326 80%), linear-gradient(#131b2e, #0b1120);"></div>
					<div class="absolute inset-0 bg-gradient-to-b from-transparent to-surface-container"></div>
				</div>
				<div class="px-6 pb-6 -mt-10 relative z-10 flex flex-col gap-4">
					<div class="flex items-end justify-between">
						<div class="w-20 h-20 rounded-full p-0.5 bg-surface">
							<Avatar name={profile.name} color={profile.avatarColor} size="xl" />
						</div>
						<button
							class="h-11 px-5 rounded-full flex items-center gap-2 text-body-sm font-semibold active:scale-95 transition-all shadow-md {following ? 'bg-surface-container-high text-on-surface' : 'bg-primary text-on-primary glow-primary'}"
							onclick={() => {
								const added = toggleIn(follows, profile.id);
								toast(added ? `Following ${profile.name}` : 'Unfollowed', 'info');
							}}
						>
							{#if following}<UserCheck class="w-4 h-4" /> Following{:else}<UserPlus class="w-4 h-4" /> Follow{/if}
						</button>
					</div>

					<div>
						<h1 class="font-display text-headline-lg text-on-surface tracking-tight flex items-center gap-2">
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
						<div class="flex flex-col gap-3 pt-2">
							<div class="flex items-center justify-between">
								<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">{heading}</span>
								<span class="text-label-badge text-outline-variant">{filtered.length} total</span>
							</div>
							<div class="flex gap-2 flex-wrap">
								<Chip label={`All · ${data.events.length}`} icon={CalendarDays} active={category === 'all'} onclick={() => (category = 'all')} />
								<Chip label={`Organized · ${organizedEvents.length}`} icon={Crown} active={category === 'organized'} onclick={() => (category = 'organized')} />
								<Chip label={`Event Roles · ${roleEvents.length}`} icon={Mic} active={category === 'roles'} onclick={() => (category = 'roles')} />
							</div>
						</div>

						{#if category === 'all'}
							{#if organizedEvents.length}
								<div class="flex flex-col gap-3 pt-2">
									<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Organized</span>
									<div class="grid md:grid-cols-2 gap-3">
										{#each organizedEvents as event (event.id)}
											{@const profileSpeaker = speakerFor(event)}
											<EventRow {event} roleLabel={profileSpeaker?.role ? `Event role · ${profileSpeaker.role}` : 'Organizer'} />
										{/each}
									</div>
								</div>
							{/if}
							<div class="flex flex-col gap-3 pt-2">
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
							<div class="flex flex-col gap-3 pt-2">
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
							<div class="flex flex-col gap-3 pt-2">
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
					{:else}
						<div class="flex flex-col gap-3 pt-2">
							<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Events & sessions</span>
							<p class="text-body-sm text-on-surface-variant">No events yet.</p>
							<p class="text-body-sm text-on-surface-variant bg-surface-container rounded-xl p-4 border border-surface-glass-border">
								No accepted event roles yet - when this member accepts a speaker invitation, the role will appear here for anyone viewing this profile.
							</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</main>
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

