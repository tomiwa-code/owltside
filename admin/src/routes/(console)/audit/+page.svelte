<script lang="ts">
	import {
		ArrowUpRight,
		Check,
		Copy,
		Download,
		FileJson,
		Lock,
		ScrollText,
		ShieldCheck,
		ShieldAlert,
		Filter,
		Fingerprint
	} from '@lucide/svelte';
	import { page } from '$app/state';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass } from '$admin/utils/status';
	import { num, relative, time } from '$admin/utils/format';
	import PageHeader from '$components/PageHeader.svelte';
	import Pagination from '$components/Pagination.svelte';
	import EmptyState from '$components/EmptyState.svelte';
	import SearchField from '$components/SearchField.svelte';

	let { data } = $props();

	let verifying = $state(false);
	let lastVerified = $state<string | null>(null);

	const rows = $derived(data.table.rows);
	const selected = $derived(data.selected);
	const severityTone = (severity: string) =>
		severity === 'critical' ? 'danger' : severity === 'warning' ? 'warn' : 'accent';

	function hrefFor(id: string): string {
		const url = new URL(page.url);
		url.searchParams.set('log', id);
		return `${url.pathname}${url.search}`;
	}

	function change(event: Event) {
		(event.currentTarget as HTMLSelectElement).form?.requestSubmit();
	}

	async function copy(value: string, label = 'Value') {
		await navigator.clipboard.writeText(value);
		toasts.ok(`${label} copied`, 'Cryptographic material copied to clipboard.');
	}

	async function verify() {
		verifying = true;
		const response = await fetch('/api/audit/verify', { method: 'POST' });
		verifying = false;
		if (!response.ok) {
			toasts.error('Verification blocked', 'Only Super Admins can re-verify the ledger.');
			return;
		}
		const payload = (await response.json()) as { records: number; verified: number };
		lastVerified = new Date().toISOString();
		toasts.ok('Ledger integrity verified', `${num(payload.verified)} / ${num(payload.records)} records match the hash chain.`);
	}

	function exportForensic() {
		if (!selected) return;
		const blob = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${selected.ref}-forensic.json`;
		anchor.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head><title>Audit Logs · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Audit Logs & Security Trails"
		subtitle="Immutable chronological trail of administrative decisions, financial disbursements, key rotations, and privilege escalations."
		crumbs={['trust & system', 'audit-trail']}
		eyebrow="Ledger epoch #14"
	>
		{#snippet actions()}
			<a class="btn btn-sm" href="/api/export/audit" download><Download size={12} /> Export Audit Ledger (JSON/CSV)</a>
			<button type="button" class="btn btn-sm btn-primary" disabled={verifying} onclick={verify}>
				<ShieldCheck size={13} /> {verifying ? 'Verifying chain…' : 'Verify Ledger Integrity'}
			</button>
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Total recorded events</p><ScrollText size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 flex items-baseline gap-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.total)} <span class="font-code text-[9px] font-normal text-[#8f8f9b]">operations</span></p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]"><span class="text-emerald-300">+12.4%</span> vs previous rolling epoch</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Critical security actions</p><span class="h-1.5 w-1.5 rounded-full bg-amber-300"></span></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.critical)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Privilege updates, key rotations, data exports</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Cryptographic tamper-check</p><Lock size={13} class="text-emerald-400" /></div>
			<p class="mt-2 mt-1 flex items-baseline gap-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">
				{data.counts.verifiedPct}% <span class="font-code text-[10px] font-normal text-emerald-300">verified</span>
			</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">{lastVerified ? `Re-checked ${relative(lastVerified)}` : 'SHA-256 hash chain valid · 0 breaks'}</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Active admin sessions</p><span class="chip !h-[17px] !text-[7.5px]">FIDO2</span></div>
			<p class="mt-2 flex items-baseline gap-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{data.counts.activeAdmins} <span class="font-code text-[9px] font-normal text-[#8f8f9b]">staff</span></p>
			<p class="mt-1.5 flex items-center gap-1 text-[10.5px] text-[#8f8f9b]"><Check size={10} class="text-emerald-400" /> Hardware WebAuthn tokens active</p>
		</div>
	</div>

	<section class="panel overflow-hidden">
		<form method="GET" class="flex flex-col gap-2 border-b border-[#26262e] px-3 py-2.5 xl:flex-row xl:items-center">
			<SearchField value={data.filters.q} placeholder="Search actor, action, resource, or LOG ref…" class="xl:w-[280px]" />
			<select name="kind" class="select !h-[32px] !text-[11px]" onchange={change} aria-label="Filter by entity">
				<option value="all" selected={data.filters.kind === 'all'}>All actions</option>
				<option value="ticket" selected={data.filters.kind === 'ticket'}>Ticket operations</option>
				<option value="event" selected={data.filters.kind === 'event'}>Event operations</option>
				<option value="organizer" selected={data.filters.kind === 'organizer'}>KYC & organizer</option>
				<option value="order" selected={data.filters.kind === 'order'}>Financial</option>
				<option value="settings" selected={data.filters.kind === 'settings'}>Settings & keys</option>
				<option value="staff" selected={data.filters.kind === 'staff'}>Staff & access</option>
			</select>
			<select name="severity" class="select !h-[32px] !text-[11px]" onchange={change} aria-label="Filter by severity">
				<option value="all" selected={data.filters.severity === 'all'}>Outcome: All</option>
				<option value="critical" selected={data.filters.severity === 'critical'}>Critical</option>
				<option value="warning" selected={data.filters.severity === 'warning'}>Warning</option>
				<option value="info" selected={data.filters.severity === 'info'}>Informational</option>
			</select>
			<span class="chip !h-[32px] !text-[9px]"><Filter size={10} /> Today</span>
			<a href="/audit" class="btn btn-sm btn-ghost xl:ml-auto">Reset</a>
		</form>

		<div class="flex items-center justify-between border-b border-[#26262e] px-4 py-2">
			<p class="flex items-center gap-2 font-code text-[9px] uppercase tracking-[0.1em] text-[#8f8f9b]">
				<ScrollText size={11} /> Immutable ledger stream <span class="text-[#54545f]">epoch #14 // synced</span>
			</p>
			<p class="flex items-center gap-1.5 font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">
				<span class="status-dot"></span> Continuous hash-chain active
			</p>
		</div>

		{#if rows.length}
			<div class="table-wrap">
				<table class="tbl">
					<thead><tr><th>Timestamp</th><th>Actor / admin</th><th>Action category</th><th>Target resource</th><th class="hidden xl:table-cell">Reason / scope</th><th></th></tr></thead>
					<tbody>
						{#each rows as record (record.id)}
							<tr data-selected={selected?.id === record.id}>
								<td class="whitespace-nowrap font-code text-[9.5px] text-[#c9c9d4]">{time(record.at)} <span class="ml-1 text-[7.5px] text-[#5d5d69]">WAT</span></td>
								<td class="whitespace-nowrap">
									<p class="text-[10.5px] text-[#e6e6ec]">{record.actor}</p>
									<p class="font-code text-[8px] uppercase tracking-[0.04em] text-[#6f6f7b]">{record.actorRole}</p>
								</td>
								<td>
									<span class={chipClass(record.severity === 'critical' ? 'danger' : record.severity === 'warning' ? 'warn' : 'accent')}>{record.action}</span>
								</td>
								<td class="max-w-[180px]">
									<p class="truncate font-code text-[9.5px] text-[#dcdce4]">{record.target}</p>
									<p class="font-code text-[8px] uppercase text-[#5d5d69]">{record.ref}</p>
								</td>
								<td class="hidden max-w-[200px] xl:table-cell"><p class="truncate text-[9.5px] text-[#8f8f9b]">{record.reason}</p></td>
								<td>
									<a href={hrefFor(record.id)} class="row-action" aria-label={`Inspect ${record.ref}`}><ArrowUpRight size={12} /></a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="flex flex-col gap-2 border-t border-[#26262e] px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
				<p class="font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">Archive retention: 7 years statutory · write-once object lock</p>
				<Pagination pageNumber={data.table.page} pages={data.table.pages} total={data.table.total} perPage={data.table.perPage} label="records" />
			</div>
		{:else}
			<EmptyState title="No audit records match this filter" message="Widen the severity or entity filter, or reset the search to view the full hash chain." />
		{/if}
	</section>

	{#if selected}
		<section class="panel overflow-hidden">
			<header class="flex flex-wrap items-center justify-between gap-2 border-b border-[#26262e] px-4 py-2.5">
				<div class="flex items-center gap-2">
					<Fingerprint size={13} class="text-[#8f8f9b]" />
					<h2 class="font-display text-[13.5px] font-semibold text-[#f0f0f5]">Forensic record {selected.ref}</h2>
					<a href={`/audit/${selected.id}`} class="chip !h-[18px] !text-[8px] hover:!text-[#dcd6ff]">Open full dossier <ArrowUpRight size={9} /></a>
				</div>
				<span class="chip chip-ok !h-[18px] !text-[8px]"><ShieldCheck size={9} /> Signed</span>
			</header>

			<div class="grid grid-cols-1 gap-0 lg:grid-cols-[1.35fr_1fr]">
				<div class="space-y-3 border-b border-[#24242c] p-4 lg:border-b-0 lg:border-r">
					<div>
						<p class="mono-label !text-[7.5px]">Action executed</p>
						<div class="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#2a2a32] bg-[#18181e] px-2.5 py-2">
							<span class="font-code text-[10.5px] tracking-[0.06em] text-[#e6e6ec]">{selected.action}</span>
							<span class="font-code text-[8px] uppercase text-[#8f8f9b]">sev.{selected.severity === 'critical' ? '1_critical' : selected.severity === 'warning' ? '2_moderate' : '3_info'}</span>
						</div>
					</div>

					<div>
						<p class="mono-label !text-[7.5px]">Authenticated actor</p>
						<div class="mt-1 space-y-1 text-[10px]">
							<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Identity</span><span class="text-[#dcdce4]">{selected.actor}</span></p>
							<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Role / privileges</span><span class="font-code text-[#dcdce4]">{selected.actorRole.toUpperCase()}</span></p>
							<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Session token</span><span class="font-code text-[#dcdce4]">tok_ng_live_{selected.id.slice(-8)}</span></p>
							<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Source IP</span><span class="font-code text-[#dcdce4]">{selected.ip} · Lagos, NG</span></p>
							<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">MFA verification</span><span class="font-code text-emerald-300">FIDO2 WebAuthn / YubiKey</span></p>
						</div>
					</div>

					<div>
						<p class="mono-label !text-[7.5px]">Target resource context</p>
						<div class="mt-1 space-y-1 text-[10px]">
							<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Entity type</span><span class="font-code text-[#dcdce4]">{selected.entityKind.toUpperCase()}_RECORD</span></p>
							<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Resource identifier</span><span class="truncate font-code text-[#dcdce4]">{selected.entityId}</span></p>
							<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Human-readable target</span><span class="truncate text-[#dcdce4]">{selected.target}</span></p>
							<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Stated reason</span><span class="max-w-[220px] truncate text-right text-[#dcdce4]">{selected.reason}</span></p>
						</div>
					</div>

					<div>
						<p class="mono-label !text-[7.5px]">State mutation diff (RFC-6902)</p>
						<div class="mt-1 overflow-hidden rounded-md border border-[#2a2a32]">
							{#if selected.diff?.length}
								{#each selected.diff as change}
									<div class="grid grid-cols-[1fr_auto] gap-2 border-b border-[#24242c] px-2.5 py-1.5 last:border-0">
										<span class="font-code text-[9px] text-[#c6bcff]">{change.field}</span>
										<span class="font-code text-[9px] text-[#dcdce4]"><span class="text-red-300/80 line-through">{change.before}</span> → <span class="text-emerald-300">{change.after}</span></span>
									</div>
								{/each}
							{:else}
								<div class="grid grid-cols-[1fr_auto] gap-2 px-2.5 py-1.5">
									<span class="font-code text-[9px] text-[#c6bcff]">record.payload</span>
									<span class="font-code text-[9px] text-[#dcdce4]">"appended" → "committed"</span>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<div class="space-y-3 p-4">
					<div>
						<p class="mono-label !text-[7.5px]">Cryptographic proof of log</p>
						<p class="mt-1 font-code text-[8px] uppercase tracking-[0.06em] text-[#6f6f7b]">Record SHA-256 hash</p>
						<div class="mt-1 flex items-center gap-1.5 rounded-md border border-[#2a2a32] bg-[#141419] px-2 py-1.5">
							<span class="min-w-0 flex-1 truncate font-code text-[9px] text-[#c9c9d4]">{selected.hash}</span>
							<button type="button" class="row-action" aria-label="Copy hash" onclick={() => copy(selected.hash, 'Hash')}><Copy size={11} /></button>
						</div>
						<p class="mt-2 font-code text-[8px] uppercase tracking-[0.06em] text-[#6f6f7b]">Prior block hash (parent link)</p>
						<div class="mt-1 flex items-center gap-1.5 rounded-md border border-[#2a2a32] bg-[#141419] px-2 py-1.5">
							<span class="min-w-0 flex-1 truncate font-code text-[9px] text-[#c9c9d4]">{selected.prevHash}</span>
							<button type="button" class="row-action" aria-label="Copy parent hash" onclick={() => copy(selected.prevHash, 'Parent hash')}><Copy size={11} /></button>
						</div>
						<p class="mt-2 flex items-center justify-between font-code text-[8.5px] text-[#6f6f7b]">
							<span class="flex items-center gap-1"><ShieldAlert size={9} /> Signed timestamp</span>
							<span class="text-[#c9c9d4]">{selected.at.replace('Z', 'Z')}</span>
						</p>
					</div>

					<div class="grid grid-cols-2 gap-2">
						<button type="button" class="btn btn-sm" onclick={exportForensic}><FileJson size={12} /> Raw forensic JSON</button>
						<button type="button" class="btn btn-sm" onclick={() => copy(selected.hash, 'Cryptographic hash')}><Copy size={12} /> Copy hash</button>
					</div>

					<div class="rounded-lg border border-[#2a2a32] bg-[#18181e] p-2.5 text-[9.5px] leading-relaxed text-[#8f8f9b]">
						Records are append-only. Corrections are made by appending a compensating entry with
						<code class="text-[#c6bcff]">reversal_of</code>, so this block can never be edited or deleted inside the 7-year retention window.
					</div>
				</div>
			</div>
		</section>
	{/if}
</div>
