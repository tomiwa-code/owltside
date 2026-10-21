<script lang="ts">
	import {
		Archive,
		ArrowUpRight,
		Ban,
		BookOpen,
		Download,
		Flag,
		Gavel,
		MessageSquareWarning,
		Radar,
		Search,
		ShieldAlert,
		ShieldCheck,
		Snowflake,
		TriangleAlert,
		X
	} from '@lucide/svelte';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { caseStatus, chipClass, severityMeta } from '$admin/utils/status';
	import { money, num, relative, time } from '$admin/utils/format';
	import type { AdminCase } from '$admin/types';
	import PageHeader from '$components/PageHeader.svelte';
	import StatusChip from '$components/StatusChip.svelte';
	import SearchField from '$components/SearchField.svelte';

	let { data } = $props();

	let note = $state('');
	let busy = $state(false);
	let override = $state<string | null>(null);

	const selected = $derived<AdminCase | null>(
		data.cases.find((item) => item.id === (override ?? data.selectedId)) ?? data.selected ?? null
	);
	const atRisk = $derived(data.open.filter((item) => item.severity === 'critical' || item.severity === 'high').length);
	const frozenValue = $derived(selected?.escrowNgn ?? 0);

	function hrefFor(id: string): string {
		const url = new URL(page.url);
		url.searchParams.set('case', id);
		return `${url.pathname}${url.search}`;
	}

	async function enforce(action: 'warn' | 'dismiss' | 'freeze') {
		if (!selected) return;
		if (note.trim().length < 12) {
			toasts.error('Justification required', 'Write at least 12 characters for the audit trail.');
			return;
		}
		busy = true;
		const response = await fetch(`/api/cases/${selected.id}/resolve`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action, note: note.trim() })
		});
		busy = false;
		if (!response.ok) {
			toasts.error('Enforcement blocked', 'Your access tier cannot apply this action.');
			return;
		}
		toasts.ok(
			action === 'freeze' ? 'Sales & escrow frozen' : action === 'warn' ? 'Warning issued' : 'Report dismissed',
			action === 'freeze' ? `${money(selected.escrowNgn)} held pending investigation.` : `${selected.ref} closed with an audit entry.`
		);
		note = '';
		await invalidateAll();
	}
</script>

<svelte:head><title>Moderation · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Reports & Content Moderation"
		subtitle="Review community trust signals, triage reported listings and organizers, and take policy enforcement actions."
		crumbs={['trust & safety', 'queue-04']}
		eyebrow="Active triage"
	>
		{#snippet actions()}
			<a class="btn btn-sm" href="/api/export/moderation" download><Download size={12} /> Export incident report</a>
			<button type="button" class="btn btn-sm" onclick={() => toasts.info('Policy rules', 'Publishing policy v2.4 opened in a secure side panel.')}><BookOpen size={12} /> Policy rules guide</button>
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Active incidents</p><Flag size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 flex items-baseline gap-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{data.counts.open} <span class="font-code text-[9px] font-normal text-[#8f8f9b]">flagged</span></p>
			<p class="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-[#8f8f9b]"><span class="status-dot"></span> {atRisk} critical within SLA &lt; 1h</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Avg resolution time</p><Radar size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 flex items-baseline gap-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{data.counts.avgResolutionMins} <span class="font-code text-[9px] font-normal text-[#8f8f9b]">mins</span></p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Target SLA &lt; 2.0h · <span class="text-emerald-300">+18% faster</span></p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Auto-quarantined</p><ShieldAlert size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 flex items-baseline gap-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{data.counts.quarantined} <span class="font-code text-[9px] font-normal text-[#8f8f9b]">entities</span></p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Spam heuristics &amp; fraud traps</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Appeal success rate</p><ShieldCheck size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{data.counts.appealSuccessPct}%</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">95.8% accuracy on first triage</p>
		</div>
	</div>

	<section class="panel flex flex-col gap-2 p-2.5 xl:flex-row xl:items-center">
		<form method="GET" class="flex flex-1 flex-col gap-2 lg:flex-row lg:items-center">
			<SearchField value={data.filters.q} placeholder="Search reports by entity ID, ticket ref, reporter…" class="lg:w-[300px]" />
			<select name="status" class="select !h-[32px] !text-[10.5px]" aria-label="Filter case status">
				<option value="active" selected={data.filters.status === 'active'}>Status: All active ({data.counts.open})</option>
				<option value="all" selected={data.filters.status === 'all'}>All reports</option>
				<option value="escalated" selected={data.filters.status === 'escalated'}>Escalated</option>
				<option value="quarantined" selected={data.filters.status === 'quarantined'}>Quarantined</option>
				<option value="resolved" selected={data.filters.status === 'resolved'}>Resolved</option>
				<option value="dismissed" selected={data.filters.status === 'dismissed'}>Dismissed</option>
			</select>
			<select name="severity" class="select !h-[32px] !text-[10.5px]" aria-label="Filter severity">
				<option value="high" selected={data.filters.severity === 'high'}>Severity: High &amp; critical</option>
				<option value="all" selected={data.filters.severity === 'all'}>Severity: All</option>
				<option value="critical" selected={data.filters.severity === 'critical'}>Critical</option>
				<option value="medium" selected={data.filters.severity === 'medium'}>Medium</option>
				<option value="low" selected={data.filters.severity === 'low'}>Low</option>
			</select>
			<button class="btn btn-sm btn-primary" type="submit"><Search size={11} /> Apply</button>
			<a class="btn btn-sm btn-ghost" href="/moderation">Reset</a>
		</form>
		<span class="chip !h-[26px] !text-[8.5px]">Last 7 days</span>
	</section>

	<div class="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1.55fr]">
		<section class="space-y-2">
			<div class="flex items-center justify-between px-0.5">
				<p class="mono-label">Moderation queue <span class="text-[#54545f]">({data.cases.length} in batch)</span></p>
				<p class="font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">Sort: priority desc</p>
			</div>
			{#each data.cases as item (item.id)}
				{@const sev = severityMeta(item.severity)}
				{@const status = caseStatus(item.status)}
				<button
					type="button"
					class="panel w-full p-3 text-left transition {selected?.id === item.id ? '!border-[#c6bcff]/40 bg-[#1e1e26]' : 'hover:bg-[#1b1b22]'}"
					onclick={() => (override = item.id)}
				>
					<div class="flex items-center justify-between gap-2">
						<div class="flex items-center gap-1.5">
							<span class={chipClass(sev.tone)}>{sev.label}</span>
							<span class="font-code text-[8px] uppercase tracking-[0.04em] text-[#6f6f7b]">{item.ref}</span>
						</div>
						<StatusChip label={status.label} tone={status.tone} />
					</div>
					<p class="mt-1.5 font-display text-[12.5px] font-medium leading-snug text-[#ececf1]">{item.title}</p>
					<div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-code text-[8px] uppercase tracking-[0.04em] text-[#6f6f7b]">
						<span class="flex items-center gap-1"><Flag size={8} /> {item.target}</span>
						<span class="flex items-center gap-1"><MessageSquareWarning size={8} /> {item.reportedBy}</span>
						<span class="ml-auto lowercase tracking-normal">{relative(item.createdAt)}</span>
					</div>
				</button>
			{:else}
				<div class="panel p-6 text-center text-[11px] text-[#6f6f7b]">No reports match this filter.</div>
			{/each}
			{#if data.cases.length}
				<div class="flex items-center justify-between px-0.5 pt-1 font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">
					<span>Showing {data.cases.length} of {data.cases.length} open signals</span>
					<span class="flex gap-1"><span class="chip !h-[16px] !px-1.5 !text-[7px]">‹</span><span class="chip !h-[16px] !px-1.5 !text-[7px]">›</span></span>
				</div>
			{/if}
		</section>

		{#if selected}
			{@const sev = severityMeta(selected.severity)}
			{@const status = caseStatus(selected.status)}
			<section class="panel overflow-hidden">
				<header class="flex flex-wrap items-start justify-between gap-3 border-b border-[#26262e] px-4 py-3">
					<div>
						<p class="font-code text-[8px] uppercase tracking-[0.12em] text-[#6f6f7b]">
							Incident dossier <span class="text-[#c6bcff]">{selected.ref}</span>
						</p>
						<p class="mt-1 flex flex-wrap items-center gap-1.5">
							<span class={chipClass(sev.tone)}>{sev.label}</span>
							<StatusChip label={status.label} tone={status.tone} />
							<span class="chip !h-[17px] !text-[7.5px]">{selected.category}</span>
						</p>
					</div>
					<div class="text-right">
						<p class="font-code text-[8.5px] uppercase tracking-[0.04em] text-[#8f8f9b]">{time(selected.createdAt)} WAT</p>
						<p class="font-code text-[8px] text-[#6f6f7b]">SLA {selected.slaHours}h · assigned {selected.reportedBy}</p>
					</div>
				</header>

				<div class="space-y-3 p-4">
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
						<div class="rounded-lg border border-[#2a2a32] bg-[#18181e] p-2.5">
							<p class="mono-label !text-[7px]">Target entity</p>
							<p class="mt-1 text-[11px] text-[#e6e6ec]">{selected.target}</p>
							<p class="font-code text-[8px] text-[#6f6f7b]">{selected.targetKind} · {selected.ref}</p>
							<a href={selected.targetKind === 'Organizer' ? '/organizers' : selected.targetKind === 'Event' ? '/events' : '/users'} class="mt-1 inline-flex items-center gap-1 font-code text-[7.5px] uppercase text-[#c6bcff] hover:underline">View full entity graph <ArrowUpRight size={8} /></a>
						</div>
						<div class="rounded-lg border border-[#2a2a32] bg-[#18181e] p-2.5">
							<p class="mono-label !text-[7px]">Reporter &amp; compliance</p>
							<p class="mt-1 text-[11px] text-[#e6e6ec]">{selected.reportedBy}</p>
							<p class="font-code text-[8px] text-[#6f6f7b]">KYC verified · trusted signal weight 0.86</p>
							<p class="mt-1 flex items-center gap-1 text-[8px] text-amber-300"><TriangleAlert size={8} /> {selected.targetKind === 'Organizer' ? 'Paystack subaccount linked' : 'Wallet passes issued'}</p>
						</div>
					</div>

					<div>
						<p class="mono-label !text-[8px]">Statement &amp; forensic telemetry</p>
						<div class="mt-1.5 space-y-1.5">
							<div class="rounded-md border border-[#2a2a32] p-2.5">
								<p class="flex items-center gap-1.5 font-code text-[7.5px] uppercase tracking-[0.08em] text-[#8f8f9b]"><MessageSquareWarning size={9} /> Reporter testimony</p>
								<p class="mt-1 text-[10.5px] leading-relaxed text-[#c9c9d4]">“{selected.summary}”</p>
							</div>
							<div class="overflow-hidden rounded-md border border-[#2a2a32]">
								<div class="flex items-center justify-between border-b border-[#26262e] px-2.5 py-1.5">
									<p class="font-code text-[7.5px] uppercase tracking-[0.08em] text-[#8f8f9b]">Scanner telemetry log</p>
									<span class="font-code text-[7.5px] text-[#6f6f7b]">{selected.evidence.length} collision events</span>
								</div>
								{#each selected.evidence as entry}
									<div class="flex items-start gap-2 border-b border-[#24242c] px-2.5 py-1.5 last:border-0">
										<span class="font-code text-[8px] text-[#6f6f7b]">[{entry.at}]</span>
										<p class="min-w-0 flex-1 font-code text-[8.5px] leading-relaxed text-[#c9c9d4]">{entry.text}</p>
									</div>
								{:else}
									<p class="px-2.5 py-2 font-code text-[8.5px] text-[#6f6f7b]">No device-level evidence attached.</p>
								{/each}
							</div>
						</div>
					</div>

					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
						<div class="rounded-lg border border-[#2a2a32] p-2.5">
							<p class="mono-label !text-[7px]">Potential fraud volume</p>
							<p class="mt-1 font-display text-[16px] font-semibold text-[#f0f0f5]">{money(selected.exposureNgn)}</p>
							<p class="font-code text-[8px] text-[#6f6f7b]">Estimated from forged admissions</p>
						</div>
						<div class="rounded-lg border border-red-500/25 bg-red-500/[0.05] p-2.5">
							<div class="flex items-center justify-between"><p class="mono-label !text-[7px] !text-red-200/70">Escrow hold balance</p><span class="chip chip-danger !h-[15px] !text-[6.5px]">High exposure</span></div>
							<p class="mt-1 font-display text-[16px] font-semibold text-red-100">{money(frozenValue)}</p>
							<p class="font-code text-[8px] text-red-200/60">Funds available for full freeze</p>
						</div>
					</div>

					<div>
						<p class="mono-label !text-[8px]">Enforcement actions &amp; audit trail <span class="normal-case text-red-300">* mandatory justification</span></p>
						<textarea
							class="textarea mt-1.5 !min-h-[64px] !text-[10.5px]"
							bind:value={note}
							placeholder="Provide formal justification for the audit trail... (e.g. Confirmed static barcode replay attacks at gate scanner; frozen under SecOps Protocol 4B)"
						></textarea>
						<div class="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
							<button type="button" class="btn btn-sm" disabled={busy} onclick={() => enforce('warn')}><Gavel size={11} /> Issue warning</button>
							<button type="button" class="btn btn-sm" disabled={busy} onclick={() => enforce('dismiss')}><X size={11} /> Dismiss report</button>
							<button type="button" class="btn btn-sm btn-danger" disabled={busy} onclick={() => enforce('freeze')}><Snowflake size={11} /> Freeze sales &amp; escrow</button>
						</div>
						<p class="mt-1.5 flex items-center gap-1.5 font-code text-[7.5px] uppercase tracking-[0.06em] text-[#54545f]"><Archive size={8} /> Every action is signed and appended to the immutable ledger</p>
					</div>

					{#if selected.resolutionNote}
						<div class="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-2.5">
							<p class="mono-label !text-[7px] !text-emerald-200/70">Prior resolution</p>
							<p class="mt-1 text-[9.5px] leading-relaxed text-emerald-100/70">{selected.resolutionNote}</p>
						</div>
					{/if}
				</div>
			</section>
		{/if}
	</div>
</div>
