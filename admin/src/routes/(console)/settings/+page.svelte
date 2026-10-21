<script lang="ts">
	import { AlertTriangle, Building, Check, Copy, Download, Globe, KeyRound, Lock, RefreshCw, ShieldAlert, ShieldCheck, Upload } from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass } from '$admin/utils/status';
	import PageHeader from '$components/PageHeader.svelte';
	import Toggle from '$components/Toggle.svelte';
	import Sheet from '$components/Sheet.svelte';

	let { data } = $props();

	let fee = $state(untrack(() => data.settings.platformFeePct));
	let dispute = $state(untrack(() => data.settings.escoowDisputePct));
	let window_ = $state(untrack(() => data.settings.disbursementWindow));
	let webhookEndpoint = $state(untrack(() => data.settings.webhookEndpoint));
	let rotation = $state(untrack(() => data.settings.hmacRotateSec));
	let antiPassback = $state(untrack(() => data.settings.antiPassbackMinutes));
	let reissue = $state(untrack(() => data.settings.reissueSafeguard));
	let hardwareOnly = $state(untrack(() => data.settings.hardwareKeyOnly));
	let lockdown = $state(untrack(() => data.settings.lockdownArmed));

	let tab = $state<'financial' | 'gate' | 'integrations'>('financial');
	let busy = $state(false);
	let lockdownOpen = $state(false);
	let revealKey = $state(false);

	const integrations = $derived(data.settings.integrations);

	async function save() {
		busy = true;
		const response = await fetch('/api/settings', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				platformFeePct: fee,
				escoowDisputePct: dispute,
				disbursementWindow: window_,
				webhookEndpoint,
				hmacRotateSec: rotation,
				antiPassbackMinutes: antiPassback,
				reissueSafeguard: reissue,
				hardwareKeyOnly: hardwareOnly
			})
		});
		busy = false;
		if (!response.ok) {
			toasts.error('Save blocked', 'Only Tier 0 Super Admins can change financial rails.');
			return;
		}
		toasts.ok('Policy saved', 'Changes pushed to the edge mesh and appended to the ledger.');
		await invalidateAll();
	}

	async function toggleLockdown() {
		busy = true;
		const response = await fetch('/api/lockdown', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ armed: !lockdown })
		});
		busy = false;
		if (!response.ok) {
			toasts.error('Blocked', 'Emergency lockdown requires your Super Admin hardware key.');
			return;
		}
		lockdown = !lockdown;
		lockdownOpen = false;
		toasts.ok(lockdown ? 'Lockdown armed' : 'Lockdown cleared', lockdown ? 'All turnstiles now validate against the offline cache only.' : 'Cloud validation restored across the fleet.');
		await invalidateAll();
	}

	function downloadConfig() {
		const blob = new Blob([JSON.stringify(data.settings, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'owltside-platform-config.json';
		anchor.click();
		URL.revokeObjectURL(url);
		toasts.ok('Config exported', 'owltside-platform-config.json saved locally.');
	}
</script>

<svelte:head><title>Settings · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Platform Settings & System Health"
		subtitle="Configure financial payout policies, gate security cryptographic parameters, and monitor infrastructure integrations."
		crumbs={['sys-cfg', 'node-wat-01']}
		eyebrow="v4.18.2-prod"
	>
		{#snippet actions()}
			<button type="button" class="btn btn-sm" onclick={downloadConfig}><Download size={12} /> Download config (JSON)</button>
			<button type="button" class="btn btn-sm btn-primary" disabled={busy} onclick={save}><Check size={12} /> {busy ? 'Saving…' : 'Save changes'}</button>
		{/snippet}
	</PageHeader>

	<div class="flex flex-col gap-2 border-b border-[#26262e] pb-2 lg:flex-row lg:items-center">
		<div class="flex flex-wrap gap-1">
			{#each [{ key: 'financial', label: 'Paystack & financial rails' }, { key: 'gate', label: 'Gate cryptography & HMAC engine' }, { key: 'integrations', label: `Integration health (${integrations.length} channels)` }] as item}
				<button type="button" class="tab !text-[10.5px]" data-active={tab === item.key} onclick={() => (tab = item.key as typeof tab)}>{item.label}</button>
			{/each}
		</div>
		<span class="ml-auto flex items-center gap-1.5 font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">
			<span class={lockdown ? 'status-dot !bg-red-400' : 'status-dot'}></span> {lockdown ? 'Emergency lockdown armed' : 'All systems nominal'}
		</span>
	</div>

	{#if tab === 'financial'}
		<div class="grid grid-cols-1 gap-3 xl:grid-cols-[1.55fr_1fr]">
			<section class="panel overflow-hidden">
				<header class="flex flex-col gap-2 border-b border-[#26262e] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex items-center gap-2.5">
						<span class="flex h-8 w-8 items-center justify-center rounded-md border border-[#34343d] bg-[#1e1e25] text-[#c6bcff]"><Building size={14} /></span>
						<div>
							<h2 class="font-display text-[14px] font-semibold text-[#f0f0f5]">Paystack &amp; settlement infrastructure</h2>
							<p class="text-[10px] text-[#6f6f7b]">Direct automated disbursement pipeline for platform subaccounts.</p>
						</div>
					</div>
					<span class="chip chip-ok !h-[19px] !text-[8px]">WAT-NG-01 active</span>
				</header>
				<div class="space-y-3 p-4">
					<span class="chip !h-[22px] !text-[8.5px]"><ShieldCheck size={10} /> Strict NGN (₦) settlement active</span>

					<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
						<div class="panel-inset p-2.5">
							<p class="mono-label !text-[7px]">Platform take rate</p>
							<div class="mt-1 flex items-center gap-1">
								<input type="number" min="0" max="25" step="0.5" class="input !h-[28px] !w-[64px] !px-2 !text-[12px]" bind:value={fee} aria-label="Platform take rate" />
								<span class="font-code text-[11px] text-[#8f8f9b]">%</span>
							</div>
							<p class="mt-1 text-[9px] text-[#6f6f7b]">Default organizer split tier</p>
						</div>
						<div class="panel-inset p-2.5">
							<p class="mono-label !text-[7px]">Escrow dispute reserve</p>
							<div class="mt-1 flex items-center gap-1">
								<input type="number" min="0" max="30" step="0.5" class="input !h-[28px] !w-[64px] !px-2 !text-[12px]" bind:value={dispute} aria-label="Escrow dispute reserve" />
								<span class="font-code text-[11px] text-[#8f8f9b]">%</span>
							</div>
							<p class="mt-1 text-[9px] text-[#6f6f7b]">14-day hold post-event close</p>
						</div>
						<div class="panel-inset p-2.5">
							<p class="mono-label !text-[7px]">Disbursement window</p>
							<input class="input mt-1 !h-[28px] !px-2 !font-code !text-[10px]" bind:value={window_} aria-label="Disbursement window" />
							<p class="mt-1 text-[9px] text-[#6f6f7b]">Automated NIP interbank sweep</p>
						</div>
					</div>

					<div class="rounded-lg border border-[#2a2a32] p-3">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<p class="flex items-center gap-1.5 font-code text-[8px] uppercase tracking-[0.1em] text-emerald-300"><span class="status-dot"></span> Webhook ingress route (Paystack API v2)</p>
							<span class="chip chip-ok !h-[17px] !text-[7.5px]">200 OK / active</span>
						</div>
						<div class="mt-2 space-y-2">
							<div>
								<p class="mono-label !text-[7px]">Ingress endpoint</p>
								<div class="mt-1 flex items-center gap-1.5">
									<input class="input !h-[30px] !flex-1 !font-code !text-[10px]" bind:value={webhookEndpoint} aria-label="Webhook endpoint" />
									<button type="button" class="row-action" aria-label="Copy endpoint" onclick={async () => { await navigator.clipboard.writeText(webhookEndpoint); toasts.ok('Endpoint copied'); }}><Copy size={11} /></button>
								</div>
							</div>
							<div>
								<div class="flex items-center justify-between">
									<p class="mono-label !text-[7px]">HMAC-SHA512 secret signature</p>
									<button type="button" class="font-code text-[7.5px] uppercase text-[#c6bcff] hover:underline" onclick={() => (revealKey = !revealKey)}>{revealKey ? 'Hide key' : 'Reveal key'}</button>
								</div>
								<div class="mt-1 flex items-center gap-1.5">
									<code class="min-w-0 flex-1 truncate rounded-md border border-[#2a2a32] bg-[#141419] px-2 py-1.5 font-code text-[9px] text-[#c9c9d4]">
										{revealKey ? 'sk_live_51NwT7bOWLTSIDE_9d4f2a77c1be8406' : '••••••••••••••••••••••••••••••••••••••••••••••••••'}
									</code>
									<button type="button" class="btn btn-sm !h-[28px]" onclick={() => toasts.ok('Signature rotated', 'Previous secret stays valid for 24 hours.')}><RefreshCw size={10} /> Rotate</button>
								</div>
							</div>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-2 border-t border-[#26262e] pt-2.5">
						<div><p class="mono-label !text-[7px]">Last audit</p><p class="mt-0.5 text-[10px] text-[#dcdce4]">{data.settings.lastAudit}</p></div>
						<div class="text-right"><p class="mono-label !text-[7px]">Firmware</p><p class="mt-0.5 font-code text-[10px] text-[#dcdce4]">{data.settings.firmware}</p></div>
					</div>
				</div>
			</section>

			<section class="panel overflow-hidden">
				<header class="flex items-start justify-between gap-2 border-b border-[#26262e] px-4 py-3">
					<div class="flex items-center gap-2.5">
						<span class="flex h-8 w-8 items-center justify-center rounded-md border border-[#34343d] bg-[#1e1e25] text-[#c6bcff]"><KeyRound size={14} /></span>
						<div>
							<h2 class="font-display text-[14px] font-semibold text-[#f0f0f5]">Gate cryptography</h2>
							<p class="text-[10px] text-[#6f6f7b]">Offline edge validation engine.</p>
						</div>
					</div>
					<span class="chip !h-[17px] !text-[7.5px]">HMAC-256</span>
				</header>
				<div class="space-y-3 p-4">
					<div class="panel-inset p-2.5">
						<div class="flex items-center justify-between">
							<p class="mono-label !text-[7px]">Dynamic QR rotation window</p>
							<span class="chip chip-ok !h-[16px] !text-[7px]">30 s (recommended)</span>
						</div>
						<div class="mt-1.5 flex items-center gap-2">
							<input type="range" min="10" max="120" step="5" bind:value={rotation} class="h-1 flex-1 accent-[#c6bcff]" aria-label="QR rotation window" />
							<span class="font-code text-[10px] text-[#dcdce4]">{rotation}s</span>
						</div>
						<p class="mt-1 text-[9px] text-[#6f6f7b]">HMAC-SHA256 rolling timestamp token delta. Variance allowance ±1 step.</p>
					</div>

					<div class="panel-inset flex items-center justify-between p-2.5">
						<div>
							<p class="mono-label !text-[7px]">Mesh cache TTL</p>
							<p class="mt-0.5 text-[10px] text-[#dcdce4]">Synced RSA turnstile keys 1,248 keys</p>
						</div>
						<span class="font-display text-[12px] font-semibold text-[#ececf1]">12 hours</span>
					</div>

					<div class="space-y-2">
						<div class="flex items-center justify-between gap-2">
							<div>
								<p class="text-[10.5px] text-[#d4d4dc]">Anti-passback prevention</p>
								<p class="text-[8.5px] text-[#6f6f7b]">Reject duplicate scans across synchronized turnstiles within 5 minutes</p>
							</div>
							<Toggle checked={antiPassback > 0} onchange={(value) => (antiPassback = value ? 5 : 0)} label="Anti-passback" />
						</div>
						<div class="flex items-center justify-between gap-2">
							<div>
								<p class="text-[10.5px] text-[#d4d4dc]">Reissue safeguard</p>
								<p class="text-[8.5px] text-[#6f6f7b]">Auto-void superseded tokens upon manual reissue or refund</p>
							</div>
							<Toggle checked={reissue} onchange={(value) => (reissue = value)} label="Reissue safeguard" />
						</div>
						<div class="flex items-center justify-between gap-2">
							<div>
								<p class="text-[10.5px] text-[#d4d4dc]">Hardware key only</p>
								<p class="text-[8.5px] text-[#6f6f7b]">Block software TOTP fallback for Tier 0–1 accounts</p>
							</div>
							<Toggle checked={hardwareOnly} onchange={(value) => (hardwareOnly = value)} label="Hardware key only" />
						</div>
					</div>

					<div class="flex items-center justify-between border-t border-[#26262e] pt-2.5">
						<p class="font-code text-[8px] uppercase tracking-[0.06em] text-[#6f6f7b]">turnstile_rev_id</p>
						<p class="font-code text-[9px] text-[#c9c9d4]">#0x77E12</p>
					</div>
				</div>
			</section>

			<section class="panel overflow-hidden xl:col-span-2">
				<header class="panel-head">
					<div class="flex items-center gap-2"><Globe size={12} class="text-[#8f8f9b]" /><p class="mono-label">Active integrations &amp; telemetry</p></div>
					<button type="button" class="font-code text-[8px] uppercase tracking-[0.06em] text-[#c6bcff] hover:underline" onclick={() => (tab = 'integrations')}>Open health view →</button>
				</header>
				<div class="grid grid-cols-1 gap-2.5 p-3.5 sm:grid-cols-2 xl:grid-cols-4">
					{@render integrationCards()}
				</div>
			</section>
		</div>
	{:else if tab === 'gate'}
		<div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
			<section class="panel overflow-hidden">
				<header class="panel-head"><p class="mono-label">Key hierarchy &amp; rotation policy</p><span class="chip chip-ok !h-[17px] !text-[7.5px]">HSM-backed</span></header>
				<div class="divide-y divide-[#24242c]">
					{#each [{ label: 'Root signing key', detail: 'AWS KMS · aws-kms/wat-ng-01', rotate: 'Every 90 days', state: 'Active' }, { label: 'Pass salt key', detail: 'Rolling epoch salt · 30s', rotate: 'Auto, in-engine', state: 'Active' }, { label: 'Scanner mTLS cert', detail: '1,248 device certificates', rotate: 'Every 30 days', state: 'Active' }, { label: 'Webhook secret', detail: 'Paystack HMAC-SHA512', rotate: 'Manual, dual-sig', state: 'Due in 12d' }] as key}
						<div class="flex items-center gap-3 px-4 py-2.5">
							<KeyRound size={12} class="shrink-0 text-[#6f6f7b]" />
							<div class="min-w-0 flex-1">
								<p class="text-[11px] text-[#e6e6ec]">{key.label}</p>
								<p class="font-code text-[8px] text-[#6f6f7b]">{key.detail} · {key.rotate}</p>
							</div>
							<span class="chip {key.state === 'Active' ? 'chip-ok' : 'chip-warn'} !h-[17px] !text-[7.5px]">{key.state}</span>
						</div>
					{/each}
				</div>
			</section>

			<section class="panel overflow-hidden">
				<header class="panel-head"><p class="mono-label">Turnstile firmware fleet</p><span class="chip !h-[17px] !text-[7.5px]">v4.18.2-prod</span></header>
				<div class="space-y-2 p-4">
					<p class="text-[10.5px] leading-relaxed text-[#8f8f9b]">
						Firmware is signed by the Owltside root key and rolled out canary-first. Devices that fail attestation are quarantined from the mesh and fall back to cached keys only.
					</p>
					<div class="grid grid-cols-3 gap-2">
						<div class="panel-inset p-2.5"><p class="mono-label !text-[7px]">Nodes</p><p class="mt-1 font-display text-[15px] font-semibold text-[#ececf1]">4</p></div>
						<div class="panel-inset p-2.5"><p class="mono-label !text-[7px]">Attested</p><p class="mt-1 font-display text-[15px] font-semibold text-emerald-300">4</p></div>
						<div class="panel-inset p-2.5"><p class="mono-label !text-[7px]">Drift</p><p class="mt-1 font-display text-[15px] font-semibold text-[#ececf1]">0</p></div>
					</div>
					<button type="button" class="btn btn-sm w-full" onclick={() => toasts.ok('Firmware check queued', 'Canary node will report in ~90 seconds.')}><Upload size={11} /> Push signed firmware bundle</button>
				</div>
			</section>
		</div>
	{:else}
		<section class="panel overflow-hidden">
			<header class="flex flex-wrap items-center justify-between gap-2 border-b border-[#26262e] px-4 py-3">
				<div class="flex items-center gap-2.5">
					<span class="flex h-8 w-8 items-center justify-center rounded-md border border-[#34343d] bg-[#1e1e25] text-[#c6bcff]"><Globe size={14} /></span>
					<div>
						<h2 class="font-display text-[14px] font-semibold text-[#f0f0f5]">Active integrations &amp; telemetry status</h2>
						<p class="text-[10px] text-[#6f6f7b]">Real-time gateway connectivity and latency monitors across Lagos &amp; Cape Town edges.</p>
					</div>
				</div>
				<span class="flex items-center gap-1.5 font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]"><RefreshCw size={9} /> Heartbeat every 19s</span>
			</header>
			<div class="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2 xl:grid-cols-4">
				{@render integrationCards()}
			</div>
			<div class="flex flex-wrap items-center justify-between gap-2 border-t border-[#26262e] px-4 py-2.5 font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">
				<span>Pool status: 24 / 100 active connections</span>
				<span>Queue depth: 0 msgs pending</span>
				<span class="text-emerald-300">Zero unresolved vulnerabilities</span>
			</div>
		</section>
	{/if}

	<section class="panel overflow-hidden border-red-500/25 bg-red-500/[0.035]">
		<div class="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
			<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-300"><AlertTriangle size={18} /></span>
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-2">
					<h2 class="font-display text-[14px] font-semibold text-red-50">Emergency gate lockdown protocol</h2>
					<span class="chip chip-danger !h-[17px] !text-[7.5px]">High privileged</span>
					{#if lockdown}<span class="chip !h-[17px] !border-red-400/40 !bg-red-500/20 !text-[7.5px] !text-red-100">Armed</span>{/if}
				</div>
				<p class="mt-1 max-w-3xl text-[10.5px] leading-relaxed text-[#c9b6b6]">
					Instantly force all synchronized venue turnstiles to verify against local offline cache only and reject cloud API tokens. Used strictly during critical venue connectivity outages or active security incidents.
				</p>
				<p class="mt-1.5 flex flex-wrap items-center gap-2 font-code text-[8px] uppercase tracking-[0.06em] text-[#8f7a7a]">
					<span>Last audit: {data.settings.lastAudit}</span>
					<span>•</span>
					<span>CyberGuard SOC-2 Type II certified</span>
					<span>•</span>
					<span class="text-emerald-300">Zero unresolved vulnerabilities</span>
				</p>
			</div>
			<button type="button" class="btn btn-sm shrink-0" onclick={() => (lockdownOpen = true)}>
				<Lock size={12} /> Configure lockdown parameters
			</button>
		</div>
	</section>
</div>

<Sheet open={lockdownOpen} title={lockdown ? 'Clear emergency lockdown' : 'Arm emergency lockdown'} subtitle="Dual-signature action recorded on the immutable ledger." onclose={() => (lockdownOpen = false)} width="440px">
	<div class="space-y-3">
		<div class="rounded-lg border border-red-500/25 bg-red-500/[0.06] p-3 text-[10.5px] leading-relaxed text-red-100/80">
			{#if lockdown}
				Clearing the lockdown restores cloud HMAC validation for every synchronized turnstile. Offline cache remains as fallback.
			{:else}
				Arming forces every turnstile onto the signed offline cache. Cloud-minted passes created after the last key sync will be rejected until the lockdown is cleared.
			{/if}
		</div>
		<div class="space-y-1.5 text-[10px]">
			<p class="flex justify-between"><span class="text-[#6f6f7b]">Turnstiles affected</span><span class="font-code text-[#dcdce4]">1,248</span></p>
			<p class="flex justify-between"><span class="text-[#6f6f7b]">Cached key epoch</span><span class="font-code text-[#dcdce4]">14</span></p>
			<p class="flex justify-between"><span class="text-[#6f6f7b]">Propagation target</span><span class="font-code text-[#dcdce4]">≤ 20 seconds</span></p>
		</div>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (lockdownOpen = false)}>Cancel</button>
			<button type="button" class="btn btn-sm {lockdown ? 'btn-primary' : 'btn-danger'}" disabled={busy} onclick={toggleLockdown}>
				<ShieldAlert size={12} /> {lockdown ? 'Clear lockdown' : 'Arm lockdown now'}
			</button>
		</div>
	</div>
</Sheet>

{#snippet integrationCards()}
	{#each integrations as integration}
		<div class="panel-inset flex flex-col p-3">
			<div class="flex items-center justify-between">
				<p class="font-code text-[8px] uppercase tracking-[0.1em] text-[#6f6f7b]">{integration.key}</p>
				<span class={chipClass(integration.tone)}>{integration.metric}</span>
			</div>
			<p class="mt-2 font-display text-[12.5px] font-semibold text-[#ececf1]">{integration.name}</p>
			<p class="mt-1 flex-1 text-[9.5px] leading-relaxed text-[#8f8f9b]">{integration.detail}</p>
			<div class="mt-2 flex items-center gap-1.5 border-t border-[#26262e] pt-2 font-code text-[8px] uppercase tracking-[0.05em] text-[#6f6f7b]">
				<span class={integration.tone === 'ok' ? 'status-dot' : 'status-dot !bg-amber-400'}></span> {integration.state}
			</div>
		</div>
	{/each}
{/snippet}
