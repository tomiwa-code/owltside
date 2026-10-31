<script lang="ts">
	import { Check, Clock, MapPin, RefreshCw, X } from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { date, time } from '$admin/utils/format';
	import type { EventSubmission } from '$admin/server/moderation';
	import CoverArt from '$components/CoverArt.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import Sheet from '$components/Sheet.svelte';

	let {
		rows = [],
		error: loadError = ''
	}: { rows?: EventSubmission[]; error?: string } = $props();

	let busyId = $state<string | null>(null);
	let rejectTarget = $state<EventSubmission | null>(null);
	let reason = $state('');

	async function decide(submission: EventSubmission, decision: 'approve' | 'reject', note = '') {
		busyId = submission.id;
		try {
			const response = await fetch(`/api/moderation/${submission.id}/decision`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ decision, note })
			});
			const payload = (await response.json().catch(() => ({}))) as { message?: string };
			if (!response.ok) {
				toasts.error('Decision not applied', payload.message ?? 'Try again.');
				return;
			}
			toasts.ok(
				decision === 'approve' ? 'Event published' : 'Submission rejected',
				decision === 'approve'
					? `${submission.title} is now live on the public home and explore feeds.`
					: `${submission.title} was sent back to the organizer with your note.`
			);
			rejectTarget = null;
			reason = '';
			await invalidateAll();
		} finally {
			busyId = null;
		}
	}
</script>

<section class="panel overflow-hidden">
	<div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#26262e] px-4 py-2.5">
		<div class="flex items-center gap-2">
			<p class="mono-label !text-[9px]">Organizer submission queue</p>
			<span class="chip chip-warn !h-[17px] !text-[8px]">{(rows ?? []).length} awaiting review</span>
			<span class="chip !h-[17px] !text-[8px]" title="Reading submissions from your Supabase project with the service-role key.">
				Live database
			</span>
		</div>
		<p class="font-code text-[8px] uppercase tracking-[0.1em] text-[#6f6f7b]">
			Approve &amp; publish flips the event to <span class="text-[#c6bcff]">published</span> and it appears in the public feeds instantly
		</p>
	</div>

	{#if loadError}
		<p role="alert" class="border-b border-red-500/20 bg-red-500/5 px-4 py-3 text-[11px] text-red-300">
			{loadError}
		</p>
	{/if}

	{#if (rows ?? []).length === 0}
		<EmptyState
			title="No events waiting for review"
			message="New organizer submissions land here. Approved events are published to the public home and explore feeds immediately."
		/>
	{:else}
		<ul class="divide-y divide-[#24242c]">
			{#each (rows ?? []) as submission (submission.id)}
				<li class="grid gap-3 px-4 py-3.5 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-start">
					{#if submission.coverSrc}
						<a href={`/events/${submission.id}`} class="block h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[#2c2c35]">
							<img src={submission.coverSrc} alt={submission.title} class="h-full w-full object-cover" />
						</a>
					{:else}
						<CoverArt
							from={submission.coverFrom}
							to={submission.coverTo}
							icon={submission.coverIcon}
							compact
						/>
					{/if}
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-1.5">
							<a href={`/events/${submission.id}`} class="text-[12.5px] font-semibold text-[#f0f0f5] hover:text-[#c6bcff] hover:underline">
								{submission.title}
							</a>
							<span class="chip chip-accent !h-[16px] !text-[7.5px]">{submission.category}</span>
							<span class="chip chip-warn !h-[16px] !text-[7.5px]">Pending Approval</span>
							<a href={`/events/${submission.id}`} class="font-code text-[8px] uppercase tracking-[0.08em] text-[#c6bcff] hover:underline">
								Inspect dossier →
							</a>
						</div>
						<p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-code text-[8.5px] uppercase tracking-[0.06em] text-[#8f8f9b]">
							{#if submission.organizerId}
								<a href={`/organizers/${submission.organizerId}`} class="text-[#c6bcff] hover:underline">
									By {submission.organizerName}{submission.organizerHandle ? ` · @${submission.organizerHandle}` : ''}
								</a>
							{:else}
								<span>By {submission.organizerName}{submission.organizerHandle ? ` · @${submission.organizerHandle}` : ''}</span>
							{/if}
							<span class="text-[#54545f]">|</span>
							<span>{date(submission.startsAt)} · {time(submission.startsAt)}</span>
							<span class="flex items-center gap-1"><MapPin size={9} /> {submission.venue}{submission.city ? `, ${submission.city}` : ''}</span>
						</p>
						{#if submission.description}
							<p class="mt-1.5 line-clamp-2 max-w-[70ch] text-[11px] leading-relaxed text-[#8f8f9b]">
								{submission.description}
							</p>
						{/if}
						<p class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-code text-[8.5px] text-[#6f6f7b]">
							<span class="flex items-center gap-1"><Clock size={9} /> Submitted {date(submission.submittedAt)} · {time(submission.submittedAt)}</span>
							<span>{submission.tierSummary}</span>
							{#if submission.capacity}<span>{submission.capacity.toLocaleString('en-US')} seats</span>{/if}
						</p>
					</div>
					<div class="flex flex-wrap items-center gap-1.5 lg:flex-col lg:items-stretch">
						<button
							type="button"
							class="btn btn-sm btn-primary whitespace-nowrap"
							disabled={busyId === submission.id}
							onclick={() => decide(submission, 'approve')}
						>
							{#if busyId === submission.id}
								<RefreshCw size={12} class="animate-spin" /> Publishing…
							{:else}
								<Check size={12} /> Approve &amp; Publish
							{/if}
						</button>
						<button
							type="button"
							class="btn btn-sm btn-danger-soft whitespace-nowrap"
							disabled={busyId === submission.id}
							onclick={() => {
								rejectTarget = submission;
								reason = '';
							}}
						>
							<X size={12} /> Reject
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<Sheet
	open={!!rejectTarget}
	title="Reject submission"
	subtitle="The organizer sees this note on their dashboard and can edit the event to resubmit it."
	onclose={() => (rejectTarget = null)}
	width="440px"
>
	<form
		class="space-y-3"
		onsubmit={(event) => {
			event.preventDefault();
			if (rejectTarget) decide(rejectTarget, 'reject', reason);
		}}
	>
		<label class="field-label" for="reject-reason">Reason for rejection</label>
		<textarea
			id="reject-reason"
			class="textarea"
			bind:value={reason}
			required
			minlength="4"
			placeholder="e.g. Duplicate listing — the same event is already published as Yaba Rooftop Sessions."
		></textarea>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (rejectTarget = null)}>Cancel</button>
			<button type="submit" class="btn btn-sm btn-danger" disabled={busyId === rejectTarget?.id}>
				{busyId === rejectTarget?.id ? 'Rejecting…' : 'Reject submission'}
			</button>
		</div>
	</form>
</Sheet>
