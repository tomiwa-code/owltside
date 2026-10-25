<script lang="ts">
	import {
		BadgeCheck,
		CalendarDays,
		Check,
		ExternalLink,
		Flag,
		Search,
		ShieldAlert,
		UserRound,
		X
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { toasts } from '$admin/state/toast.svelte';
	import { relative } from '$admin/utils/format';
	import type { AdminReport } from '$admin/types';
	import PageHeader from '$components/PageHeader.svelte';
	import Sheet from '$components/Sheet.svelte';
	import EmptyState from '$components/EmptyState.svelte';

	let { data } = $props();

	type Tab = 'open' | 'actioned' | 'dismissed' | 'all';

	let tab = $state<Tab>('open');
	let query = $state('');
	let override = $state<string | null>(null);
	let reviewOpen = $state(false);
	let reviewMode = $state<'action' | 'dismiss'>('action');
	let note = $state('');
	let busy = $state(false);

	const rows = $derived<AdminReport[]>(data.rows);
	const filtered = $derived(
		rows
			.filter((row) => (tab === 'all' ? true : row.status === tab))
			.filter((row) =>
				query.trim()
					? `${row.targetLabel} ${row.categoryLabel} ${row.details} ${row.reporterName} ${row.targetType}`
							.toLowerCase()
							.includes(query.trim().toLowerCase())
					: true
			)
	);
	const selected = $derived<AdminReport | null>(
		rows.find((row) => row.id === (override ?? data.selectedId)) ?? filtered[0] ?? null
	);

	// Deep-link into the public app so a reviewer can inspect the live content.
	const publicApp = $derived(String((page.data as { publicAppUrl?: string }).publicAppUrl ?? ''));
	const targetHref = $derived((row: AdminReport) =>
		!publicApp
			? ''
			: row.targetType === 'event'
				? `${publicApp}/events/${row.targetId}`
				: `${publicApp}/users/${row.targetLabel.replace(/^@/, '')}`
	);

	function statusChip(row: AdminReport): { label: string; tone: string } {
		if (row.status === 'actioned') return { label: 'Actioned', tone: 'chip-ok' };
		if (row.status === 'dismissed') return { label: 'Dismissed', tone: 'chip' };
		return { label: 'Open', tone: 'chip-warn' };
	}

	function startReview(mode: 'action' | 'dismiss', target: AdminReport | null = selected) {
		if (!target) return;
		override = target.id;
		reviewMode = mode;
		note = '';
		reviewOpen = true;
	}

	async function submitReview() {
		if (!selected) return;
		busy = true;
		const response = await fetch(`/api/reports/${selected.id}/decision`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ decision: reviewMode, note })
		});
		busy = false;
		const payload = (await response.json().catch(() => ({}))) as { message?: string };
		if (!response.ok) {
			toasts.error('Review not saved', payload.message ?? 'Try again.');
			return;
		}
		toasts.ok(
			reviewMode === 'action' ? 'Report actioned' : 'Report dismissed',
			reviewMode === 'action'
				? `${selected.targetLabel} — outcome recorded in the audit trail.`
				: `${selected.targetLabel} — closed with no further action.`
		);
		reviewOpen = false;
		note = '';
		override = null;
		await invalidateAll();
	}
</script>

<svelte:head><title>Reports · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Content Reports"
		subtitle="Reports filed by attendees against event listings and public profiles. Nothing is actioned on the public app until someone here reviews it."
		crumbs={['trust', 'reports']}
		eyebrow="Trust & safety"
	>
		{#snippet actions()}
			<span class="chip {data.mode === 'supabase' ? 'chip-ok' : 'chip-warn'} !text-[8px]" title={data.mode === 'supabase'
				? 'Reading public.content_reports with the service-role key.'
				: 'No Supabase credentials set — the console is reviewing its seeded demo queue.'}>
				{data.mode === 'supabase' ? 'Live database' : 'Demo dataset'}
			</span>
		{/snippet}
	</PageHeader>

	{#if data.error}
		<div class="panel border border-rose-500/30 p-4 text-[11px] text-rose-200">
			{data.error}
			<span class="mt-1 block text-[#8f8f9b]">Apply <code>supabase/sql/025_content_reports.sql</code> to your project, then reload.</span>
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Open reports</p><ShieldAlert size={13} class="text-amber-300" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{data.counts.open}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Awaiting a trust &amp; safety decision</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Actioned</p><BadgeCheck size={13} class="text-emerald-400" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{data.counts.actioned}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Content acted on</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Dismissed</p><X size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{data.counts.dismissed}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Reviewed, no action needed</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">All reports</p><Flag size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{data.counts.all}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Listings &amp; profiles</p>
		</div>
	</div>

	<div class="panel overflow-hidden">
		<div class="flex flex-wrap items-center gap-2 border-b border-[#26262e] px-4 py-2.5">
			{#each [['open', 'Open'], ['actioned', 'Actioned'], ['dismissed', 'Dismissed'], ['all', 'All']] as [id, label]}
				<button
					type="button"
					class="chip !h-[19px] !text-[8px] {tab === id ? 'chip-ok' : ''}"
					onclick={() => { tab = id as Tab; override = null; }}
				>
					{label} {id === 'all' ? data.counts.all : id === 'open' ? data.counts.open : id === 'actioned' ? data.counts.actioned : data.counts.dismissed}
				</button>
			{/each}
			<div class="ml-auto flex items-center gap-1.5 rounded-md border border-[#2b2b33] bg-[#15151a] px-2 py-1">
				<Search size={11} class="text-[#6f6f7b]" />
				<input
					class="w-40 bg-transparent font-code text-[9px] uppercase tracking-[0.08em] text-[#d4d4dc] outline-none placeholder:text-[#5f5f6b]"
					placeholder="Target, category, reporter…"
					bind:value={query}
				/>
			</div>
		</div>

		<div class="grid min-w-0 gap-0 lg:grid-cols-[1.15fr_1fr]">
			<div class="min-w-0 border-b border-[#26262e] lg:border-b-0 lg:border-r">
				<div class="overflow-x-auto">
					<table class="w-full min-w-[440px] border-collapse text-left">
						<thead>
							<tr class="border-b border-[#26262e] font-code text-[7.5px] uppercase tracking-[0.12em] text-[#6f6f7b]">
								<th class="px-4 py-2">Target</th>
								<th class="px-2 py-2">Violation</th>
								<th class="px-2 py-2">Reporter</th>
								<th class="px-2 py-2">Age</th>
								<th class="px-2 py-2"></th>
							</tr>
						</thead>
						<tbody>
							{#each filtered as row (row.id)}
								{@const chip = statusChip(row)}
								<tr class="border-b border-[#22222a] last:border-0 {selected?.id === row.id ? 'bg-[#18181f]' : ''}">
									<td class="px-4 py-2.5">
										<p class="flex items-center gap-1.5 text-[10.5px] font-medium text-[#ececf2]">
											{#if row.targetType === 'event'}
												<CalendarDays size={11} class="text-[#8f8f9b]" />
											{:else}
												<UserRound size={11} class="text-[#8f8f9b]" />
											{/if}
											{row.targetLabel}
										</p>
										<p class="mt-0.5 max-w-[190px] truncate text-[8.5px] text-[#6f6f7b]">{row.targetType === 'event' ? 'Event listing' : 'User profile'} · {row.id}</p>
									</td>
									<td class="px-2 py-2.5">
										<p class="max-w-[150px] truncate text-[10px] text-[#d4d4dc]">{row.categoryLabel}</p>
									</td>
									<td class="px-2 py-2.5">
										<p class="text-[10px] text-[#d4d4dc]">{row.reporterName}</p>
										<p class="font-code text-[8px] text-[#6f6f7b]">@{row.reporterHandle}</p>
									</td>
									<td class="whitespace-nowrap px-2 py-2.5 font-code text-[8.5px] text-[#8f8f9b]">{relative(row.createdAt)}</td>
									<td class="px-2 py-2.5 text-right">
										<button type="button" class="chip !h-[17px] !text-[7.5px] {chip.tone}" aria-label={`Review ${row.targetLabel}`} onclick={() => (override = row.id)}>
											{chip.label}
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
					{#if filtered.length === 0}
						<div class="p-4">
							<EmptyState title="Nothing in this tab" message="Reports appear here as soon as someone flags a listing or profile in the public app." />
						</div>
					{/if}
				</div>
			</div>

			{#if selected}
				{@const chip = statusChip(selected)}
				<div class="min-w-0 p-4">
					<div class="flex items-start justify-between gap-2">
						<div>
							<p class="mono-label">Report dossier</p>
							<h3 class="mt-1 font-display text-[16px] font-semibold text-[#f0f0f5]">{selected.targetLabel}</h3>
							<p class="mt-0.5 font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">
								{selected.targetType === 'event' ? 'Event listing' : 'User profile'} · {selected.id}
							</p>
						</div>
						<span class="chip {chip.tone} !text-[8px]">{chip.label}</span>
					</div>

					<div class="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/5 p-3">
						<p class="mono-label !text-[8px] text-amber-200">Reported violation</p>
						<p class="mt-1 text-[11px] font-medium text-[#f0f0f5]">{selected.categoryLabel}</p>
						<p class="mt-1.5 text-[10.5px] leading-relaxed text-[#c9c9d4]">{selected.details}</p>
					</div>

					<div class="mt-2.5 grid grid-cols-2 gap-2 rounded-lg border border-[#292930] bg-[#18181e] p-2.5">
						<div>
							<p class="mono-label !text-[7px]">Reporter</p>
							<p class="mt-1 text-[11px] text-[#e6e6ec]">{selected.reporterName}</p>
							<p class="font-code text-[8.5px] text-[#6f6f7b]">@{selected.reporterHandle}{selected.reporterEmail ? ` · ${selected.reporterEmail}` : ''}</p>
						</div>
						<div class="text-right">
							<p class="mono-label !text-[7px]">Reported</p>
							<p class="mt-1 text-[10.5px] text-[#d4d4dc]">{relative(selected.createdAt)}</p>
							<p class="font-code text-[8px] text-[#6f6f7b]">SLA {selected.slaHours}h</p>
						</div>
					</div>

					<div class="mt-3 rounded-lg border border-[#2a2a32] p-3">
						<div class="flex items-center justify-between">
							<p class="mono-label !text-[8px]">Content snapshot</p>
							{#if targetHref(selected)}
								<a class="flex items-center gap-1 font-code text-[8px] uppercase tracking-[0.08em] text-[#c6bcff] hover:underline" href={targetHref(selected)} target="_blank" rel="noreferrer">
									Open in app <ExternalLink size={9} />
								</a>
							{/if}
						</div>
						<div class="mt-1.5 space-y-1 text-[10px]">
							{#each selected.context as row}
								<p class="flex justify-between gap-3"><span class="text-[#a0a0ab]">{row.label}</span><span class="font-code text-right text-[#dcdce4]">{row.value}</span></p>
							{/each}
						</div>
					</div>

					{#if selected.status === 'open'}
						<div class="mt-3 rounded-lg border border-[#2a2a32] p-3">
							<p class="mono-label !text-[8px]">Outcome</p>
							<p class="mt-1 text-[10px] leading-relaxed text-[#a0a0ab]">
								Acting on a report records the decision here and in the audit trail; suspend the listing from
								<a class="text-[#c6bcff] underline" href={selected.targetType === 'event' ? '/events' : '/users'}> {selected.targetType === 'event' ? 'Events' : 'Users'}</a>
								if it should come down.
							</p>
						</div>
						<div class="mt-2.5 space-y-1.5">
							<button type="button" class="btn btn-primary w-full" disabled={busy} onclick={() => startReview('action')}>
								<Check size={13} /> Action this report
							</button>
							<button type="button" class="btn btn-sm w-full" disabled={busy} onclick={() => startReview('dismiss')}>
								<X size={13} /> Dismiss with a note
							</button>
						</div>
					{:else}
						<div class="mt-3 rounded-lg border border-[#2a2a32] p-3 text-[10px]">
							<p class="mono-label !text-[8px]">Review</p>
							<p class="mt-1 text-[#dcdce4]">
								{selected.status === 'actioned' ? 'Actioned' : 'Dismissed'}
								{#if selected.reviewerName}· {selected.reviewerName}{/if}
								{#if selected.reviewedAt}<span class="text-[#6f6f7b]"> · {relative(selected.reviewedAt)}</span>{/if}
							</p>
							<p class="mt-1 text-[#a0a0ab]">{selected.reviewNote || 'No note recorded.'}</p>
						</div>
					{/if}
				</div>
			{:else}
				<div class="p-4">
					<EmptyState title="Select a report" message="Pick a report on the left to review the target and the details." />
				</div>
			{/if}
		</div>
	</div>
</div>

<Sheet
	open={reviewOpen}
	title={reviewMode === 'action' ? 'Action report' : 'Dismiss report'}
	subtitle="The note is stored with the report and in the audit trail."
	onclose={() => (reviewOpen = false)}
	width="440px"
>
	<form class="space-y-3" onsubmit={(event) => { event.preventDefault(); submitReview(); }}>
		{#if selected}
			<div class="rounded-lg border border-[#2a2a32] bg-[#18181e] px-3 py-2 text-[10px]">
				<p class="text-[#e6e6ec]">{selected.targetLabel}</p>
				<p class="font-code text-[8.5px] text-[#6f6f7b]">{selected.categoryLabel} · reported {relative(selected.createdAt)}</p>
			</div>
		{/if}
		<label class="field-label" for="report-review-note">
			{reviewMode === 'action' ? 'What was done?' : 'Why is this being dismissed?'}
		</label>
		<textarea
			id="report-review-note"
			class="textarea"
			bind:value={note}
			required
			placeholder={reviewMode === 'action'
				? 'e.g. Listing suspended pending a corrected lineup; organizer notified.'
				: 'e.g. Reviewed the listing and the details match the organizer-submitted line-up.'}
		></textarea>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (reviewOpen = false)}>Cancel</button>
			<button type="submit" class="btn btn-sm {reviewMode === 'action' ? 'btn-primary' : 'btn-danger'}" disabled={busy || !note.trim()}>
				{reviewMode === 'action' ? 'Save action' : 'Dismiss report'}
			</button>
		</div>
	</form>
</Sheet>
