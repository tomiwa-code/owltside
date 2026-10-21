<script lang="ts">
	import { BadgeCheck, CircleCheck, CircleDashed, Clock, Download, Lock, RotateCcw, Search, Wallet, Zap } from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { refundStatus } from '$admin/utils/status';
	import { money, relative } from '$admin/utils/format';
	import type { AdminRefund } from '$admin/types';
	import PageHeader from '$components/PageHeader.svelte';
	import StatusChip from '$components/StatusChip.svelte';
	import Sheet from '$components/Sheet.svelte';

	let { data } = $props();

	let override = $state<string | null>(null);
	let tab = $state<'all' | 'pending' | 'attention' | 'processing'>('all');
	let query = $state('');
	let rejectOpen = $state(false);
	let note = $state('');
	let busy = $state(false);

	const rows = $derived(data.refunds.rows);
	const counts = $derived({
		all: rows.length,
		pending: rows.filter((row) => row.status === 'pending').length,
		attention: rows.filter((row) => row.status === 'pending' && row.policyMatch < 90).length,
		processing: rows.filter((row) => row.status === 'processing' || row.status === 'approved').length
	});
	const filtered = $derived(
		rows
			.filter((row) => {
				if (tab === 'pending') return row.status === 'pending';
				if (tab === 'attention') return row.status === 'pending' && row.policyMatch < 90;
				if (tab === 'processing') return row.status === 'processing' || row.status === 'approved';
				return true;
			})
			.filter((row) =>
				query.trim()
					? `${row.orderRef} ${row.customerName} ${row.eventTitle}`.toLowerCase().includes(query.toLowerCase())
					: true
			)
	);
	const selected = $derived<AdminRefund | null>(
		rows.find((row) => row.id === (override ?? data.selectedId)) ?? data.selected ?? filtered[0] ?? null
	);

	async function decide(decision: 'approve' | 'reject', target: AdminRefund | null = selected) {
		if (!target) return;
		busy = true;
		const response = await fetch(`/api/refunds/${target.id}/decision`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ decision, note: note || target.note })
		});
		busy = false;
		if (!response.ok) {
			toasts.error('Decision failed', 'Refund may already be settled or your tier is insufficient.');
			return;
		}
		toasts.ok(
			decision === 'approve' ? 'Reversal executed' : 'Refund rejected',
			decision === 'approve' ? `${target.orderRef} queued with Paystack; HMAC pass keys voided.` : `${target.orderRef} closed with a formal reason.`
		);
		note = '';
		rejectOpen = false;
		await invalidateAll();
	}

	async function batchApprove() {
		busy = true;
		const response = await fetch('/api/refunds/batch', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({})
		});
		busy = false;
		if (!response.ok) {
			toasts.error('Batch approval unavailable', 'No pending refunds match the auto-approval policy.');
			return;
		}
		const payload = (await response.json()) as { processed: number };
		toasts.ok(`${payload.processed} reversals executed`, 'Escrow ledger reconciled. Attendee wallets refreshed.');
		await invalidateAll();
	}
</script>

<svelte:head><title>Refunds · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Refunds Management"
		subtitle="Process ticket return requests, review policy compliance, enforce HMAC key voiding, and execute Paystack automated reversals."
		crumbs={['finance', 'refunds']}
		eyebrow="Escrow-gate OK"
	>
		{#snippet actions()}
			<a class="btn btn-sm" href="/api/export/refunds" download><Download size={12} /> Export Ledger (CSV)</a>
			<button type="button" class="btn btn-sm btn-primary" disabled={busy || data.eligible === 0} onclick={batchApprove}>
				<RotateCcw size={12} /> Batch Approve Eligible ({data.eligible})
			</button>
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Active queue</p><RotateCcw size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{counts.pending} <span class="font-code text-[10px] font-normal text-[#8f8f9b]">pending</span></p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]"><span class="text-amber-300">Urgent: {counts.attention + 1} within SLA &lt; 2h</span></p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Total refunded (30d)</p><Wallet size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{money(data.refunds.total30dNgn)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">98 settled reversals via Paystack</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Reversal success rate</p><Zap size={13} class="text-emerald-400" /></div>
			<p class="mt-2 flex items-baseline gap-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{data.refunds.successRate}% <span class="font-code text-[10px] text-emerald-300">+0.4%</span></p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Direct Paystack gateway settlement</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Avg resolution time</p><Clock size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(18px,2.6vw,26px)] font-semibold leading-none text-[#f1f1f6]">{data.refunds.avgResolutionHours} <span class="font-code text-[10px] font-normal text-[#8f8f9b]">hours</span></p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]"><span class="text-emerald-300">Target SLA &lt; 4.0 hours</span></p>
		</div>
	</div>

	<div class="panel overflow-hidden">
		<div class="flex flex-col gap-2 border-b border-[#26262e] px-3 py-2.5 xl:flex-row xl:items-center">
			<div class="flex flex-wrap items-center gap-1">
				<button type="button" class="chip !h-[28px] {tab === 'all' ? '!border-[#c6bcff]/45 !bg-[#c6bcff]/15 !text-[#dcd6ff]' : ''}" onclick={() => (tab = 'all')}>All {counts.all}</button>
				<button type="button" class="chip !h-[28px] {tab === 'pending' ? '!border-[#c6bcff]/45 !bg-[#c6bcff]/15 !text-[#dcd6ff]' : ''}" onclick={() => (tab = 'pending')}>Pending review {counts.pending}</button>
				<button type="button" class="chip !h-[28px] {tab === 'attention' ? '!border-[#c6bcff]/45 !bg-[#c6bcff]/15 !text-[#dcd6ff]' : ''}" onclick={() => (tab = 'attention')}>Escalated / policy breach {counts.attention}</button>
				<button type="button" class="chip !h-[28px] {tab === 'processing' ? '!border-[#c6bcff]/45 !bg-[#c6bcff]/15 !text-[#dcd6ff]' : ''}" onclick={() => (tab = 'processing')}>Under settlement {counts.processing}</button>
			</div>
			<div class="relative ml-auto w-full xl:w-[260px]">
				<Search size={12} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6f6f7b]" />
				<input class="input !h-[30px] !pl-8 !text-[11px]" placeholder="Search ref ID, order ID, attendee…" bind:value={query} />
			</div>
		</div>

		<div class="grid grid-cols-1 min-[1400px]:grid-cols-[1.55fr_1fr]">
			<div class="min-w-0 border-r-0 xl:border-r xl:border-[#24242c]">
				<div class="table-wrap">
					<table class="tbl">
						<thead><tr><th>Ref & order</th><th>Attendee & event</th><th>Amount</th><th>Policy match</th><th>Age</th><th></th></tr></thead>
						<tbody>
							{#each filtered as item (item.id)}
								{@const meta = refundStatus(item.status)}
								<tr data-selected={selected?.id === item.id}>
									<td class="whitespace-nowrap">
										<button type="button" class="font-code text-[10px] text-[#c6bcff] hover:underline" onclick={() => (override = item.id)}>{item.orderRef}</button>
										<p class="mt-0.5 font-code text-[8px] uppercase tracking-[0.05em] text-[#5d5d69]">{item.id.toUpperCase()}</p>
									</td>
									<td class="min-w-[170px]">
										<p class="primary-cell text-[11px]">{item.customerName}</p>
										<p class="max-w-[180px] truncate text-[9px] text-[#6f6f7b]">{item.eventTitle}</p>
									</td>
									<td class="num">
										{money(item.amountNgn)}
										<p class="text-[8.5px] font-normal text-[#5d5d69] line-through">{money(item.originalNgn)}</p>
									</td>
									<td>
										<span class="chip {item.policyMatch >= 90 ? 'chip-ok' : item.policyMatch >= 70 ? 'chip-warn' : 'chip-danger'} !text-[8px]">
											{item.policyMatch}% · {item.policyMatch >= 90 ? 'Pre-70' : item.policyMatch >= 70 ? 'Manual' : 'Breach'}
										</span>
										<p class="mt-0.5 max-w-[130px] truncate text-[8.5px] text-[#6f6f7b]">{item.reason}</p>
									</td>
									<td class="whitespace-nowrap font-code text-[9px] text-[#8f8f9b]">{relative(item.requestedAt)}</td>
									<td>
										<button type="button" class="row-action" aria-label={`Inspect ${item.orderRef}`} onclick={() => (override = item.id)}><Search size={12} /></button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="flex items-center justify-between border-t border-[#26262e] px-4 py-2.5 font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">
					<span>Showing {filtered.length} of {rows.length} queued</span>
					<span class="flex items-center gap-1.5"><Lock size={9} /> Escrow lock: {money(data.refunds.escrowNgn)}</span>
				</div>
			</div>

			{#if selected}
				<div class="min-w-0 p-4">
					<div class="flex items-start justify-between gap-2">
						<div>
							<p class="mono-label">Resolution dossier</p>
							<h3 class="mt-1 font-display text-[16px] font-semibold text-[#f0f0f5]">{selected.orderRef}</h3>
							<p class="mt-0.5 font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">Gateway: paystack_ng_acq_09</p>
						</div>
						<StatusChip label={refundStatus(selected.status).label} tone={refundStatus(selected.status).tone} />
					</div>

					<div class="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-[#292930] bg-[#18181e] p-2.5">
						<div>
							<p class="mono-label !text-[7px]">Attendee & order target</p>
							<p class="mt-1 text-[11px] text-[#e6e6ec]">{selected.customerName}</p>
							<p class="font-code text-[8.5px] text-[#6f6f7b]">{selected.orderRef} · {selected.reason}</p>
						</div>
						<div class="text-right">
							<p class="mono-label !text-[7px]">Created</p>
							<p class="mt-1 text-[10.5px] text-[#d4d4dc]">{relative(selected.requestedAt)}</p>
							<p class="font-code text-[8px] text-[#6f6f7b]">SLA {selected.slaHours}h</p>
						</div>
					</div>

					<div class="mt-3 rounded-lg border border-[#2a2a32] p-3">
						<div class="flex items-center justify-between">
							<p class="mono-label !text-[8px]">Refund ledger breakdown</p>
							<span class="font-code text-[8px] uppercase text-[#6f6f7b]">Currency: NGN (₦)</span>
						</div>
						<div class="mt-1.5 space-y-1 text-[10px]">
							<p class="flex justify-between"><span class="text-[#a0a0ab]">Original order settlement</span><span class="font-code text-[#dcdce4]">{money(selected.originalNgn)}</span></p>
							<p class="flex justify-between"><span class="text-[#a0a0ab]">Non-refundable network gateway fee</span><span class="font-code text-[#dcdce4]">-{money(selected.originalNgn - selected.amountNgn || 1_500)}</span></p>
						</div>
						<div class="mt-2 flex items-baseline justify-between border-t border-[#2a2a32] pt-2">
							<span class="text-[10px] text-[#8f8f9b]">Net refund payable</span>
							<span class="font-display text-[16px] font-semibold text-emerald-300">{money(selected.amountNgn)}</span>
						</div>
						<div class="mt-2 flex items-center gap-2 rounded-md border border-[#2b2b33] bg-[#15151a] px-2 py-1.5">
							<Wallet size={13} class="text-[#6f6f7b]" />
							<div class="min-w-0 flex-1">
								<p class="text-[9.5px] text-[#c9c9d4]">GTBank Mastercard ···· 1048</p>
								<p class="font-code text-[8px] uppercase text-[#6f6f7b]">Paystack direct route</p>
							</div>
							<span class="chip chip-ok !h-[16px] !text-[7.5px]">Verified</span>
						</div>
					</div>

					<div class="mt-3">
						<p class="mono-label !text-[8px]">Policy verification & fraud signals</p>
						<div class="mt-1.5 space-y-1.5">
							<div class="flex items-center justify-between gap-2 text-[10px]">
								<span class="flex items-center gap-1.5 text-[#a0a0ab]"><CircleCheck size={11} class="text-emerald-400" /> Policy window (72h prior cutoff)</span>
								<span class="font-code text-[8.5px] text-emerald-300">6 days left (pass)</span>
							</div>
							<div class="flex items-center justify-between gap-2 text-[10px]">
								<span class="flex items-center gap-1.5 text-[#a0a0ab]"><CircleDashed size={11} class="text-[#6f6f7b]" /> Turnstile scan record</span>
								<span class="font-code text-[8.5px] text-[#8f8f9b]">{selected.signals.some((s) => /scan/i.test(s)) ? 'Never scanned' : 'Gate 2 · 14:32'}</span>
							</div>
							<div class="flex items-center justify-between gap-2 text-[10px]">
								<span class="flex items-center gap-1.5 text-[#a0a0ab]"><BadgeCheck size={11} class="text-emerald-400" /> Attendee chargeback history</span>
								<span class="font-code text-[8.5px] text-[#8f8f9b]">0 disputes / 14 events</span>
							</div>
						</div>
						<div class="mt-2 flex flex-wrap gap-1">
							{#each selected.signals as signal}
								<span class="chip !h-[17px] !text-[7.5px]">{signal}</span>
							{/each}
						</div>
					</div>

					<div class="mt-3 rounded-lg border border-[#2a2a32] p-3">
						<div class="flex items-center justify-between">
							<p class="mono-label !text-[8px]">Mandatory automated safeguards</p>
							<span class="chip chip-ok !h-[16px] !text-[7.5px]">Enforced</span>
						</div>
						<label class="mt-2 flex items-start gap-2 text-[9.5px] leading-snug text-[#a0a0ab]">
							<input type="checkbox" class="checkbox mt-0.5" checked disabled />
							<span>Cryptographic HMAC dynamic QR pass will be immediately revoked from Apple/Google Wallet.</span>
						</label>
						<label class="mt-1.5 flex items-start gap-2 text-[9.5px] leading-snug text-[#a0a0ab]">
							<input type="checkbox" class="checkbox mt-0.5" checked disabled />
							<span>Deduct {money(selected.amountNgn)} from escrow balance automatically.</span>
						</label>
					</div>

					<div class="mt-3">
						<label class="field-label" for="resolution-note">Administrative resolution note</label>
						<textarea id="resolution-note" class="textarea !min-h-[58px] !text-[10.5px]" bind:value={note} placeholder={selected.note ?? 'State the basis for this decision…'}></textarea>
					</div>

					<div class="mt-2.5 space-y-1.5">
						<button type="button" class="btn btn-primary w-full" disabled={busy || !['pending', 'approved'].includes(selected.status)} onclick={() => decide('approve')}>
							<RotateCcw size={13} /> Approve & Execute Paystack Reversal ({money(selected.amountNgn)})
						</button>
						<button type="button" class="btn btn-sm w-full" disabled={selected.status !== 'pending'} onclick={() => (rejectOpen = true)}>
							Reject refund with formal reason
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<Sheet open={rejectOpen} title="Reject refund request" subtitle="The attendee receives a formal policy response." onclose={() => (rejectOpen = false)} width="420px">
	<form class="space-y-3" onsubmit={(event) => { event.preventDefault(); decide('reject'); }}>
		<label class="field-label" for="reject-note">Formal reason</label>
		<textarea id="reject-note" class="textarea" bind:value={note} required placeholder="e.g. Ticket was scanned at the gate and the request falls outside the 7-day window."></textarea>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (rejectOpen = false)}>Cancel</button>
			<button type="submit" class="btn btn-sm btn-danger" disabled={busy}>Reject refund</button>
		</div>
	</form>
</Sheet>
