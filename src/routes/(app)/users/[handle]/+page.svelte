<script lang="ts">
	import { BadgeCheck, Globe, UserPlus, UserCheck, Users, Mic, CalendarDays, Crown } from '@lucide/svelte';

	import Avatar from '$components/Avatar.svelte';
	import Chip from '$components/Chip.svelte';
	import EventRow from '$components/EventRow.svelte';
	import Sheet from '$components/Sheet.svelte';
	import TopBar from '$components/TopBar.svelte';
	import { follows, toggleIn } from '$lib/state/prefs.svelte';
	import { mockProfiles } from '$lib/data/mock-profiles';
	import { toast } from '$lib/state/toast.svelte';
	import type { EventItem } from '$lib/types';

	let { data } = $props();
	const profile = $derived(data.profile);
	const following = $derived(follows.value.includes(profile.id));

	type ProfileCategory = 'all' | 'organized' | 'roles';
	let category = $state('all' as ProfileCategory);
	let followersOpen = $state(false);
	let followingOpen = $state(false);
	let followersProfiles = $derived(mockProfiles.slice().reverse());
	let followingProfiles = $derived(mockProfiles.slice(0, 4));

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
</script>

<svelte:head><title>{profile.name} • Owltside</title></svelte:head>

<TopBar back title={`@${profile.handle}`} subtitle="Community profile" />

<main class="flex flex-col relative w-full pt-mobile-header pb-28 md:pb-16 bg-surface min-h-dvh">
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
	</div>
</Sheet>

