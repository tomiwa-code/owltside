<script lang="ts">
	import { ArrowRight, BadgeCheck, Check, X } from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import type { MessageRequest } from '$lib/types';
	import { fmtRelative } from '$lib/utils/dates';

	let { request, onRespond }: { request: MessageRequest; onRespond: (id: string, accept: boolean) => void | Promise<void> } = $props();
	let busy = $state(false);
	async function respond(accept: boolean) {
		if (busy) return;
		busy = true;
		try { await onRespond(request.id, accept); } finally { busy = false; }
	}
</script>

<article class="rounded-xl border border-surface-glass-border bg-surface-container p-4 md:p-5 flex flex-col gap-3">
	<div class="flex items-start gap-3 min-w-0">
		<a href="/users/{request.requester.handle}" aria-label="View {request.requester.name}'s profile" class="shrink-0">
			<Avatar name={request.requester.name} src={request.requester.avatarUrl} color={request.requester.avatarColor} size="md" />
		</a>
		<div class="min-w-0 flex-1">
			<div class="flex items-start justify-between gap-3">
				<a href="/users/{request.requester.handle}" class="inline-flex items-center gap-1.5 min-w-0 hover:text-primary transition-colors">
					<span class="font-display text-body-md font-semibold text-on-surface truncate">{request.requester.name}</span>
					{#if request.requester.verified}<BadgeCheck class="w-4 h-4 text-tertiary shrink-0" />{/if}
				</a>
				<time class="text-label-badge text-on-surface-variant shrink-0">{fmtRelative(request.createdAt)}</time>
			</div>
			<a href="/events/{request.eventSlug}" class="block text-body-sm text-on-surface-variant hover:text-primary truncate pt-0.5">Message request · {request.eventTitle}</a>
		</div>
	</div>
	<p class="rounded-lg border border-surface-glass-border bg-surface-container-low px-3.5 py-3 text-body-sm leading-relaxed text-on-surface whitespace-pre-wrap">{request.body}</p>
	<p class="text-label-badge text-on-surface-variant">Accepting opens the chat and makes it available in both inboxes.</p>
	<div class="flex flex-wrap justify-end gap-2">
		<button type="button" disabled={busy} aria-busy={busy} onclick={() => respond(false)} class="h-10 px-4 rounded-full border border-surface-glass-border bg-surface-container-high text-on-surface text-body-sm font-semibold flex items-center gap-1.5 hover:border-error/40 hover:text-error transition-colors"><X class="w-4 h-4" />{busy ? 'Saving…' : 'Decline'}</button>
		<button type="button" disabled={busy} aria-busy={busy} onclick={() => respond(true)} class="h-10 px-4 rounded-full bg-primary text-on-primary text-body-sm font-semibold flex items-center gap-1.5"><Check class="w-4 h-4" />{busy ? 'Saving…' : 'Accept & open chat'} <ArrowRight class="w-4 h-4" /></button>
	</div>
</article>
