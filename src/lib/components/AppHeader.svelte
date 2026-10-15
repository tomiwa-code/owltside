<script lang="ts">
	import { page, navigating } from '$app/state';
	import { goto } from '$app/navigation';
	import { Bell, MessageSquare, Search, Settings2 } from '@lucide/svelte';
	import Avatar from './Avatar.svelte';
	import { profileAppearance } from '$lib/state/profile.svelte';
	let search = $state('');
	const profile = $derived(page.data.currentProfile);
	const session = $derived(page.data.session);
	const photo = $derived(profileAppearance.value.ownerId === session?.userId ? profileAppearance.value.avatarData || profile?.avatarUrl || session?.avatarUrl : profile?.avatarUrl || session?.avatarUrl);
	const nav = [{ href: '/home', label: 'Home' }, { href: '/explore', label: 'Explore' }, { href: '/tickets', label: 'Tickets' }, { href: '/organizer', label: 'Organizer' }];
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		await goto(search.trim() ? `/explore?q=${encodeURIComponent(search.trim())}` : '/explore');
	}
</script>
<header class="fixed top-0 inset-x-0 z-50 border-b border-surface-glass-border bg-surface/90 backdrop-blur-xl pt-safe">
	<div class="mx-auto max-w-[1400px] h-16 px-gutter md:px-6 xl:px-10 flex items-center gap-3 md:gap-5">
		<a href="/home" aria-label="Owltside home" class="shrink-0"><img src="/logo.png" alt="Owltside logo" class="h-5 md:h-6 w-auto" /></a>
		<nav class="hidden md:flex items-center gap-1" aria-label="Primary">
			{#each nav as item}
				{#if item.href !== '/organizer' || page.data.operatingIdentity === 'organizer'}
					{@const active = page.url.pathname === item.href || page.url.pathname.startsWith(item.href + '/')}
					<a href={item.href} aria-current={active ? 'page' : undefined} class="px-3 py-2 rounded-lg text-body-sm {active ? 'bg-surface-container font-semibold' : 'text-on-surface-variant hover:text-on-surface'}">{item.label}</a>
				{/if}
			{/each}
		</nav>
		<div class="flex-1"></div>
		<form class="hidden lg:block relative w-72" onsubmit={submit}>
			<Search class="absolute left-3 top-3 w-4 h-4 text-on-surface-variant" />
			<input type="search" aria-label="Search events, venues and users" placeholder="Search events, venues, users…" bind:value={search} class="w-full h-10 rounded-full border border-surface-glass-border bg-surface-container-low pl-10 pr-3 text-body-sm" />
		</form>
		<a href="/explore" aria-label="Search" class="lg:hidden text-on-surface-variant"><Search class="w-5 h-5" /></a>
		<a href="/notifications" aria-label="Notifications" class="relative w-9 h-10 flex items-center justify-center text-on-surface-variant">
			<Bell class="w-5 h-5" />
			{#if page.data.unread > 0}<span class="absolute top-2 right-1 w-2 h-2 rounded-full bg-secondary"></span>{/if}
		</a>
		<a href="/inbox" aria-label="Inbox" class="text-on-surface-variant"><MessageSquare class="w-5 h-5" /></a>
		<a href="/settings" aria-label="Settings" class="hidden sm:block text-on-surface-variant"><Settings2 class="w-5 h-5" /></a>
		<a href="/profile" aria-label="Your profile"><Avatar name={profile?.name ?? session?.name ?? 'Guest'} src={photo} size="sm" /></a>
	</div>
	{#if navigating.to}<div class="h-0.5 bg-primary animate-pulse" role="status" aria-label="Loading page"></div>{/if}
</header>
