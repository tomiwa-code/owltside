<script lang="ts">
	import {
		ArrowUpRight,
		Banknote,
		BadgeCheck,
		Check,
		Clock,
		Download,
		FileText,
		IdCard,
		RotateCcw,
		Search,
		X,
		ZoomIn
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { money, relative } from '$admin/utils/format';
	import type { AdminApproval, AdminApprovalAttachment, ApprovalKind } from '$admin/types';
	import PageHeader from '$components/PageHeader.svelte';
	import Sheet from '$components/Sheet.svelte';
	import EmptyState from '$components/EmptyState.svelte';

	let { data } = $props();

	type Tab = 'pending' | 'approved' | 'rejected' | 'all';

	let tab = $state<Tab>('pending');
	let query = $state('');
	let override = $state<string | null>(null);
	let rejectOpen = $state(false);
	let previewAttachment = $state<AdminApprovalAttachment | null>(null);
	let note = $state('');
	let busy = $state(false);

	const rows = $derived<AdminApproval[]>(data.rows);
	const filtered = $derived(
		rows
			.filter((row) => (tab === 'all' ? true : row.status === tab))
			.filter((row) =>
				query.trim()
					? `${row.requesterName} ${row.requesterHandle} ${row.title} ${row.summary} ${row.kind}`
							.toLowerCase()
							.includes(query.trim().toLowerCase())
					: true
			)
	);
	const selected = $derived<AdminApproval | null>(
		rows.find((row) => row.id === (override ?? data.selectedId)) ?? filtered[0] ?? null
	);

	const kindMeta: Record<ApprovalKind, { label: string; icon: typeof Banknote }> = {
		refund: { label: 'Refund', icon: RotateCcw },
		payout: { label: 'Payout', icon: Banknote },
		verification: { label: 'Verification', icon: IdCard }
	};

	function kindOf(row: AdminApproval) {
		return kindMeta[row.kind] ?? kindMeta.verification;
	}

	function statusChip(row: AdminApproval): { label: string; tone: string } {
		if (row.status === 'approved') return { label: 'Approved', tone: 'chip-ok' };
		if (row.status === 'rejected') return { label: 'Rejected', tone: 'chip-danger' };
		if (row.status === 'cancelled') return { label: 'Cancelled', tone: 'chip' };
		return { label: 'Pending review', tone: 'chip-warn' };
	}

	async function decide(decision: 'approve' | 'reject', target: AdminApproval | null = selected) {
		if (!target) return;
		busy = true;
		const response = await fetch(`/api/approvals/${target.id}/decision`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ decision, note })
		});
		busy = false;
		const payload = (await response.json().catch(() => ({}))) as { message?: string; status?: string };
		if (!response.ok) {
			toasts.error('Decision not applied', payload.message ?? 'Try again.');
			return;
		}
		toasts.ok(
			decision === 'approve' ? 'Request approved' : target.kind === 'payout' ? 'Payout denied' : 'Request rejected',
			decision === 'approve'
				? target.kind === 'refund'
					? `${target.title} — the pass is now refunded and the attendee has been notified.`
					: target.kind === 'payout'
						? `${target.title} — the organizer's payout button now shows "Approved" and cannot be requested again.`
						: `${target.title} — the requester now sees "approved" on the public app.`
				: target.kind === 'payout'
					? `${target.title} — the organizer's payout button now shows "Denied" with your reason.`
					: `${target.title} — the requester sees your reason on the public app.`
		);
		note = '';
		rejectOpen = false;
		override = null;
		await invalidateAll();
	}
</script>

<svelte:head><title>Approvals · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Approvals"
		subtitle="Every request that needs an admin decision: ticket refunds, organizer payout requests, and verification details. Nothing is approved on the public app until it is approved here."
		crumbs={['platform', 'approvals']}
		eyebrow="Public app → console"
	>
		{#snippet actions()}
			<span class="chip {data.mode === 'supabase' ? 'chip-ok' : 'chip-warn'} !text-[8px]" title={data.mode === 'supabase'
				? 'Reading public.approval_requests with the service-role key.'
				: 'No Supabase credentials set — the console is reviewing its seeded demo queue.'}>
				{data.mode === 'supabase' ? 'Live database' : 'Demo dataset'}
			</span>
		{/snippet}
	</PageHeader>

	{#if data.error}
		<div class="panel border border-rose-500/30 p-4 text-[11px] text-rose-200">
			{data.error}
			<span class="mt-1 block text-[#8f8f9b]">Apply <code>supabase/sql/023_approval_requests.sql</code> to your project, then reload.</span>
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Awaiting review</p><Clock size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{data.counts.pending}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Pending on the public web until decided</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Approved</p><BadgeCheck size={13} class="text-emerald-400" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{data.counts.approved}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Applied to the public app</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Rejected</p><X size={13} class="text-rose-300" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{data.counts.rejected}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Reason shown to the requester</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Queue total</p><Search size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{data.counts.all}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Refunds · payouts · verification</p>
		</div>
	</div>

	<div class="panel overflow-hidden">
		<div class="flex flex-wrap items-center gap-2 border-b border-[#26262e] px-4 py-2.5">
			{#each [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']] as [id, label]}
				<button
					type="button"
					class="chip !h-[19px] !text-[8px] {tab === id ? 'chip-ok' : ''}"
					onclick={() => { tab = id as Tab; override = null; }}
				>
					{label} {id === 'all' ? data.counts.all : id === 'pending' ? data.counts.pending : id === 'approved' ? data.counts.approved : data.counts.rejected}
				</button>
			{/each}
			<div class="ml-auto flex items-center gap-1.5 rounded-md border border-[#2b2b33] bg-[#15151a] px-2 py-1">
				<Search size={11} class="text-[#6f6f7b]" />
				<input
					class="w-40 bg-transparent font-code text-[9px] uppercase tracking-[0.08em] text-[#d4d4dc] outline-none placeholder:text-[#5f5f6b]"
					placeholder="Requester, title, kind…"
					bind:value={query}
				/>
			</div>
		</div>

		<div class="grid min-w-0 gap-0 lg:grid-cols-[1.15fr_1fr]">
			<div class="min-w-0 border-b border-[#26262e] lg:border-b-0 lg:border-r">
				<div class="overflow-x-auto">
					<table class="w-full min-w-[420px] border-collapse text-left">
						<thead>
							<tr class="border-b border-[#26262e] font-code text-[7.5px] uppercase tracking-[0.12em] text-[#6f6f7b]">
								<th class="px-4 py-2">Request</th>
								<th class="px-2 py-2">Requester</th>
								<th class="px-2 py-2">Value</th>
								<th class="px-2 py-2">Age</th>
								<th class="px-2 py-2"></th>
							</tr>
						</thead>
						<tbody>
							{#each filtered as row (row.id)}
								{@const meta = kindOf(row)}
								{@const chip = statusChip(row)}
								<tr class="border-b border-[#22222a] last:border-0 {selected?.id === row.id ? 'bg-[#18181f]' : ''}">
									<td class="px-4 py-2.5">
										<p class="flex items-center gap-1.5 text-[10.5px] font-medium text-[#ececf2]">
											<meta.icon size={11} class="text-[#8f8f9b]" /> {row.title}
										</p>
										<p class="mt-0.5 max-w-[190px] truncate text-[8.5px] text-[#6f6f7b]">{row.summary || meta.label}</p>
									</td>
									<td class="px-2 py-2.5">
										<p class="text-[10px] text-[#d4d4dc]">{row.requesterName}</p>
										<p class="font-code text-[8px] text-[#6f6f7b]">@{row.requesterHandle}</p>
									</td>
									<td class="whitespace-nowrap px-2 py-2.5 font-code text-[9px] text-[#d4d4dc]">{row.amountNgn ? money(row.amountNgn) : '—'}</td>
									<td class="whitespace-nowrap px-2 py-2.5 font-code text-[8.5px] text-[#8f8f9b]">{relative(row.requestedAt)}</td>
									<td class="px-2 py-2.5 text-right">
										<button type="button" class="chip !h-[17px] !text-[7.5px] {chip.tone}" aria-label={`Review ${row.title}`} onclick={() => (override = row.id)}>
											{chip.label}
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
					{#if filtered.length === 0}
						<div class="p-4">
							<EmptyState title="Nothing in this tab" message="Requests appear here the moment an attendee or organizer submits one in the public app." />
						</div>
					{/if}
				</div>
			</div>

			{#if selected}
				{@const chip = statusChip(selected)}
				<div class="min-w-0 p-4">
					<div class="flex items-start justify-between gap-2">
						<div>
							<p class="mono-label">Review dossier</p>
							<h3 class="mt-1 font-display text-[16px] font-semibold text-[#f0f0f5]">{selected.title}</h3>
							<p class="mt-0.5 font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">
								{kindOf(selected).label} · {selected.id}
							</p>
						</div>
						<span class="chip {chip.tone} !text-[8px]">{chip.label}</span>
					</div>

					<div class="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-[#292930] bg-[#18181e] p-2.5">
						<div>
							<p class="mono-label !text-[7px]">Requester (full identity)</p>
							<p class="mt-1 text-[11px] font-medium text-[#e6e6ec]">{selected.requesterName}</p>
							<p class="font-code text-[8.5px] text-[#9b9ba8]">@{selected.requesterHandle}</p>
							{#if selected.requesterEmail}
								<p class="mt-0.5 font-code text-[8.5px] text-[#c6bcff]">{selected.requesterEmail}</p>
							{/if}
							{#if selected.requesterPhone}
								<p class="mt-0.5 font-code text-[8.5px] text-[#a0a0ab]">{selected.requesterPhone}</p>
							{/if}
							{#if selected.requesterId}
								<a href="/users/{selected.requesterId}" class="mt-1 inline-flex items-center gap-1 font-code text-[8px] uppercase tracking-[0.08em] text-[#a998ff] hover:underline">
									Open user dossier <ArrowUpRight size={10} />
								</a>
							{/if}
						</div>
						<div class="text-right">
							<p class="mono-label !text-[7px]">Submitted</p>
							<p class="mt-1 text-[10.5px] text-[#d4d4dc]">{relative(selected.requestedAt)}</p>
							<p class="font-code text-[8px] text-[#6f6f7b]">SLA {selected.slaHours}h</p>
						</div>
					</div>

					{#if selected.amountNgn}
						<div class="mt-2.5 flex items-baseline justify-between rounded-lg border border-[#2a2a32] px-3 py-2">
							<span class="text-[10px] text-[#8f8f9b]">Requested value</span>
							<span class="font-display text-[16px] font-semibold text-emerald-300">{money(selected.amountNgn)}</span>
						</div>
					{/if}

					<div class="mt-3 rounded-lg border border-[#2a2a32] p-3">
						<p class="mono-label !text-[8px]">Unredacted submitted details</p>
						<div class="mt-1.5 space-y-1.5 text-[10.5px]">
							{#each selected.details as row}
								<p class="flex justify-between gap-3 border-b border-[#22222a] pb-1 last:border-0 last:pb-0">
									<span class="text-[#a0a0ab]">{row.label}</span>
									<span class="font-code text-right font-semibold select-all text-[#ededf4]">{row.value}</span>
								</p>
							{/each}
						</div>
					</div>

					{#if selected.attachments && selected.attachments.length > 0}
						<div class="mt-3 rounded-lg border border-[#32323d] bg-[#16161d] p-3">
							<p class="mono-label !text-[8px]">Uploaded ID documents ({selected.attachments.length})</p>
							<div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
								{#each selected.attachments as att}
									<div class="overflow-hidden rounded-lg border border-[#2b2b35] bg-[#111116]">
										<div class="flex items-center justify-between border-b border-[#23232c] px-2.5 py-1.5">
											<span class="font-code text-[8.5px] uppercase tracking-[0.1em] text-[#c6bcff]">
												{att.side === 'front' ? 'Front of ID' : 'Back of ID'}
											</span>
											<div class="flex items-center gap-1.5">
												{#if att.dataUrl}
													<button
														type="button"
														onclick={() => (previewAttachment = att)}
														class="font-code text-[8px] uppercase text-[#a998ff] hover:text-white"
													>
														<ZoomIn size={11} />
													</button>
													<a
														href={att.dataUrl}
														download={att.name}
														class="font-code text-[8px] uppercase text-[#8f8f9b] hover:text-white"
														aria-label={`Download ${att.name}`}
													>
														<Download size={11} />
													</a>
												{/if}
											</div>
										</div>
										{#if att.dataUrl && att.mimeType.startsWith('image/')}
											<button
												type="button"
												onclick={() => (previewAttachment = att)}
												class="block w-full bg-black/40"
											>
												<img
													src={att.dataUrl}
													alt={`${att.side} ID document`}
													class="h-36 w-full object-contain"
												/>
											</button>
										{:else if att.dataUrl}
											<div class="flex flex-col items-center justify-center gap-2 p-4 text-center">
												<FileText size={22} class="text-[#c6bcff]" />
												<p class="max-w-full truncate font-code text-[9px] text-[#d4d4dc]">{att.name}</p>
												<div class="flex gap-1.5">
													<button type="button" class="btn btn-xs" onclick={() => (previewAttachment = att)}>Preview PDF</button>
													<a href={att.dataUrl} download={att.name} class="btn btn-xs">Download</a>
												</div>
											</div>
										{:else}
											<div class="p-3 text-center font-code text-[9px] text-[#7f7f8c]">
												File name recorded: {att.name}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if selected.summary}
						<p class="mt-2.5 rounded-md border border-[#2b2b33] bg-[#15151a] px-2.5 py-2 text-[10px] leading-relaxed text-[#a0a0ab]">{selected.summary}</p>
					{/if}

					{#if selected.status === 'pending'}
						<div class="mt-3">
							<label class="field-label" for="approval-note">Decision note (shown to the requester)</label>
							<textarea
								id="approval-note"
								class="textarea !min-h-[58px] !text-[10.5px]"
								bind:value={note}
								placeholder={selected.kind === 'refund'
									? 'e.g. Pass never scanned and the request is inside the 7-day window.'
									: selected.kind === 'payout'
										? 'e.g. Cleared balance and destination account match the verified identity.'
										: 'e.g. Document and selfie matched.'}
							></textarea>
							<p class="mt-1 font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">
								Requester sees {selected.kind === 'refund' ? 'the pass flip to refunded' : selected.kind === 'payout' ? 'the payout marked approved' : 'the check marked verified'} immediately after approval.
							</p>
						</div>
						<div class="mt-2.5 space-y-1.5">
							<button type="button" class="btn btn-primary w-full" disabled={busy} onclick={() => decide('approve')}>
								<Check size={13} /> {selected.kind === 'refund' ? 'Approve refund' : selected.kind === 'payout' ? 'Approve payout' : 'Approve verification'}
							</button>
							<button type="button" class="btn btn-sm w-full" disabled={busy} onclick={() => (rejectOpen = true)}>
								<X size={13} /> {selected.kind === 'payout' ? 'Deny with a reason' : 'Reject with a reason'}
							</button>
						</div>
					{:else}
						<div class="mt-3 rounded-lg border border-[#2a2a32] p-3 text-[10px]">
							<p class="mono-label !text-[8px]">Decision</p>
							<p class="mt-1 text-[#dcdce4]">{selected.status === 'approved' ? 'Approved' : selected.status === 'rejected' ? 'Rejected' : 'Cancelled'}
								{#if selected.decidedBy}· {selected.decidedBy}{/if}
								{#if selected.decidedAt}<span class="text-[#6f6f7b]"> · {relative(selected.decidedAt)}</span>{/if}
							</p>
							<p class="mt-1 text-[#a0a0ab]">{selected.note || 'No note was recorded.'}</p>
						</div>
					{/if}
				</div>
			{:else}
				<div class="p-4">
					<EmptyState title="Select a request" message="Pick a request on the left to review its details." />
				</div>
			{/if}
		</div>
	</div>
</div>

<Sheet open={rejectOpen} title="Reject request" subtitle="The requester sees this reason on the public app." onclose={() => (rejectOpen = false)} width="420px">
	<form class="space-y-3" onsubmit={(event) => { event.preventDefault(); decide('reject'); }}>
		<label class="field-label" for="reject-reason">Reason</label>
		<textarea
			id="reject-reason"
			class="textarea"
			bind:value={note}
			required
			placeholder="e.g. The pass was already scanned at the gate, so it cannot be refunded."
		></textarea>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (rejectOpen = false)}>Cancel</button>
			<button type="submit" class="btn btn-sm btn-danger" disabled={busy || !note.trim()}>Reject request</button>
		</div>
	</form>
</Sheet>

<Sheet
	open={previewAttachment !== null}
	title={previewAttachment ? `${previewAttachment.side === 'front' ? 'Front' : 'Back'} ID Document · ${previewAttachment.name}` : 'ID Document'}
	subtitle="Full-resolution KYC document submitted by the user"
	onclose={() => (previewAttachment = null)}
	width="680px"
>
	{#if previewAttachment?.dataUrl}
		<div class="space-y-3">
			{#if previewAttachment.mimeType.startsWith('image/')}
				<img
					src={previewAttachment.dataUrl}
					alt={previewAttachment.name}
					class="max-h-[72vh] w-full rounded-lg border border-[#2d2d37] bg-black object-contain"
				/>
			{:else}
				<iframe
					src={previewAttachment.dataUrl}
					title={previewAttachment.name}
					class="h-[70vh] w-full rounded-lg border border-[#2d2d37] bg-white"
				></iframe>
			{/if}
			<div class="flex justify-end gap-2">
				<a href={previewAttachment.dataUrl} download={previewAttachment.name} class="btn btn-sm btn-primary">
					<Download size={12} /> Download original ({previewAttachment.name})
				</a>
				<button type="button" class="btn btn-sm" onclick={() => (previewAttachment = null)}>Close</button>
			</div>
		</div>
	{/if}
</Sheet>
