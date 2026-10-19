<script lang="ts">
	import { page, navigating } from '$app/state';
	import { goto } from '$app/navigation';
	import { Bell, MessageSquare, Search, Settings2 } from '@lucide/svelte';
	import Avatar from './Avatar.svelte';
	import { profileAppearance } from '$lib/state/profile.svelte';
	import { queryClient, useQuery } from '$lib/state/query.svelte';
	import type { Conversation, MessageRequest, NotificationItem } from '$lib/types';
	let search = $state('');
	const profile = $derived(page.data.currentProfile);
	const session = $derived(page.data.session);
	const photo = $derived(profileAppearance.value.ownerId === session?.userId ? profileAppearance.value.avatarData || profile?.avatarUrl || session?.avatarUrl : profile?.avatarUrl || session?.avatarUrl);
	const nav = [{ href: '/home', label: 'Home' }, { href: '/explore', label: 'Explore' }, { href: '/tickets', label: 'Tickets' }, { href: '/organizer', label: 'Organizer' }];
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		await goto(search.trim() ? `/explore?q=${encodeURIComponent(search.trim())}` : '/explore');
	}

	// Live badge counts — poll the same keys used by the dedicated pages so the
	// header stays in sync without extra backend calls. Fall back to the
	// SSR-provided page.data values until the first fetch resolves.
	const notificationsQuery = useQuery<NotificationItem[]>(
		'notifications:mine',
		async () => (await fetch('/api/notifications')).json(),
		{ staleTime: 15_000, refetchInterval: 30_000, enabled: !!page.data.session },
		undefined
	);
	const conversationsQuery = useQuery<Conversation[]>(
		'conversations:mine',
		async () => (await fetch('/api/conversations')).json(),
		{ staleTime: 15_000, refetchInterval: 20_000, enabled: !!page.data.session },
		undefined
	);
	const requestsQuery = useQuery<MessageRequest[]>(
		'message-requests:mine',
		async () => {
			const r = await fetch('/api/message-requests');
			return r.ok ? await r.json() : [];
		},
		{ staleTime: 10_000, refetchInterval: 20_000, enabled: !!page.data.session },
		undefined
	);

	const unreadCount = $derived(
		notificationsQuery.data ? notificationsQuery.data.filter((n) => !n.read).length : (page.data.unread ?? 0)
	);
	const inboxUnreadCount = $derived.by(() => {
		if (conversationsQuery.data !== undefined || requestsQuery.data !== undefined) {
			const convoUnread = (conversationsQuery.data ?? []).reduce((sum, c) => sum + (c.unread ?? 0), 0);
			const reqCount = requestsQuery.data?.length ?? 0;
			return convoUnread + reqCount;
		}
		return page.data.inboxUnread ?? 0;
	});

	const formatBadge = (n: number) => (n > 99 ? '99+' : String(n));

	/**
	 * The notifications screen acknowledges everything as it opens, so clear the
	 * shared cache at click time too: the badge disappears on the tap instead of
	 * flashing until the next poll/paint.
	 */
	function clearNotificationBadge() {
		const items = notificationsQuery.data;
		if (!items?.some((n) => !n.read)) return;
		queryClient.set(
			'notifications:mine',
			items.map((n) => (n.read ? n : { ...n, read: true }))
		);
		// Persist too, in case the navigation is interrupted before the hub mounts.
		void fetch('/api/notifications/read', { method: 'POST' }).catch(() => {});
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
		<a href="/notifications" onclick={clearNotificationBadge} aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'} class="relative w-9 h-10 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors">
			<Bell class="w-5 h-5" />
			{#if unreadCount > 0}
				<span
					class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center leading-none border-2 border-surface pointer-events-none shadow-sm"
					aria-hidden="true"
				>
					{formatBadge(unreadCount)}
				</span>
			{/if}
		</a>
		<a href="/inbox" aria-label={inboxUnreadCount > 0 ? `Inbox, ${inboxUnreadCount} unread` : 'Inbox'} class="relative w-9 h-10 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors">
			<MessageSquare class="w-5 h-5" />
			{#if inboxUnreadCount > 0}
				<span
					class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center leading-none border-2 border-surface pointer-events-none shadow-sm"
					aria-hidden="true"
				>
					{formatBadge(inboxUnreadCount)}
				</span>
			{/if}
		</a>
		<a href="/settings" aria-label="Settings" class="hidden sm:block text-on-surface-variant"><Settings2 class="w-5 h-5" /></a>
		<a href="/profile" aria-label="Your profile"><Avatar name={profile?.name ?? session?.name ?? 'Guest'} src={photo} size="sm" /></a>
	</div>
	{#if navigating.to}<div class="h-0.5 bg-primary animate-pulse" role="status" aria-label="Loading page"></div>{/if}
</header>
