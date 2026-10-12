<script lang="ts">
	import { MessageSquare, Users, Megaphone, Star, Wifi } from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import TopBar from '$components/TopBar.svelte';
	import { useQuery } from '$lib/state/query.svelte';
	import { fmtRelative } from '$lib/utils/dates';
	import type { Conversation } from '$lib/types';

	let { data } = $props();

	const conversations = useQuery<Conversation[]>(
		'conversations:mine',
		async () => (await fetch('/api/conversations')).json(),
		{ staleTime: 15_000, refetchInterval: 20_000 },
		data.conversations
	);

	let search = $state('');
	let filter = $state<'all' | 'organizers' | 'attendees' | 'channels'>('all');

	const filterDefs: Array<{ id: typeof filter; label: string; icon: typeof MessageSquare }> = [
		{ id: 'all', label: 'All Messages', icon: MessageSquare },
		{ id: 'organizers', label: 'Organizers', icon: Star },
		{ id: 'attendees', label: 'Attendees', icon: Users },
		{ id: 'channels', label: 'Event Channels', icon: Megaphone }
	];

	const list = $derived(
		(conversations.data ?? [])
			.filter((c) => {
				if (search && !`${c.peer.name} ${c.lastMessage}`.toLowerCase().includes(search.toLowerCase())) return false;
				if (filter === 'organizers') return c.peer.verified;
				if (filter === 'attendees') return !c.peer.verified && c.peer.handle !== 'owltside';
				if (filter === 'channels') return c.peer.handle === 'owltside';
				return true;
			})
			.sort((a, b) => +new Date(b.lastAt) - +new Date(a.lastAt))
	);
</script>

<svelte:head><title>Inbox • Owltside</title></svelte:head>

<TopBar title="Inbox" subtitle="Organisers, friends & channels" />

<main class="flex-1 flex flex-col relative w-full pt-16 pb-28 md:pb-16 bg-surface min-h-dvh">
	<div class="flex flex-col w-full md:max-w-2xl md:mx-auto">
		<div class="px-space-md py-space-sm bg-surface sticky top-16 z-30">
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
					</button>
				{/each}
			</div>
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

		<div class="flex flex-col px-space-md gap-space-xs pb-4">
			{#each list as conv (conv.id)}
				<a
					href="/inbox/{conv.id}"
					class="group relative flex items-center gap-3.5 p-3 rounded-2xl bg-surface-container hover:bg-surface-bright active:scale-[0.99] transition-all"
				>
					<Avatar name={conv.peer.name} color={conv.peer.avatarColor} size="lg" online={!!conv.online} />
					<span class="flex-1 min-w-0">
						<span class="flex items-center justify-between gap-2">
							<span class="text-body-md text-on-surface font-semibold truncate">{conv.peer.name}</span>
							<span class="text-body-sm text-outline shrink-0">{fmtRelative(conv.lastAt)}</span>
						</span>
						<span class="flex items-center justify-between gap-2">
							<span class="text-body-sm truncate {conv.unread ? 'text-on-surface font-medium' : 'text-on-surface-variant'}">{conv.lastMessage}</span>
							{#if conv.unread > 0}
								<span class="min-w-5 h-5 px-1.5 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center shrink-0">{conv.unread}</span>
							{/if}
						</span>
					</span>
				</a>
			{:else}
				<EmptyState title="No conversations" sub="Message an organiser from any event page.">
					{#snippet icon()}<MessageSquare class="w-6 h-6" />{/snippet}
				</EmptyState>
			{/each}
		</div>
	</div>
</main>
