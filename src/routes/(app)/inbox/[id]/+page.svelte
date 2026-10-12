<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, ArrowRight, BadgeCheck, Lock, Send } from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import TopBar from '$components/TopBar.svelte';
	import { createChatTransport } from '$lib/realtime';
	import { useQuery, queryClient } from '$lib/state/query.svelte';
	import { fmtTime } from '$lib/utils/dates';
	import { page } from '$app/state';
	import type { Message } from '$lib/types';

	let { data } = $props();
	const conv = $derived(data.conversation);
	const meId = $derived(page.data.session?.userId ?? 'u-ada');

	const key = `messages:${conv.id}`;
	const messages = useQuery<Message[]>(
		key,
		async () => (await fetch(`/api/conversations/${conv.id}/messages`)).json(),
		{ staleTime: 4_000, refetchInterval: 4_000 },
		data.messages
	);

	let body = $state('');
	let scroller: HTMLDivElement | undefined = $state();

	// push incoming realtime messages (Supabase) straight into the cache
	$effect(() => {
		const transport = createChatTransport();
		return transport.subscribe(conv.id, (m) => {
			const current = queryClient.get<Message[]>(key)?.data ?? [];
			if (!current.some((x) => x.id === m.id)) queryClient.set(key, [...current, m]);
		});
	});

	// mark read once on open
	$effect(() => {
		if (conv.unread > 0) {
			fetch(`/inbox/${conv.id}?/read`, { method: 'POST', body: new FormData() });
		}
	});

	// autoscroll on new messages
	$effect(() => {
		const list = messages.data ?? [];
		if (scroller) scroller.scrollTop = scroller.scrollHeight;
		void list.length;
	});
</script>

<svelte:head><title>{conv.peer.name} • Inbox</title></svelte:head>

<TopBar back title={conv.peer.name} subtitle={conv.peer.verified ? 'Verified organiser' : `@${conv.peer.handle}`}>
	{#snippet right()}
		<Avatar name={conv.peer.name} color={conv.peer.avatarColor} size="sm" online={!!conv.online} />
	{/snippet}
</TopBar>

<main class="flex flex-col flex-1 relative w-full pt-16 bg-surface min-h-dvh">
	<div class="flex flex-col w-full md:max-w-2xl md:mx-auto flex-1 pb-28 md:pb-24">
		<div class="flex justify-center mt-space-xs">
			<span class="inline-flex items-center gap-1.5 px-space-md py-1 rounded-full bg-surface-container-lowest text-on-surface-variant text-label-badge">
				<Lock class="w-3.5 h-3.5 text-primary" /> End-to-end encrypted session • OWLTSIDE Mesh Gateway
			</span>
		</div>

		<div bind:this={scroller} class="flex flex-col gap-space-md px-margin pt-space-xs overflow-y-auto flex-1 max-h-[calc(100dvh-16rem)]">
			{#each messages.data ?? [] as m (m.id)}
				{@const mine = m.senderId === meId}
				{#if mine}
					<div class="flex flex-col items-end gap-1 max-w-[88%] self-end">
						<div class="bg-surface-container-highest text-on-surface p-space-md rounded-2xl rounded-br-xs shadow-sm">
							<p class="text-body-md leading-relaxed">{m.body}</p>
						</div>
						<span class="flex items-center gap-1 mr-1">
							<span class="text-label-badge text-outline">{fmtTime(m.sentAt)}</span>
							<BadgeCheck class="w-3.5 h-3.5 text-primary" />
						</span>
					</div>
				{:else}
					<div class="flex items-end gap-space-xs max-w-[88%] self-start">
						<Avatar name={conv.peer.name} color={conv.peer.avatarColor} size="xs" />
						<div class="flex flex-col gap-1 min-w-0">
							<div class="bg-surface-container-low text-on-surface p-space-md rounded-2xl rounded-bl-xs shadow-sm">
								<p class="text-body-md leading-relaxed">{m.body}</p>
							</div>
							<span class="text-label-badge text-outline ml-1 self-start">{fmtTime(m.sentAt)}</span>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	</div>

	<!-- composer -->
	<form
		method="POST"
		action="?/send"
		use:enhance={() => async ({ result }) => {
				if (result.type === 'success') {
					body = '';
					await messages.refetch();
				}
			}}
		class="fixed bottom-0 inset-x-0 z-40 bg-surface/90 backdrop-blur-xl border-t border-surface-glass-border px-gutter py-3 pb-safe md:left-20"
	>
		<div class="max-w-2xl mx-auto flex items-center gap-2">
			<input
				name="body"
				bind:value={body}
				placeholder="Message {conv.peer.name}..."
				autocomplete="off"
				class="flex-1 h-12 px-4 rounded-full bg-surface-container-high text-on-surface placeholder:text-on-surface-variant text-body-md outline-none focus:bg-surface-bright transition-colors"
			/>
			<button
				aria-label="Send message"
				disabled={!body.trim()}
				class="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40 glow-primary"
			>
				{#if body.trim()}
					<Send class="w-5 h-5" />
				{:else}
					<ArrowRight class="w-5 h-5 opacity-40" />
				{/if}
			</button>
		</div>
	</form>
</main>
