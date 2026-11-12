<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { page } from '$app/state';
	import Toasts from '$components/Toasts.svelte';
	import PullToRefresh from '$components/PullToRefresh.svelte';
	import { queryClient as cache } from '$lib/query/cache';
	import { getQueryClient } from '$lib/query/client';
	import { queryKeys } from '$lib/query/keys';
	import { startRealtimeSync } from '$lib/query/realtime-sync';
	import { notifyIncomingDirectMessage } from '$lib/push.client';
	import type { Conversation, Message } from '$lib/types';
	import { appSettings } from '$lib/state/settings.svelte';
	import { ensureServiceWorkerRegistration } from '$lib/push.client';
	import { clearRetiredBiometricStorage } from '$lib/retired-biometrics.client';

	let { children } = $props();

	// One QueryClient for the whole browser session; a fresh one per SSR render.
	const queryClient = getQueryClient();

	/**
	 * A message that arrives while the user is elsewhere in the app still has to
	 * reach the OS notification tray. The socket bridge patches the cache first,
	 * so the thread's peer name is available here; the push helper dedupes by
	 * conversation + timestamp, so a chat screen delivering the same message
	 * cannot double-notify.
	 */
	function pushIncomingMessage(message: Message, userId: string) {
		if (!message.senderId || message.senderId === userId) return;
		const conversations = cache.get<Conversation[]>(queryKeys.conversations)?.data ?? [];
		const peer = conversations.find((conversation) => conversation.id === message.conversationId)?.peer;
		const prefs = appSettings.value.notifications;
		void notifyIncomingDirectMessage(
			{
				id: message.id,
				conversationId: message.conversationId,
				senderName: peer?.name ?? 'Owltside User',
				body: message.body,
				sentAt: message.sentAt
			},
			{
				pushEnabled: prefs.pushEnabled,
				messages: prefs.messages !== false,
				soundHaptics: !prefs.quietHours
			},
			userId
		);
	}

	// Open the messaging WebSocket once per signed-in session. Every inbox
	// screen reads from the same cache the socket patches, so there is no
	// per-page subscription left to leak or duplicate.
	let lastUserId: string | null = null;
	$effect(() => {
		const userId = page.data.session?.userId ?? null;
		if (userId === lastUserId) return;
		// Signing out (or switching accounts) must not leave another person's
		// inbox rows in memory.
		if (lastUserId && !userId) queryClient.clear();
		lastUserId = userId;
		if (!userId || page.data.demoMode) return;
		return startRealtimeSync(userId, {
			onMessage: (message) => pushIncomingMessage(message, userId)
		});
	});

	$effect(() => {
		const preferences = appSettings.value.accessibility;
		document.documentElement.dataset.theme = preferences.appearance;
		// Keep the `dark` class and the pre-paint cache in step with the preference
		// so a reload never paints the wrong theme first.
		document.documentElement.classList.toggle('dark', preferences.appearance === 'dark');
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', preferences.appearance === 'dark' ? '#1A1A1A' : '#f8f9ff');
		try {
			localStorage.setItem('owltside.theme', preferences.appearance);
		} catch {
			/* storage unavailable — the in-memory preference still applies */
		}
		document.documentElement.style.zoom = `${Math.min(150, Math.max(25, preferences.pageSize || 100))}%`;
		document.documentElement.dataset.reduceMotion = String(preferences.reduceMotion);
		document.documentElement.dataset.screenReaderLabels = String(preferences.screenReaderLabels);
	});

	onMount(() => {
		clearRetiredBiometricStorage();
		void ensureServiceWorkerRegistration();
	});
</script>

<svelte:head>
	<title>Owltside — Events & Tickets</title>
</svelte:head>

<QueryClientProvider client={queryClient}>
	<div class="min-h-dvh bg-surface-base text-on-surface font-body">
		{@render children()}
		<PullToRefresh />
		<Toasts />
	</div>
</QueryClientProvider>
