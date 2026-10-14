<script lang="ts">
	import { BadgeCheck, Globe, UserPlus, UserCheck } from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import EventRow from '$components/EventRow.svelte';
	import TopBar from '$components/TopBar.svelte';
	import { follows, toggleIn } from '$lib/state/prefs.svelte';
	import { toast } from '$lib/state/toast.svelte';

	let { data } = $props();
	const profile = $derived(data.profile);
	const following = $derived(follows.value.includes(profile.id));
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
					{#if profile.verified}
						<span class="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-md">
							<BadgeCheck class="w-4 h-4" />
						</span>
					{/if}
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
				<h1 class="font-display text-headline-lg-mobile text-on-surface tracking-tight">{profile.name}</h1>
				<p class="font-code text-label-code text-outline mt-0.5">@{profile.handle} • {profile.city ?? 'Somewhere loud'}</p>
				{#if profile.bio}<p class="text-body-md text-on-surface-variant mt-2">{profile.bio}</p>{/if}
				{#if profile.link}
					<span class="inline-flex items-center gap-1 text-label-badge text-tertiary mt-2"><Globe class="w-3.5 h-3.5" />{profile.link.replace('https://', '')}</span>
				{/if}
			</div>

			<div class="grid grid-cols-2 gap-2 bg-surface-container-low rounded-xl p-3 shadow-md">
				<div class="flex flex-col items-center">
					<span class="font-display text-headline-md text-primary font-semibold">{profile.followers.toLocaleString()}</span>
					<span class="text-label-badge text-on-surface-variant tracking-wider uppercase">Followers</span>
				</div>
				<div class="flex flex-col items-center">
					<span class="font-display text-headline-md text-on-surface font-semibold">{profile.following.toLocaleString()}</span>
					<span class="text-label-badge text-on-surface-variant tracking-wider uppercase">Following</span>
				</div>
			</div>

			{#if data.events.length}
				<div class="flex flex-col gap-space-xs pb-6">
					<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Events & sessions</span>
					{#each data.events as event (event.id)}
						<EventRow {event} />
					{/each}
				</div>
			{/if}
		</div>
	</div>
</main>
