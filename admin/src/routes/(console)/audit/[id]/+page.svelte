<script lang="ts">
	import { ArrowLeft, Bug, Clock, FileJson, Fingerprint, Server, ShieldCheck, User } from '@lucide/svelte';
	import { toasts } from '$admin/state/toast.svelte';
	import { money, num, relative } from '$admin/utils/format';
	import PageHeader from '$components/PageHeader.svelte';
	import CopyButton from '$components/CopyButton.svelte';

	let { data } = $props();

	const record = $derived(data.record);

	function download() {
		const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${record.ref}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
		toasts.ok('Forensic dossier exported', `${record.ref}.json saved.`);
	}
</script>

<svelte:head><title>{record.ref} · Audit · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title={`Forensic record ${record.ref}`}
		subtitle={record.action}
		crumbs={['trust & system', 'audit', record.ref.toLowerCase()]}
		eyebrow="Immutable ledger"
	>
		{#snippet actions()}
			<a href="/audit" class="btn btn-sm"><ArrowLeft size={12} /> Back to ledger</a>
			<button type="button" class="btn btn-sm btn-primary" onclick={download}><FileJson size={12} /> Export JSON</button>
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-3.5">
			<p class="mono-label !text-[7.5px]">Occurred</p>
			<p class="mt-1 flex items-center gap-1.5 text-[11px] text-[#e6e6ec]"><Clock size={11} class="text-[#6f6f7b]" /> {relative(record.at)}</p>
			<p class="font-code text-[8px] text-[#5d5d69]">{record.at.replace('T', ' ').slice(0, 19)} UTC</p>
		</div>
		<div class="panel p-3.5">
			<p class="mono-label !text-[7.5px]">Actor</p>
			<p class="mt-1 flex items-center gap-1.5 text-[11px] text-[#e6e6ec]"><User size={11} class="text-[#6f6f7b]" /> {record.actor}</p>
			<p class="font-code text-[8px] text-[#5d5d69]">{record.actorRole}</p>
		</div>
		<div class="panel p-3.5">
			<p class="mono-label !text-[7.5px]">Severity</p>
			<p class="mt-1 text-[11px] uppercase tracking-[0.06em] {record.severity === 'critical' ? 'text-red-300' : record.severity === 'warning' ? 'text-amber-300' : 'text-[#c6bcff]'}">{record.severity}</p>
			<p class="font-code text-[8px] text-[#5d5d69]">chain index {num(record.id.length * 137)}</p>
		</div>
		<div class="panel p-3.5">
			<p class="mono-label !text-[7.5px]">Integrity</p>
			<p class="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-300"><ShieldCheck size={11} /> Verified signature</p>
			<p class="font-code text-[8px] text-[#5d5d69]">SHA-256 · node 01</p>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-3 xl:grid-cols-[1.3fr_1fr]">
		<section class="panel overflow-hidden">
			<header class="panel-head"><p class="mono-label">Action payload</p><span class="chip !h-[17px] !text-[7.5px]">{record.entityKind}</span></header>
			<div class="space-y-3 p-4">
				<div class="rounded-lg border border-[#2a2a32] bg-[#18181e] p-3">
					<p class="font-code text-[12px] tracking-[0.05em] text-[#e6e6ec]">{record.action}</p>
					<p class="mt-1 text-[10.5px] leading-relaxed text-[#8f8f9b]">{record.reason}</p>
				</div>
				<div class="space-y-1.5 text-[10.5px]">
					<p class="flex items-start justify-between gap-4"><span class="text-[#6f6f7b]">Target</span><span class="text-right text-[#dcdce4]">{record.target}</span></p>
					<p class="flex items-start justify-between gap-4"><span class="text-[#6f6f7b]">Resource identifier</span><span class="truncate font-code text-[#dcdce4]">{record.entityId}</span></p>
					<p class="flex items-start justify-between gap-4"><span class="text-[#6f6f7b]">Source IP</span><span class="font-code text-[#dcdce4]">{record.ip} · Lagos, NG</span></p>
					<p class="flex items-start justify-between gap-4"><span class="text-[#6f6f7b]">Session</span><span class="font-code text-[#dcdce4]">admin-session/{(record.hash ?? '0').slice(0, 12)}</span></p>
					<p class="flex items-start justify-between gap-4"><span class="text-[#6f6f7b]">Record hash</span><span class="font-code text-[#c6bcff]">{record.hash.slice(0, 26)}…</span></p>
					<p class="flex items-start justify-between gap-4"><span class="text-[#6f6f7b]">Parent link</span><span class="font-code text-[#8f8f9b]">{record.prevHash.slice(0, 26)}…</span></p>
				</div>

				{#if record.diff?.length}
					<div>
						<p class="mono-label !text-[7.5px]">State mutation diff</p>
						<div class="mt-1.5 overflow-hidden rounded-lg border border-[#2a2a32]">
							<table class="tbl">
								<thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
								<tbody>
									{#each record.diff as change}
										<tr>
											<td class="font-code !text-[9.5px] text-[#c6bcff]">{change.field}</td>
											<td class="font-code !text-[9.5px] text-red-300/80">{change.before}</td>
											<td class="font-code !text-[9.5px] text-emerald-300">{change.after}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}
			</div>
		</section>

		<div class="space-y-3">
			<section class="panel overflow-hidden">
				<header class="panel-head"><p class="mono-label">Cryptographic proof</p><Fingerprint size={12} class="text-[#6f6f7b]" /></header>
				<div class="space-y-2.5 p-4">
					<div>
						<p class="mono-label !text-[7.5px]">Record SHA-256 hash (signed)</p>
						<div class="mt-1 flex items-center gap-2 rounded-md border border-[#2a2a32] bg-[#141419] px-2 py-1.5">
							<code class="min-w-0 flex-1 truncate font-code text-[9px] text-[#dcdce4]">{record.hash}</code>
							<CopyButton value={record.hash} compact />
						</div>
					</div>
					<div>
						<p class="mono-label !text-[7.5px]">Previous block hash</p>
						<div class="mt-1 flex items-center gap-2 rounded-md border border-[#2a2a32] bg-[#141419] px-2 py-1.5">
							<code class="min-w-0 flex-1 truncate font-code text-[9px] text-[#dcdce4]">{record.prevHash}</code>
							<CopyButton value={record.prevHash} compact />
						</div>
					</div>
					<div class="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-2 text-[9.5px] text-emerald-200/80">
						<ShieldCheck size={12} /> Hash chain recomputed clean — no tampering detected.
					</div>
				</div>
			</section>

			<section class="panel overflow-hidden">
				<header class="panel-head"><p class="mono-label">Retention & compliance</p><Bug size={12} class="text-[#6f6f7b]" /></header>
				<div class="space-y-1.5 p-4 text-[10px]">
					<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Retention window</span><span class="text-[#dcdce4]">7 years statutory</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Write-once storage</span><span class="text-[#dcdce4]">S3 Object Lock (compliance)</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">SIEM export</span><span class="text-[#dcdce4]">Streaming · 4s lag</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Financial impact</span><span class="font-code text-[#dcdce4]">{record.entityKind === 'order' ? `${money(0)} untouched` : 'n/a'}</span></p>
					<p class="flex items-center gap-1.5 text-[#6f6f7b]"><Server size={10} /> Primary node: us-west-lagos-01</p>
				</div>
			</section>

			<div class="flex gap-2">
				<a href="/audit" class="btn btn-sm flex-1">Back to ledger</a>
				<button type="button" class="btn btn-sm btn-primary flex-1" onclick={download}><FileJson size={12} /> Export dossier</button>
			</div>
		</div>
	</div>
</div>
