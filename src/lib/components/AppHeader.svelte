<script lang="ts">
	import { page, navigating } from '$app/state';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { createAppQuery } from '$lib/query/create-query.svelte';
	import { Bell, MessageSquare, Search, Settings2 } from '@lucide/svelte';
	import Avatar from './Avatar.svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import { profileAppearance } from '$lib/state/profile.svelte';
	import { appSettings } from '$lib/state/settings.svelte';
	import { queryClient } from '$lib/query/cache';
	import { queryKeys } from '$lib/query/keys';
	import {
		badgesQueryOptions,
		conversationsQueryOptions,
		messageRequestsQueryOptions,
		notificationsQueryOptions
	} from '$lib/query/options';
	import {
		notifyUnreadInboxItems,
		notifyUnreadStreamItems,
		syncPushSubscriptionIfGranted
	} from '$lib/push.client';
	import { UNREAD_BADGE_CLASS, formatCount } from '$lib/utils/badges';
	import type { BadgeCounts, Conversation, MessageRequest, NotificationItem } from '$lib/types';

	let search = $state('');
	const profile = $derived(page.data.currentProfile);
	const session = $derived(page.data.session);
	const photo = $derived(profileAppearance.value.ownerId === session?.userId ? profileAppearance.value.avatarData || profile?.avatarUrl || session?.avatarUrl : profile?.avatarUrl || session?.avatarUrl);
	const nav = [{ href: '/home', label: 'Home' }, { href: '/explore', label: 'Explore' }, { href: '/tickets', label: 'Tickets' }, { href: '/organizer', label: 'Organizer' }];
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		await goto(search.trim() ? `/explore?q=${encodeURIComponent(search.trim())}` : '/explore');
	}

	const signedIn = $derived(!!session);

	// ── Header data ───────────────────────────────────────────────────────────
	// TanStack Query owns these four caches. The counters are seeded from the
	// server-rendered layout payload, so the badge paints correctly without a
	// request on mount; the lists are shared with the inbox/hub screens (same
	// keys), and the Realtime bridge patches them as events arrive. There is no
	// polling here anymore — only a slow fallback when no socket exists (demo).
	const badges = createAppQuery(() => ({
		...badgesQueryOptions(
			session
				? {
						unread: page.data.unread,
						inboxUnread: page.data.inboxUnread,
						// The pending-request count comes from the shared requests list;
						// the seeded value only fills the type until it loads.
						requests: 0
					}
				: undefined
		),
		enabled: browser && signedIn
	}));

	const notificationsQuery = createAppQuery(() => ({
		...notificationsQueryOptions(),
		// The notifications hub seeds the same key from its server load.
		enabled: browser && signedIn
	}));

	const conversationsQuery = createAppQuery(() => ({
		...conversationsQueryOptions(),
		enabled: browser && signedIn
	}));

	const requestsQuery = createAppQuery(() => ({
		...messageRequestsQueryOptions(),
		enabled: browser && signedIn
	}));

	// A failed API call can resolve with an error object; never let that wipe a
	// real count (or crash the header) — fall back to the SSR numbers instead.
	const notifications = $derived(Array.isArray(notificationsQuery.data) ? notificationsQuery.data : undefined);
	const conversations = $derived(Array.isArray(conversationsQuery.data) ? conversationsQuery.data : undefined);
	const requests = $derived(Array.isArray(requestsQuery.data) ? requestsQuery.data : undefined);

	const unreadCount = $derived(
		notifications
			? notifications.filter((n) => !n.read).length
			: (badges.data?.unread ?? page.data.unread ?? 0)
	);
	// The inbox badge is the sum of every chat's own count plus pending message
	// requests. Opening the inbox list changes nothing; only opening a chat (or
	// answering a request) removes that item's share.
	const inboxUnreadCount = $derived.by(() => {
		if (conversations !== undefined || requests !== undefined) {
			const convoUnread = (conversations ?? []).reduce((sum, c) => sum + (c.unread ?? 0), 0);
			return convoUnread + (requests?.length ?? 0);
		}
		return badges.data?.inboxUnread ?? page.data.inboxUnread ?? 0;
	});

	// Ensure already-authorized devices sync their W3C PushSubscription in the background.
	$effect(() => {
		const uid = session?.userId;
		if (!uid || !appSettings.value.notifications.pushEnabled) return;
		void syncPushSubscriptionIfGranted(uid);
	});

	// Deliver newly arrived notifications to the phone/OS notification tray.
	$effect(() => {
		if (!session || !notifications) return;
		const nPrefs = appSettings.value.notifications;
		void notifyUnreadStreamItems(notifications, {
			pushEnabled: nPrefs.pushEnabled,
			eventReminders: nPrefs.eventReminders,
			marketing: nPrefs.marketing,
			soundHaptics: !nPrefs.quietHours
		});
	});

	// Deliver newly arrived inbox messages (conversations) and message requests
	// to the phone/OS notification tray whenever push & message alerts are enabled.
	// (Live messages themselves are pushed from the Realtime bridge, which has the
	// message body even before the list refreshes.)
	$effect(() => {
		if (!session?.userId) return;
		if (conversations === undefined && requests === undefined) return;
		const nPrefs = appSettings.value.notifications;
		void notifyUnreadInboxItems(
			conversations,
			requests,
			{
				pushEnabled: nPrefs.pushEnabled,
				messages: nPrefs.messages !== false,
				soundHaptics: !nPrefs.quietHours
			},
			session.userId
		);
	});

	/**
	 * The notifications screen acknowledges everything as it opens, so clear the
	 * shared cache at click time too: the badge disappears on the tap instead of
	 * flashing until the next refetch.
	 */
	function clearNotificationBadge() {
		const items = notifications;
		if (!items?.some((n) => !n.read)) return;
		queryClient.set(
			queryKeys.notifications,
			items.map((n) => (n.read ? n : { ...n, read: true }))
		);
		// Persist too, in case the navigation is interrupted before the hub mounts.
		void fetch('/api/notifications/read', { method: 'POST' }).catch(() => {});
	}
</script>
<header class="fixed top-0 inset-x-0 z-50 border-b border-surface-glass-border bg-surface/90 backdrop-blur-xl pt-safe">
	<div class="mx-auto max-w-[1400px] h-16 px-gutter md:px-6 xl:px-10 flex items-center gap-3 md:gap-5">
		<a href="/home" aria-label="Owltside home" class="shrink-0"><img src="/logo.png" alt="Owltside logo" class="h-6 md:h-7 w-auto" /></a>
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
				<span class="absolute -top-1 -right-1 {UNREAD_BADGE_CLASS} border-2 border-surface pointer-events-none" aria-hidden="true">
					{formatCount(unreadCount)}
				</span>
			{/if}
		</a>
		<a href="/inbox" aria-label={inboxUnreadCount > 0 ? `Inbox, ${inboxUnreadCount} unread` : 'Inbox'} class="relative w-9 h-10 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors">
			<MessageSquare class="w-5 h-5" />
			{#if inboxUnreadCount > 0}
				<span class="absolute -top-1 -right-1 {UNREAD_BADGE_CLASS} border-2 border-surface pointer-events-none" aria-hidden="true">
					{formatCount(inboxUnreadCount)}
				</span>
			{/if}
		</a>
		<ThemeToggle size="sm" class="shrink-0" />
		<a href="/settings" aria-label="Settings" class="hidden sm:block text-on-surface-variant"><Settings2 class="w-5 h-5" /></a>
		<a href="/profile" aria-label="Your profile"><Avatar name={profile?.name ?? session?.name ?? 'Guest'} src={photo} size="sm" /></a>
	</div>
	{#if navigating.to}<div class="h-0.5 bg-primary animate-pulse" role="status" aria-label="Loading page"></div>{/if}
</header>
