<script lang="ts">
	import { BadgeCheck, MessageSquare, MessageSquarePlus, Search, Bell, Users, Megaphone, Star, Wifi } from '@lucide/svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { goto } from '$app/navigation';
	import Avatar from '$components/Avatar.svelte';
	import DesktopInboxList from '$components/DesktopInboxList.svelte';
	import MessageRequestCard from '$components/MessageRequestCard.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import TopBar from '$components/TopBar.svelte';
	import { queryClient, useQuery } from '$lib/state/query.svelte';
	import { fmtRelative } from '$lib/utils/dates';
	import { page } from '$app/state';
	import type { Conversation, MessageRequest } from '$lib/types';

	let { data } = $props();

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	const conversations = useQuery<Conversation[]>(
		'conversations:mine',
		async () => (await fetch('/api/conversations')).json(),
		{ staleTime: 15_000, refetchInterval: 20_000 },
		data.conversations
	);

	const messageRequests = useQuery<MessageRequest[]>(
		'message-requests:mine',
		async () => {
			const response = await fetch('/api/message-requests');
			return response.ok ? response.json() : [];
		},
		{ staleTime: 10_000, refetchInterval: 20_000 },
		data.messageRequests ?? []
	);

	let inboxView = $state<'messages' | 'requests'>('messages');
	let search = $state('');
	let filter = $state<'all' | 'unread' | 'organizers' | 'attendees' | 'channels'>('all');
	const unreadCount = $derived((conversations.data ?? []).reduce((total, conversation) => total + conversation.unread, 0));
	const requestCount = $derived((messageRequests.data ?? []).length);

	async function respondToRequest(id: string, accept: boolean) {
		try {
			const response = await fetch(`/api/message-requests/${encodeURIComponent(id)}/respond`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ accept })
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error ?? 'The request could not be updated');
			queryClient.invalidate('message-requests:mine');
			queryClient.invalidate('conversations:mine');
			if (accept && result.request?.conversationId) await goto(`/inbox/${result.request.conversationId}`);
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Could not update the request.', 'error');
		}
	}

	const filterDefs: Array<{ id: typeof filter; label: string; icon: typeof MessageSquare }> = [
		{ id: 'all', label: 'All Messages', icon: MessageSquare },
		{ id: 'unread', label: 'Unread', icon: Bell },
		{ id: 'organizers', label: 'Organizers', icon: Star },
		{ id: 'attendees', label: 'Speakers', icon: Users },
		{ id: 'channels', label: 'Event Channels', icon: Megaphone }
	];

	const list = $derived(
		(conversations.data ?? [])
			.filter((c) => {
				if (search && !`${c.peer.name} ${c.lastMessage}`.toLowerCase().includes(search.toLowerCase())) return false;
				if (filter === 'unread') return c.unread > 0;
				if (filter === 'organizers') return c.peer.verified;
				if (filter === 'attendees') return !c.peer.verified && c.peer.handle !== 'owltside';
				if (filter === 'channels') return c.peer.handle === 'owltside';
				return true;
			})
			.sort((a, b) => +new Date(b.lastAt) - +new Date(a.lastAt))
	);
</script>

<svelte:head><title>Inbox • Owltside</title></svelte:head>

<!-- ── desktop (md+) "Direct Comms" session index per the desktop design
     source, themed with Evently Pulse tokens; mobile inbox below unchanged ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">


	<div class="border-b border-surface-glass-border bg-surface-container-low/60">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-5 flex flex-wrap items-center justify-between gap-4">
			<span class="flex items-center gap-3 min-w-0">
				<span class="{MONO} text-on-surface-variant">Communication_Suite //</span>
				<span class="font-display text-headline-lg text-on-surface">Direct Comms</span>
				<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface px-2 py-0.5 rounded">{(conversations.data ?? []).length} Sessions</span>
			</span>
			<div role="tablist" aria-label="Inbox sections" class="flex items-center gap-1 rounded-full border border-surface-glass-border bg-surface-container p-1">
				<button type="button" role="tab" aria-selected={inboxView === 'messages'} onclick={() => (inboxView = 'messages')} class="h-9 px-3 rounded-full text-body-sm font-semibold {inboxView === 'messages' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}">Messages</button>
				<button type="button" role="tab" aria-selected={inboxView === 'requests'} onclick={() => (inboxView = 'requests')} class="h-9 px-3 rounded-full text-body-sm font-semibold {inboxView === 'requests' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}">Requests <span class="ml-1 font-code text-label-badge">{requestCount}</span></button>
			</div>
			<span class="flex items-center gap-3 {MONO} text-on-surface-variant">
				<span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span> Latency: 18ms</span>
				<span class="text-outline-variant">|</span>
				<span>Gate_Node: 0x7E3-West-Africa</span>
			</span>
		</div>
	</div>

	{#if inboxView === 'messages'}
	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-8 grid lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)] gap-6 items-start">
		<DesktopInboxList items={conversations.data ?? []} />
		<section class="rounded-xl border border-surface-glass-border bg-surface-container min-h-[420px] flex flex-col items-center justify-center gap-4 p-10 text-center">
			<span class="w-14 h-14 rounded-xl bg-surface-container-high border border-surface-glass-border text-primary flex items-center justify-center">
				<MessageSquarePlus class="w-6 h-6" />
			</span>
			<h2 class="font-display text-headline-md text-on-surface">Select a session</h2>
			<p class="text-body-sm text-on-surface-variant max-w-sm">
				Open a thread from the index to view the encrypted message flow, speaker passes and
				suggested replies for that peer.
			</p>
			<span class="{MONO} text-on-surface-variant">Peer Synced • Mesh Gateway 0x7E3</span>
		</section>
	</div>

	{:else}
		<section class="mx-auto w-full max-w-[1000px] px-6 xl:px-10 py-8 flex flex-col gap-4">
			<div><h2 class="font-display text-headline-lg text-on-surface">Message requests</h2><p class="text-body-sm text-on-surface-variant pt-1">First messages from people contacting you through your event pages.</p></div>
			{#each messageRequests.data ?? [] as request (request.id)}
				<MessageRequestCard {request} onRespond={respondToRequest} />
			{:else}
				<div class="rounded-xl border border-dashed border-outline-variant/50 p-10 text-center"><h3 class="font-display text-headline-md text-on-surface">No pending requests</h3><p class="text-body-sm text-on-surface-variant pt-2">New contact requests from event pages will appear here.</p></div>
			{/each}
		</section>
	{/if}
	<footer class="mt-4 border-t border-surface-glass-border">
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
<TopBar title="Inbox" subtitle="Organisers, friends & channels" />

<main class="flex-1 flex flex-col relative w-full  pb-28 md:pb-16 bg-surface min-h-dvh">
	<div class="flex flex-col w-full md:max-w-2xl md:mx-auto">
		<div class="px-space-md py-space-sm bg-surface sticky top-16 z-30">
			<div role="tablist" aria-label="Inbox sections" class="grid grid-cols-2 gap-1 rounded-full border border-surface-glass-border bg-surface-container-low p-1 mb-3">
				<button type="button" role="tab" aria-selected={inboxView === 'messages'} onclick={() => (inboxView = 'messages')} class="h-9 rounded-full text-body-sm font-semibold {inboxView === 'messages' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}">Messages</button>
				<button type="button" role="tab" aria-selected={inboxView === 'requests'} onclick={() => (inboxView = 'requests')} class="h-9 rounded-full text-body-sm font-semibold {inboxView === 'requests' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}">Requests <span class="ml-1 font-code text-label-badge">{requestCount}</span></button>
			</div>
			{#if inboxView === 'messages'}
			<div class="relative flex items-center w-full">
				<input
					bind:value={search}
					placeholder="Search conversations or attendees..."
					type="search"
					class="w-full h-11 pl-4 pr-10 bg-surface-container-high text-on-surface placeholder:text-on-surface-variant rounded-full text-body-md outline-none transition-all duration-200 focus:bg-surface-bright shadow-sm"
				/>
			</div>
			<div class="flex items-center gap-space-xs overflow-x-auto pt-space-sm pb-1 scrollbar-none">
				{#each filterDefs as f (f.id)}
					<button
						class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-label-badge whitespace-nowrap transition-all duration-150 {filter === f.id ? 'bg-primary-container text-on-primary-container shadow-sm' : 'bg-surface-container text-on-surface-variant hover:text-on-surface'}"
						onclick={() => (filter = f.id)}
					>
						<f.icon class="w-3.5 h-3.5" /><span>{f.label}</span>
						{#if f.id === 'unread'}<span class="font-code text-[10px]">{unreadCount}</span>{/if}
					</button>
				{/each}
			</div>
			{/if}
		</div>

		<div class="px-space-md pt-space-xs pb-space-sm">
			<div class="flex items-center justify-between px-space-md py-2.5 rounded-xl bg-surface-container-low shadow-sm">
				<span class="flex items-center gap-2">
					<span class="relative flex h-2 w-2">
						<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75"></span>
						<span class="relative inline-flex rounded-full h-2 w-2 bg-accent-emerald"></span>
					</span>
					<span class="text-body-sm text-on-surface-variant">Live Gateway Sync</span>
				</span>
				<span class="text-label-badge text-tertiary flex items-center gap-1"><Wifi class="w-3.5 h-3.5" /> Connected</span>
			</div>
		</div>

		{#if inboxView === 'messages'}
		<div class="flex flex-col px-space-md gap-space-xs pb-4">
			{#each list as conv (conv.id)}
				<div
					role="link"
					tabindex="0"
					class="group relative flex items-center gap-3.5 p-3 rounded-2xl bg-surface-container hover:bg-surface-bright active:scale-[0.99] transition-all cursor-pointer"
					onclick={() => goto(`/inbox/${conv.id}`)}
					onkeydown={(e) => e.key === 'Enter' && goto(`/inbox/${conv.id}`)}
				>
					<a href="/users/{conv.peer.handle}" aria-label="View {conv.peer.name}'s profile" class="shrink-0 hover:opacity-90 transition-opacity" onclick={(e) => e.stopPropagation()}>
						<Avatar name={conv.peer.name} color={conv.peer.avatarColor} src={conv.peer.avatarUrl} size="lg" />
					</a>
					<div class="flex-1 min-w-0">
						<span class="flex items-center justify-between gap-2">
							<span class="flex items-center gap-1.5 min-w-0">
								<a href="/users/{conv.peer.handle}" aria-label="View {conv.peer.name}'s profile" class="text-body-md text-on-surface font-semibold truncate hover:underline hover:text-primary transition-colors" onclick={(e) => e.stopPropagation()}>{conv.peer.name}</a>{#if conv.peer.verified}<BadgeCheck class="w-3.5 h-3.5 text-tertiary shrink-0" />{/if}
							</span>
							<span class="text-body-sm text-outline shrink-0">{fmtRelative(conv.lastAt)}</span>
						</span>
						<span class="text-label-badge text-tertiary pt-0.5">{conv.peer.verified ? 'Official organiser' : conv.peer.handle === 'owltside' ? 'Event channel' : 'Speaker'}</span>
						<span class="flex items-center justify-between gap-2">
							<span class="text-body-sm truncate {conv.unread ? 'text-on-surface font-medium' : 'text-on-surface-variant'}">{conv.lastMessage}</span>
							{#if conv.unread > 0}
								<span class="min-w-5 h-5 px-1.5 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center shrink-0">{conv.unread}</span>
							{/if}
						</span>
					</div>
				</div>
			{:else}
				<EmptyState title="No conversations" sub="Message an organiser from any event page.">
					{#snippet icon()}<MessageSquare class="w-6 h-6" />{/snippet}
				</EmptyState>
			{/each}
		</div>
		{:else}
			<div class="flex flex-col px-space-md gap-space-sm pb-4">
				{#each messageRequests.data ?? [] as request (request.id)}
					<MessageRequestCard {request} onRespond={respondToRequest} />
				{:else}
					<div class="rounded-xl border border-dashed border-outline-variant/50 p-8 text-center"><h2 class="font-display text-headline-md text-on-surface">No pending requests</h2><p class="text-body-sm text-on-surface-variant pt-2">Organizer contact requests sent from event pages appear here.</p></div>
				{/each}
			</div>
		{/if}
	</div>
</main>
</div>
