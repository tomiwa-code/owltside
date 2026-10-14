<script lang="ts">
	import { CircleCheck } from '@lucide/svelte';
	import type { EventSpeaker, SpeakerInviteStatus } from '$lib/types';

	let {
		speaker,
		status,
		busy = false,
		onRespond
	}: {
		speaker: EventSpeaker;
		status: SpeakerInviteStatus;
		busy?: boolean;
		onRespond: (accept: boolean) => void;
	} = $props();
</script>

{#if status === 'pending'}
	<section class="rounded-xl border border-primary/25 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" aria-label="Speaker invitation">
		<div class="min-w-0">
			<p class="text-body-sm font-semibold text-on-surface">You’ve been invited as {speaker.role ?? 'Speaker/Performer'}.</p>
			<p class="text-label-badge text-on-surface-variant pt-1">Accept to add this event role to your public profile.</p>
		</div>
		<div class="flex items-center gap-2 shrink-0">
			<button
				type="button"
				disabled={busy}
				onclick={() => onRespond(true)}
				class="px-3 py-2 rounded-lg bg-primary text-on-primary text-body-sm font-semibold disabled:opacity-60"
			>
				{busy ? 'Saving…' : 'Accept'}
			</button>
			<button
				type="button"
				disabled={busy}
				onclick={() => onRespond(false)}
				class="px-3 py-2 rounded-lg bg-surface-container-high text-on-surface text-body-sm font-semibold disabled:opacity-60"
			>
				Decline
			</button>
		</div>
	</section>
{:else if status === 'accepted'}
	<div class="rounded-xl border border-accent-emerald/25 bg-accent-emerald/5 p-3 flex items-start gap-2.5 text-body-sm text-on-surface" aria-live="polite">
		<CircleCheck class="w-4 h-4 text-accent-emerald shrink-0 mt-0.5" />
		<p>You’ve accepted the {speaker.role ?? 'Speaker/Performer'} role. It now appears on your public profile.</p>
	</div>
{/if}
