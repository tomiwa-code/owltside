<script lang="ts">
	/**
	 * Desktop (md+) inbox thread list panel per the "Direct Comms" design
	 * source — themed with the Evently Pulse tokens from `src/app.css`.
	 */
	import { Search, SlidersHorizontal } from '@lucide/svelte';
	import Avatar from './Avatar.svelte';
	import { fmtDate, fmtRelative, fmtTime } from '$lib/utils/dates';
	import type { Conversation } from '$lib/types';

	let { items, activeId }: { items: Conversation[]; activeId?: string } = $props();

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	let q = $state('');
	let filter = $state<'all' | 'unread' | 'organizers' | 'speakers'>('all');

	const list = $derived(
		items
			.filter((c) => {
				if (q && !`${c.peer.name} ${c.lastMessage}`.toLowerCase().includes(q.toLowerCase()))
					return false;
				if (filter === 'unread') return c.unread > 0;
				if (filter === 'organizers') return c.peer.verified;
				if (filter === 'speakers') return !c.peer.verified && c.peer.handle !== 'owltside';
				return true;
			})
			.sort((a, b) => +new Date(b.lastAt) - +new Date(a.lastAt))
	);

	function roleBadge(c: Conversation): string {
		if (c.peer.verified) return 'Official Organizer';
		if (c.peer.handle === 'owltside') return 'Event Channel';
		return 'Keynote Speaker';
	}

	function timeLabel(iso: string): string {
		const d = new Date(iso);
		const now = new Date();
		const sameDay = d.toDateString() === now.toDateString();
		if (sameDay) return fmtTime(iso);
		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
		if (+now - +d < 7 * 86_400_000) return fmtRelative(iso);
		return fmtDate(iso);
	}
</script>

<aside class="rounded-xl border border-surface-glass-border bg-surface-container flex flex-col overflow-hidden lg:sticky lg:top-24 max-h-[calc(100dvh-8rem)]">
	<div class="p-4 flex flex-col gap-3 border-b border-surface-glass-border">
		<label class="relative">
			<Search class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-outline-variant pointer-events-none" />
			<input
				type="search"
				bind:value={q}
				placeholder="Search threads, speakers, gates…"
				class="w-full h-11 rounded-lg bg-surface-container-low border border-surface-glass-border pl-10 pr-4 text-body-md text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary/50 transition-colors"
			/>
		</label>
		<div class="flex items-center gap-2 flex-wrap">
			{#each ([
				['all', 'All'],
				['unread', 'Unread'],
				['organizers', 'Organizers'],
				['speakers', 'Speakers']
			] as ['all' | 'unread' | 'organizers' | 'speakers', string][]) as [id, label]}
				<button
					type="button"
					onclick={() => (filter = id)}
					class="h-8 px-3 rounded-lg text-body-sm transition-colors
						{filter === id
							? 'bg-primary text-on-primary font-semibold'
							: 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'}"
				>
					{label}
				</button>
			{/each}
		</div>
	</div>

	<div class="flex-1 overflow-y-auto divide-y divide-surface-glass-border">
		{#each list as c (c.id)}
			<a
				href="/inbox/{c.id}"
				aria-current={c.id === activeId ? 'true' : undefined}
				class="flex items-start gap-3 p-4 transition-colors border-l-2
					{c.id === activeId
						? 'border-l-primary bg-surface-container-high'
						: 'border-l-transparent hover:bg-surface-container-high/60'}"
			>
				<Avatar name={c.peer.name} color={c.peer.avatarColor} size="md" />
				<span class="flex-1 min-w-0">
					<span class="flex items-center justify-between gap-2">
						<span class="flex items-center gap-1.5 min-w-0">
							<span class="text-body-md font-semibold text-on-surface truncate">{c.peer.name}</span>
						</span>
						<span class="flex items-center gap-1.5 shrink-0">
							<span class="font-code text-[11px] tracking-[0.08em] text-on-surface-variant">{timeLabel(c.lastAt)}</span>
							{#if c.unread > 0}<span class="w-2 h-2 rounded-full bg-primary"></span>{/if}
						</span>
					</span>
					<span class="flex items-center gap-2 pt-1 min-w-0">
						<span class="{MONO} bg-surface-container-high border border-surface-glass-border text-on-surface-variant px-1.5 py-0.5 rounded truncate">
							{roleBadge(c)}
						</span>
						{#if c.peer.verified}<span class="text-[10px] text-tertiary shrink-0">✓</span>{/if}
					</span>
					<span class="block text-body-sm text-on-surface-variant truncate pt-1.5">{c.lastMessage}</span>
				</span>
			</a>
		{:else}
			<p class="p-6 text-body-sm text-on-surface-variant text-center">No threads match this filter.</p>
		{/each}
	</div>

	<div class="px-4 py-3 border-t border-surface-glass-border flex items-center justify-between gap-3">
		<span class="flex items-center gap-2 {MONO} text-on-surface-variant">
			<SlidersHorizontal class="w-3.5 h-3.5" /> Filter: Active Chats
		</span>
		<span class="{MONO} text-on-surface-variant">Peer Synced</span>
	</div>
</aside>
