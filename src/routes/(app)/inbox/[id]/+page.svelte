<script lang="ts">
	import { busyEnhance as enhance } from '$lib/utils/enhance';
	import {
		ArrowLeft,
		ArrowRight,
		ArrowUpRight,
		BadgeCheck,
		Bell,
		CalendarDays,
		Lock,
		MoreVertical,
		Search,
		Send,
		ShieldCheck,
		Smile,
		Zap
	} from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import DesktopInboxList from '$components/DesktopInboxList.svelte';
	import TopBar from '$components/TopBar.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { createChatTransport } from '$lib/realtime';
	import { useQuery, queryClient } from '$lib/state/query.svelte';
	import { fmtTime } from '$lib/utils/dates';
	import { page } from '$app/state';
	import type { Conversation, Message } from '$lib/types';

	let { data } = $props();
	const conv = $derived(data.conversation);
	const meId = $derived(page.data.session?.userId ?? 'u-ada');
	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';
	let deskScroller: HTMLDivElement | undefined = $state();
	const suggested = ['Yes, 8:30 AM confirmed', 'Need 15 min buffer', 'Let me check with venue team'];

	const key = `messages:${conv.id}`;
	const messages = useQuery<Message[]>(
		key,
		async () => (await fetch(`/api/conversations/${conv.id}/messages`)).json(),
		{ staleTime: 4_000, refetchInterval: 4_000 },
		data.messages
	);

	const conversations = useQuery<Conversation[]>(
		'conversations:mine',
		async () => (await fetch('/api/conversations')).json(),
		{ staleTime: 15_000, refetchInterval: 20_000 },
		data.conversations
	);

	// Opening the thread acknowledges it. Adopt the thread list that came with
	// this navigation, clear this thread's unread count in the shared cache
	// (AppHeader renders the same key) and persist the read state, so the red
	// inbox badge drops immediately instead of waiting for the next poll.
	// Keeping the write out of `load` means hover-prefetching a thread never
	// silently marks it read.
	$effect(() => {
		if (!page.data.session) return;
		const fresh = data.conversations;
		if (!fresh?.length) return;
		queryClient.set(
			'conversations:mine',
			fresh.map((c) => (c.id === conv.id ? { ...c, unread: 0 } : c))
		);
		if (fresh.some((c) => c.id === conv.id && c.unread > 0)) {
			void fetch(`/api/conversations/${encodeURIComponent(conv.id)}/read`, { method: 'POST' }).catch(() => {});
		}
	});
	// Keep the thread acknowledged while it stays open: a background poll can
	// re-apply an unread count after a message arrives.
	$effect(() => {
		if (!page.data.session) return;
		const list = conversations.data;
		if (!list?.some((c) => c.id === conv.id && c.unread > 0)) return;
		queryClient.set(
			'conversations:mine',
			list.map((c) => (c.id === conv.id ? { ...c, unread: 0 } : c))
		);
		void fetch(`/api/conversations/${encodeURIComponent(conv.id)}/read`, { method: 'POST' }).catch(() => {});
	});

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

	// autoscroll on new messages
	$effect(() => {
		const list = messages.data ?? [];
		if (scroller) scroller.scrollTop = scroller.scrollHeight;
		if (deskScroller) deskScroller.scrollTop = deskScroller.scrollHeight;
		void list.length;
	});
</script>

<svelte:head><title>{conv.peer.name} • Inbox</title></svelte:head>

<!-- ── desktop (md+) "Direct Comms" per the desktop design source, themed
     with Evently Pulse tokens; mobile chat below unchanged ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">


	<!-- suite sub-header -->
	<div class="border-b border-surface-glass-border bg-surface-container-low/60">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-5 flex flex-wrap items-center justify-between gap-4">
			<span class="flex items-center gap-3 min-w-0">
				<span class="{MONO} text-on-surface-variant">Communication_Suite //</span>
				<span class="font-display text-headline-lg text-on-surface">Direct Comms</span>
				<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface px-2 py-0.5 rounded">{(conversations.data ?? []).length} Sessions</span>
			</span>
			<span class="flex items-center gap-3 {MONO} text-on-surface-variant">
				<span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span> Latency: 18ms</span>
				<span class="text-outline-variant">|</span>
				<span>Gate_Node: 0x7E3-West-Africa</span>
			</span>
		</div>
	</div>

	<!-- body -->
	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-8 grid lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)] gap-6 items-start">
		<DesktopInboxList items={conversations.data ?? []} activeId={conv.id} />

		<!-- chat panel -->
		<section class="rounded-xl border border-surface-glass-border bg-surface-container flex flex-col overflow-hidden max-h-[calc(100dvh-8rem)] lg:sticky lg:top-24">
			<div class="p-4 flex items-center gap-4 border-b border-surface-glass-border">
				<a href="/users/{conv.peer.handle}" aria-label="View {conv.peer.name}'s profile" class="shrink-0 hover:opacity-90 transition-opacity">
					<Avatar name={conv.peer.name} color={conv.peer.avatarColor} src={conv.peer.avatarUrl} size="lg" />
				</a>
				<div class="flex-1 min-w-0">
					<span class="flex items-center gap-2 min-w-0">
						<a href="/users/{conv.peer.handle}" class="font-display text-headline-md text-on-surface truncate hover:underline hover:text-primary transition-colors">{conv.peer.name}</a>{#if conv.peer.verified}<BadgeCheck class="w-4 h-4 text-tertiary shrink-0" />{/if}
					</span>
					<a href="/users/{conv.peer.handle}" class="block text-body-sm text-on-surface-variant truncate pt-0.5 hover:text-primary hover:underline transition-colors">{conv.peer.bio ?? `@${conv.peer.handle}`}</a>
				</div>
				<div class="flex items-center gap-1 shrink-0">
					{#each [CalendarDays, MoreVertical] as Icon, i (i)}
						<button
							type="button"
							aria-label="Session action"
							onclick={() => toast('Schedule rails ship with the comms node v2', 'info')}
							class="w-10 h-10 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
						>
							<Icon class="w-4.5 h-4.5" />
						</button>
					{/each}
				</div>
			</div>

			{#if conv.event}
				<div class="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-surface-glass-border bg-surface-container-low/60">
					<span class="flex items-center gap-2 text-body-sm text-on-surface-variant min-w-0">
						<span class="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>
						<span class="truncate">{conv.event.title}</span>
					</span>
					<a href="/events/{conv.event.slug}" class="{MONO} text-primary flex items-center gap-1 hover:underline shrink-0">
						Event Brief <ArrowUpRight class="w-3.5 h-3.5" />
					</a>
				</div>
			{/if}
			<div class="px-4 py-2 flex items-center justify-center gap-2 border-b border-surface-glass-border">
				<Lock class="w-3.5 h-3.5 text-primary" />
				<span class="{MONO} text-on-surface-variant">End-to-end encrypted session • OWLTSIDE Mesh Gateway 0x7E3</span>
			</div>

			<div bind:this={deskScroller} class="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
				<div class="flex justify-center">
					<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-3 py-1 rounded">
						Today, {new Date().toLocaleDateString('en-NG', { month: 'long', day: 'numeric' })}
					</span>
				</div>
				{#each messages.data ?? [] as m, i (m.id)}
					{@const mine = m.senderId === meId}
					{#if mine}
						<div class="flex items-end gap-3 self-end max-w-[80%]">
							<div class="flex flex-col items-end gap-1">
								<div class="bg-surface-container-high text-on-surface p-4 rounded-xl rounded-br-sm shadow-sm">
									<p class="text-body-md leading-relaxed">{m.body}</p>
								</div>
								<span class="flex items-center gap-1 mr-1 font-code text-[11px] tracking-[0.08em] text-on-surface-variant">
									{fmtTime(m.sentAt)} <BadgeCheck class="w-3.5 h-3.5 text-primary" />
								</span>
							</div>
							<span class="w-9 h-9 rounded-full bg-primary text-on-primary font-code text-label-badge font-bold flex items-center justify-center shrink-0">ME</span>
						</div>
					{:else}
						<div class="flex items-end gap-3 self-start max-w-[80%]">
							<a href="/users/{conv.peer.handle}" aria-label="View {conv.peer.name}'s profile" class="shrink-0 hover:opacity-90 transition-opacity"><Avatar name={conv.peer.name} color={conv.peer.avatarColor} src={conv.peer.avatarUrl} size="xs" /></a>
							<div class="flex flex-col gap-1 min-w-0">
								<div class="bg-surface-container-low border border-surface-glass-border text-on-surface p-4 rounded-xl rounded-bl-sm shadow-sm">
									<p class="text-body-md leading-relaxed">{m.body}</p>
								</div>
								<span class="font-code text-[11px] tracking-[0.08em] text-on-surface-variant ml-1">{fmtTime(m.sentAt)}</span>
							</div>
						</div>
					{/if}
					{#if i === 1 && conv.peer.verified}
						<div class="self-end max-w-[80%] rounded-xl border border-surface-glass-border bg-surface-container-low overflow-hidden">
							<div class="px-4 py-3 flex items-center justify-between gap-3 border-b border-surface-glass-border">
								<span class="flex items-center gap-2 {MONO} text-on-surface">
									<ShieldCheck class="w-4 h-4 text-primary" /> VIP Speaker Access
								</span>
								<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-2 py-0.5 rounded">Verified</span>
							</div>
							<div class="px-4 py-3 flex items-center justify-between gap-3">
								<span class="min-w-0">
									<span class="{MONO} text-on-surface-variant block">Pass Identifier</span>
									<span class="text-body-md font-semibold text-on-surface block pt-1">Hall A • Stage 01</span>
								</span>
								<span class="text-right shrink-0">
									<span class="font-code text-label-badge text-on-surface block">#SPK-9902</span>
									<span class="text-body-sm font-semibold text-on-surface block pt-1">Fast-Pass Gate 2</span>
								</span>
							</div>
							<div class="px-4 py-3 flex items-center justify-between gap-3 border-t border-surface-glass-border bg-surface-base/40">
								<span class="{MONO} text-on-surface-variant">Issued by Owltside Mesh</span>
								<a href="/tickets" class="h-9 px-3.5 rounded-lg bg-primary text-on-primary text-body-sm font-semibold flex items-center gap-2 hover:bg-primary-container transition-colors">
									View Gate Pass <ArrowRight class="w-3.5 h-3.5" />
								</a>
							</div>
						</div>
					{/if}
				{/each}
			</div>

			<div class="px-5 py-3 flex items-center gap-3 flex-wrap border-t border-surface-glass-border">
				<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant"><Zap class="w-3.5 h-3.5 text-accent-amber" /> Suggested:</span>
				{#each suggested as s (s)}
					<button
						type="button"
						onclick={() => (body = s)}
						class="h-8 px-3 rounded-lg bg-surface-container-high border border-surface-glass-border text-body-sm text-on-surface hover:border-primary/40 transition-colors"
					>
						{s}
					</button>
				{/each}
			</div>

			<form
				method="POST"
				action="?/send"
				use:enhance={() => async ({ result }) => {
					if (result.type === 'success') {
						body = '';
						await messages.refetch();
					}
				}}
				class="border-t border-surface-glass-border p-4 flex flex-col gap-2"
			>
				<div class="flex items-center gap-3">
					<Smile class="w-5 h-5 text-on-surface-variant shrink-0" />
					<input
						name="body"
						bind:value={body}
						placeholder="Write a message to {conv.peer.name}…"
						autocomplete="off"
						class="flex-1 h-12 px-4 rounded-lg bg-surface-container-low border border-surface-glass-border text-on-surface placeholder:text-on-surface-variant text-body-md focus:outline-none focus:border-primary/50 transition-colors"
					/>
					<button
						aria-label="Send message"
						disabled={!body.trim()}
						class="h-12 px-6 rounded-lg bg-primary text-on-primary text-body-md font-semibold flex items-center gap-2 hover:bg-primary-container transition-colors glow-primary disabled:opacity-40"
					>
						Send <Send class="w-4 h-4" />
					</button>
				</div>
				<div class="flex items-center justify-between gap-3">
					<span class="text-body-sm text-on-surface-variant">Press Enter to send • Shift + Enter for new line</span>
					<span class="{MONO} text-on-surface-variant">Protocol v2.4</span>
				</div>
			</form>
		</section>
	</div>

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
<TopBar back title={conv.peer.name} subtitle={conv.peer.verified ? 'Verified organiser' : `@${conv.peer.handle}`}>
	{#snippet right()}
		<a href="/users/{conv.peer.handle}" aria-label="View {conv.peer.name}'s profile" class="hover:opacity-90 transition-opacity"><Avatar name={conv.peer.name} color={conv.peer.avatarColor} src={conv.peer.avatarUrl} size="sm" /></a>
	{/snippet}
</TopBar>

<main class="flex flex-col flex-1 relative w-full  bg-surface min-h-dvh">
	<div class="flex flex-col w-full md:max-w-2xl md:mx-auto flex-1 pb-chat-composer md:pb-24">
		<div class="flex justify-center mt-space-xs px-gutter">
			<span class="inline-flex items-center gap-1.5 px-space-md py-1.5 rounded-full bg-surface-container-lowest text-on-surface-variant text-label-badge text-center">
				<Lock class="w-3.5 h-3.5 text-primary shrink-0" /> End-to-end encrypted session • OWLTSIDE Mesh Gateway
			</span>
		</div>
		{#if conv.event}
			<div class="mx-gutter mt-2 rounded-xl bg-surface-container-low border border-surface-glass-border p-3 flex items-center justify-between gap-2">
				<span class="min-w-0">
					<span class="block text-label-badge text-on-surface-variant">EVENT BRIEF</span>
					<span class="block text-body-sm text-on-surface font-medium truncate">{conv.event.title}</span>
				</span>
				<a href="/events/{conv.event.slug}" aria-label="Open event brief" class="h-9 px-3 rounded-full bg-primary/10 text-primary text-label-badge font-semibold flex items-center gap-1 shrink-0">Open <ArrowUpRight class="w-3.5 h-3.5" /></a>
			</div>
		{/if}
		<div class="mx-gutter mt-2 flex gap-2">
				{#each [{ icon: CalendarDays, label: 'Schedule' }] as action (action.label)}
					{@const Icon = action.icon}
					<button type="button" class="h-10 flex-1 rounded-xl bg-surface-container border border-surface-glass-border text-on-surface-variant flex items-center justify-center gap-2 text-label-badge" onclick={() => toast('Schedule rails ship with the comms node v2', 'info')}>
						<Icon class="w-4 h-4" />{action.label}
					</button>
				{/each}
			</div>

		<div bind:this={scroller} class="flex flex-col gap-space-md px-margin pt-space-xs overflow-y-auto flex-1 max-h-[calc(100dvh-18rem)]">
			{#each messages.data ?? [] as m, i (m.id)}
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
						<a href="/users/{conv.peer.handle}" aria-label="View {conv.peer.name}'s profile" class="shrink-0 hover:opacity-90 transition-opacity"><Avatar name={conv.peer.name} color={conv.peer.avatarColor} src={conv.peer.avatarUrl} size="xs" /></a>
						<div class="flex flex-col gap-1 min-w-0">
							<div class="bg-surface-container-low text-on-surface p-space-md rounded-2xl rounded-bl-xs shadow-sm">
								<p class="text-body-md leading-relaxed">{m.body}</p>
							</div>
							<span class="text-label-badge text-outline ml-1 self-start">{fmtTime(m.sentAt)}</span>
						</div>
					</div>
				{/if}
				{#if i === 1 && conv.peer.verified}
					<div class="self-end w-full max-w-[92%] rounded-xl border border-surface-glass-border bg-surface-container-low overflow-hidden">
						<div class="px-3 py-2.5 flex items-center justify-between gap-2 border-b border-surface-glass-border">
							<span class="flex items-center gap-2 text-label-badge font-semibold text-on-surface"><ShieldCheck class="w-4 h-4 text-primary" /> VIP Speaker Access</span>
							<span class="text-label-badge text-tertiary">Verified</span>
						</div>
						<div class="px-3 py-3 flex items-center justify-between gap-2">
							<span><span class="block text-label-badge text-on-surface-variant">Pass identifier</span><span class="block text-body-sm font-semibold text-on-surface pt-1">Hall A · Stage 01</span></span>
							<span class="text-right"><span class="block font-code text-label-badge text-on-surface">#SPK-9902</span><span class="block text-label-badge text-on-surface-variant pt-1">Fast-Pass Gate 2</span></span>
						</div>
						<a href="/tickets" class="border-t border-surface-glass-border px-3 py-2.5 bg-surface-base/40 text-primary text-label-badge font-semibold flex items-center justify-center gap-1">View gate pass <ArrowRight class="w-3.5 h-3.5" /></a>
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
		<div class="max-w-2xl mx-auto mb-2 flex gap-2 overflow-x-auto scrollbar-none">
			<span class="flex items-center gap-1.5 text-label-badge text-on-surface-variant shrink-0"><Zap class="w-3.5 h-3.5 text-accent-amber" /> Suggested:</span>
			{#each suggested as suggestion (suggestion)}
				<button type="button" onclick={() => (body = suggestion)} class="h-8 px-3 rounded-full bg-surface-container-high border border-surface-glass-border text-label-badge text-on-surface whitespace-nowrap shrink-0">{suggestion}</button>
			{/each}
		</div>
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
</div>
