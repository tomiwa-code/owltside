<script lang="ts">
	import {
		Download,
		Fingerprint,
		KeyRound,
		Lock,
		Plus,
		ShieldCheck,
		ShieldAlert,
		UserPlus,
		Users
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass, staffStatus } from '$admin/utils/status';
	import { num, relative } from '$admin/utils/format';
	import type { AdminRole, AdminStaff, AdminTier } from '$admin/types';
	import PageHeader from '$components/PageHeader.svelte';
	import Avatar from '$components/Avatar.svelte';
	import StatusChip from '$components/StatusChip.svelte';
	import Sheet from '$components/Sheet.svelte';
	import Toggle from '$components/Toggle.svelte';

	let { data } = $props();

	let tab = $state<'directory' | 'matrix' | 'hardware'>('directory');
	let selectedId = $state('adm-01');
	let inviteOpen = $state(false);
	let busy = $state(false);

	let name = $state('');
	let email = $state('');
	let role = $state<AdminRole>('Support Agent');
	let tier = $state<AdminTier>(2);

	let dualAuth = $state(true);
	let subnetLock = $state(true);
	let hardwareOnly = $state(true);

	const selected = $derived(data.staff.find((member) => member.id === selectedId) ?? data.staff[0]);
	const roles = $derived([...new Set(data.staff.map((member) => member.role))]);
	const matrix = $derived(
		roles.map((roleName) => ({
			role: roleName,
			members: data.staff.filter((member) => member.role === roleName).length,
			tier: Math.min(...data.staff.filter((member) => member.role === roleName).map((member) => member.tier)),
			grants: {
				read: true,
				approveEvents: roleName !== 'Support Agent' && roleName !== 'Read-only Auditor',
				refunds: roleName === 'Finance & Treasury' || roleName === 'Super Admin',
				kyc: roleName === 'Trust & Safety Lead' || roleName === 'Super Admin',
				lockdown: roleName === 'Super Admin',
				config: roleName === 'Super Admin'
			}
		}))
	);

	const scopeCopy: Record<string, string> = {
		'Super Admin': 'Unrestricted control-plane access, including emergency lockdown, key rotation, and treasury disbursements above ₦5,000,000.',
		'Trust & Safety Lead': 'KYC adjudication, moderation triage, sales freezes, and pass revocation on flagged events.',
		'Finance & Treasury': 'Paystack escrow settlement authority, refund approval, and financial ledger forensic reconciliation.',
		'Gate Operations': 'Turnstile fleet management, gate overrides, manual check-in, and scanner credential rotation.',
		'Support Agent': 'Read-only attendee records with case notes; can resend passes but cannot move money.',
		'Read-only Auditor': 'Immutable access to the ledger and audit trails. No mutations permitted at any tier.'
	};

	function changeStatus(member: AdminStaff, status: AdminStaff['status']) {
		return fetch(`/api/staff/${member.id}/status`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status, reason: 'Quarterly access review' })
		});
	}

	async function suspend(member: AdminStaff) {
		busy = true;
		const response = await changeStatus(member, 'suspended');
		busy = false;
		if (!response.ok) {
			toasts.error('Session revocation failed', 'Your primary Super Admin identity is protected.');
			return;
		}
		toasts.ok('Session revoked', `${member.name} signed out of all nodes immediately.`);
		await invalidateAll();
	}

	async function restore(member: AdminStaff) {
		busy = true;
		const response = await changeStatus(member, 'active');
		busy = false;
		if (!response.ok) {
			toasts.error('Could not restore access', 'Try again or lodge a security review.');
			return;
		}
		toasts.ok('Access restored', `${member.name} can re-authenticate with a hardware key.`);
		await invalidateAll();
	}

	async function invite(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		const response = await fetch('/api/staff/invite', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name, email, role, tier })
		});
		busy = false;
		if (!response.ok) {
			toasts.error('Invite failed', 'Only Super Admins can issue enrolment links.');
			return;
		}
		toasts.ok('Enrolment link issued', `${email} must bind a FIDO2 key within 24 hours.`);
		inviteOpen = false;
		name = '';
		email = '';
		await invalidateAll();
	}
</script>

<svelte:head><title>Administrators · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Administrators & Access Control"
		subtitle="Manage staff permissions, enforce hardware security policies, and audit granular role capabilities across multi-node infrastructure."
		crumbs={['governance', 'zero-trust access']}
		eyebrow="Enclave level 3"
	>
		{#snippet actions()}
			<a class="btn btn-sm" href="/api/export/staff" download><Download size={12} /> Export Manifest (CSV)</a>
			<button type="button" class="btn btn-sm btn-primary" onclick={() => (inviteOpen = true)}><UserPlus size={13} /> Invite Administrator</button>
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Active administrators</p><Users size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 flex items-baseline gap-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{data.counts.active} <span class="font-code text-[9px] font-normal text-[#8f8f9b]">staff</span></p>
			<p class="mt-1.5 flex items-center gap-1 text-[10.5px] text-[#8f8f9b]"><span class="status-dot"></span> Hardware 2FA on {data.counts.hardware} of {data.counts.total} seats</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Custom system roles</p><Lock size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 flex items-baseline gap-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{roles.length} <span class="font-code text-[9px] font-normal text-[#8f8f9b]">roles</span></p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Tier 0 · Gate · Finance · Trust · Support</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Elevated actions (24h)</p><ShieldAlert size={13} class="text-amber-300" /></div>
			<p class="mt-2 flex items-baseline gap-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{data.counts.elevated} <span class="font-code text-[9px] font-normal text-[#8f8f9b]">ops</span></p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">₦14.2M disbursed · 3 deletions</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Security posture</p><Fingerprint size={13} class="text-emerald-400" /></div>
			<p class="mt-2 font-display text-[clamp(16px,2.2vw,22px)] font-semibold leading-none text-[#f1f1f6]">FIDO2 Strict</p>
			<p class="mt-1.5 flex items-center gap-1 text-[10.5px] text-[#8f8f9b]"><ShieldCheck size={10} class="text-emerald-400" /> Zero SMS fallback permitted</p>
		</div>
	</div>

	<div class="flex flex-col gap-2 xl:flex-row xl:items-center">
		<div class="panel flex w-full flex-wrap gap-1 p-1 xl:w-auto">
			{#each [{ key: 'directory', label: `Staff Directory (${data.counts.total})` }, { key: 'matrix', label: 'Granular Permission Matrix' }, { key: 'hardware', label: 'Hardware Keys & WebAuthn' }] as item}
				<button type="button" class="tab !text-[10.5px]" data-active={tab === item.key} onclick={() => (tab = item.key as typeof tab)}>{item.label}</button>
			{/each}
		</div>
		<div class="flex flex-wrap items-center gap-2 xl:ml-auto">
			<select class="select !h-[32px] !min-w-[190px] !text-[10.5px]" aria-label="Filter access tier">
				<option>Filter: All tiers (0–3)</option>
				<option>Tier 0 — Super Admin</option>
				<option>Tier 1 — Configure</option>
				<option>Tier 2 — Mutation</option>
				<option>Tier 3 — Read only</option>
			</select>
			<span class="chip !h-[32px] !text-[9.5px]">Revoked sessions <span class="font-code text-[9px] text-[#8f8f9b]">{data.counts.suspended}</span></span>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-3 xl:grid-cols-[1.9fr_1fr]">
		<div class="space-y-3">
			{#if tab === 'directory'}
				<section class="panel overflow-hidden">
					<header class="panel-head">
						<div class="flex items-center gap-2"><p class="mono-label">Sec registry // active keys</p><span class="chip chip-ok !h-[16px] !text-[7.5px]">{data.counts.sessions} sessions live</span></div>
						<span class="font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">Geo-fence: strict (Lagos/ABJ)</span>
					</header>
					<div class="table-wrap">
						<table class="tbl">
							<thead><tr><th>Administrator</th><th>Access tier / role</th><th>Security enclave</th><th>Last telemetry</th><th></th></tr></thead>
							<tbody>
								{#each data.staff as member (member.id)}
									{@const status = staffStatus(member.status)}
									<tr data-selected={selected.id === member.id} onclick={() => (selectedId = member.id)}>
										<td class="min-w-[170px]">
											<div class="flex items-center gap-2.5">
												<Avatar name={member.name} size="sm" accent={member.status === 'active'} />
												<div class="min-w-0">
													<p class="flex items-center gap-1 truncate text-[11px] font-medium text-[#e8e8ee]">
														{member.name}
														{#if member.tier === 0}<ShieldCheck size={10} class="text-[#c6bcff]" />{/if}
													</p>
													<p class="truncate font-code text-[8px] text-[#6f6f7b]">{member.email}</p>
												</div>
											</div>
										</td>
										<td>
											<p class="text-[10px] text-[#d4d4dc]">{member.role}</p>
											<p class="font-code text-[8px] uppercase text-[#6f6f7b]">Tier {member.tier} · {status.label}</p>
										</td>
										<td>
											<p class="flex items-center gap-1 text-[9.5px] text-[#c9c9d4]"><KeyRound size={9} class="text-[#6f6f7b]" /> {member.auth}</p>
											<p class="mt-0.5 max-w-[150px] truncate text-[8px] text-[#6f6f7b]">{member.location}</p>
										</td>
										<td class="whitespace-nowrap">
											<p class="text-[9.5px] text-[#c9c9d4]">{member.sessions > 0 ? relative(member.lastActive) : 'No active node'}</p>
											<p class="font-code text-[8px] text-[#6f6f7b]">{member.sessions} session{member.sessions === 1 ? '' : 's'}</p>
										</td>
										<td>
											<div class="flex justify-end gap-1">
												{#if member.status === 'active'}
													<button type="button" class="chip chip-danger !h-[18px] !text-[7.5px]" disabled={busy || member.id === 'adm-01'} onclick={(event) => { event.stopPropagation(); suspend(member); }}>Revoke</button>
												{:else}
													<button type="button" class="chip chip-ok !h-[18px] !text-[7.5px]" disabled={busy} onclick={(event) => { event.stopPropagation(); restore(member); }}>Restore</button>
												{/if}
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<div class="flex flex-wrap items-center justify-between gap-2 border-t border-[#26262e] px-4 py-2 font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">
						<span>{data.counts.total} of {data.counts.total} seats allocated · HSM cluster #WAT-NG-01</span>
						<span>Page 1/1</span>
					</div>
				</section>

				<section class="panel flex items-start gap-3 p-3.5">
					<span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-400/25 bg-amber-400/10 text-amber-200"><Lock size={14} /></span>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<p class="font-display text-[12px] font-semibold text-[#ececf1]">Zero-trust step-up authentication required</p>
							<span class="chip !h-[17px] !text-[7.5px]">Audit WebAuthn policy</span>
						</div>
						<p class="mt-0.5 text-[10.5px] leading-relaxed text-[#8f8f9b]">All financial reversals and gate scanner encryption key rotations mandate physical hardware touch verification via WebAuthn.</p>
					</div>
				</section>

				<section class="panel overflow-hidden">
					<header class="panel-head"><p class="mono-label">Real-time access control telemetry</p><span class="font-code text-[8px] uppercase text-emerald-300">Stream: live</span></header>
					<div class="divide-y divide-[#24242c]">
						{#each data.telemetry as entry}
							<div class="flex flex-wrap items-start gap-2 px-3.5 py-2">
								<span class="font-code text-[8.5px] text-[#6f6f7b]">[{entry.at.slice(11, 19)}]</span>
								<p class="min-w-0 flex-1 text-[10px] leading-snug text-[#c9c9d4]"><span class="font-code text-[9.5px] text-[#e6e6ec]">{entry.actor}</span> {entry.message}</p>
								<span class={chipClass(entry.tone === 'danger' ? 'danger' : entry.tone === 'warn' ? 'warn' : 'ok')}>{entry.tag}</span>
							</div>
						{/each}
					</div>
				</section>
			{:else if tab === 'matrix'}
				<section class="panel overflow-hidden">
					<header class="panel-head"><p class="mono-label">Granular permission matrix</p><span class="font-code text-[8px] uppercase text-[#6f6f7b]">ABAC + tier gating</span></header>
					<div class="table-wrap">
						<table class="tbl">
							<thead><tr><th>Role</th><th>Tier</th><th>Read</th><th>Approve events</th><th>Refunds</th><th>KYB</th><th>Lockdown</th><th>Config</th></tr></thead>
							<tbody>
								{#each matrix as row}
									<tr>
										<td class="primary-cell text-[10.5px]">{row.role}<span class="ml-1.5 font-code text-[8px] text-[#6f6f7b]">({row.members})</span></td>
										<td class="font-code text-[9.5px]">T{row.tier}</td>
										{#each Object.values(row.grants) as grant}
											<td>
												{#if grant}
													<span class="chip chip-ok !h-[16px] !text-[7.5px]">allow</span>
												{:else}
													<span class="chip !h-[16px] !text-[7.5px] text-[#6f6f7b]">deny</span>
												{/if}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="border-t border-[#26262e] px-4 py-2 text-[9.5px] text-[#6f6f7b]">Permissions resolve server-side in <code class="text-[#c6bcff]">$admin/server/auth.ts</code>; the UI only reflects the resulting capability set.</p>
				</section>
			{:else}
				<section class="panel overflow-hidden">
					<header class="panel-head"><p class="mono-label">Hardware key enrollment</p><span class="chip chip-ok !h-[16px] !text-[7.5px]">FIDO2 / YubiKey</span></header>
					<div class="divide-y divide-[#24242c]">
						{#each data.staff as member}
							<div class="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
								<Avatar name={member.name} size="sm" />
								<div class="min-w-0 flex-1">
									<p class="text-[11px] text-[#e6e6ec]">{member.name}</p>
									<p class="font-code text-[8px] text-[#6f6f7b]">{member.email}</p>
								</div>
								<span class="chip !h-[18px] !text-[8px]">{member.auth}</span>
								<span class={chipClass(member.status === 'active' ? 'ok' : member.status === 'invited' ? 'warn' : 'danger')}>{member.status}</span>
								<span class="font-code text-[8.5px] text-[#6f6f7b]">{member.sessions} live</span>
							</div>
						{/each}
					</div>
					<div class="border-t border-[#26262e] px-4 py-2.5 text-[9.5px] leading-relaxed text-[#6f6f7b]">
						Enrollment requires physical presence at a trusted node. Attestation certificates are archived for 7 years and cross-checked against the FIDO Metadata Service (MDS3).
					</div>
				</section>
			{/if}
		</div>

		<aside class="space-y-3">
			<section class="panel overflow-hidden">
				<header class="flex items-start justify-between gap-2 border-b border-[#26262e] px-3.5 py-2.5">
					<div>
						<p class="mono-label flex items-center gap-1"><span class="status-dot"></span> Role inspector</p>
						<h2 class="mt-1 font-display text-[16px] font-semibold leading-tight text-[#f0f0f5]">{selected?.role}</h2>
					</div>
					<span class="chip !h-[18px] !text-[7.5px]">Tier {selected?.tier} scope</span>
				</header>
				<div class="p-3.5">
					<p class="text-[10.5px] leading-relaxed text-[#8f8f9b]">{scopeCopy[selected?.role ?? 'Support Agent']}</p>
					<div class="mt-3 grid grid-cols-2 gap-2">
						<div class="panel-inset p-2.5">
							<p class="mono-label !text-[7px]">Assigned members</p>
							<p class="mt-1 font-display text-[14px] font-semibold text-[#ececf1]">{data.staff.filter((member) => member.role === selected?.role).length} staff</p>
						</div>
						<div class="panel-inset p-2.5">
							<p class="mono-label !text-[7px]">Daily cap</p>
							<p class="mt-1 font-display text-[14px] font-semibold text-[#ececf1]">{selected?.tier === 0 ? 'Unlimited' : '₦5,000,000'}</p>
						</div>
					</div>
					<div class="mt-2.5 flex items-start gap-2 rounded-md border border-[#2a2a32] bg-[#18181e] px-2.5 py-2">
						<ShieldCheck size={12} class="mt-0.5 shrink-0 text-[#c6bcff]" />
						<p class="text-[9.5px] leading-snug text-[#8f8f9b]">
							<strong class="text-[#dcdce4]">Elevated settlement authority.</strong> Holders can trigger Paystack transfers up to ₦5,000,000/day. Above that, Tier 0 co-signature is required.
						</p>
					</div>

					<p class="mono-label mt-3 !text-[8px]">Security enforcement</p>
					<div class="mt-1.5 space-y-2">
						<div class="flex items-center justify-between gap-2">
							<div>
								<p class="text-[10px] text-[#d4d4dc]">Require dual-authorization</p>
								<p class="text-[8.5px] text-[#6f6f7b]">Multi-sig approval on payouts &gt; ₦1,000,000</p>
							</div>
							<Toggle checked={dualAuth} onchange={(value) => (dualAuth = value)} label="Dual authorization" />
						</div>
						<div class="flex items-center justify-between gap-2">
							<div>
								<p class="text-[10px] text-[#d4d4dc]">Strict Lagos subnet lock</p>
								<p class="text-[8.5px] text-[#6f6f7b]">Restrict login issuance to corporate static IPs</p>
							</div>
							<Toggle checked={subnetLock} onchange={(value) => (subnetLock = value)} label="Subnet lock" />
						</div>
						<div class="flex items-center justify-between gap-2">
							<div>
								<p class="text-[10px] text-[#d4d4dc]">Mandate hardware key only</p>
								<p class="text-[8.5px] text-[#6f6f7b]">Prohibit software TOTP apps for this role</p>
							</div>
							<Toggle checked={hardwareOnly} onchange={(value) => (hardwareOnly = value)} label="Hardware key" />
						</div>
					</div>

					<button
						type="button"
						class="btn btn-primary mt-3 w-full"
						onclick={() => toasts.ok('Role policy saved', 'Enforcement pushed to all edge nodes in 320ms.')}
					>Save role policy changes</button>
					<button type="button" class="btn btn-sm mt-1.5 w-full" onclick={() => toasts.info('Permission diff', '3 capability deltas staged for the next auditor sync.')}>Audit permission diff history</button>
				</div>
			</section>

			<section class="panel p-3.5">
				<p class="mono-label flex items-center gap-1"><Plus size={10} /> Pending enrolment</p>
				{#if data.counts.invited}
					{#each data.staff.filter((member) => member.status === 'invited') as member}
						<div class="mt-2 flex items-center gap-2">
							<Avatar name={member.name} size="xs" />
							<div class="min-w-0 flex-1">
								<p class="truncate text-[10px] text-[#dcdce4]">{member.name}</p>
								<p class="truncate font-code text-[8px] text-[#6f6f7b]">{member.email}</p>
							</div>
							<span class="chip chip-warn !h-[16px] !text-[7.5px]">Invited</span>
						</div>
					{/each}
				{:else}
					<p class="mt-1 text-[10px] text-[#6f6f7b]">No outstanding invitations.</p>
				{/if}
			</section>
		</aside>
	</div>
</div>

<Sheet open={inviteOpen} title="Invite administrator" subtitle="A hardware key must be bound within 24 hours." onclose={() => (inviteOpen = false)} width="440px">
	<form class="space-y-3" onsubmit={invite}>
		<div>
			<label class="field-label" for="staff-name">Full legal name</label>
			<input id="staff-name" class="input" bind:value={name} required placeholder="e.g. Adaeze Okonkwo" />
		</div>
		<div>
			<label class="field-label" for="staff-email">Work email</label>
			<input id="staff-email" type="email" class="input" bind:value={email} required placeholder="name@owltside.com" />
		</div>
		<div class="grid grid-cols-2 gap-2">
			<div>
				<label class="field-label" for="staff-role">System role</label>
				<select id="staff-role" class="select" bind:value={role}>
					{#each ['Super Admin', 'Trust & Safety Lead', 'Finance & Treasury', 'Gate Operations', 'Support Agent', 'Read-only Auditor'] as option}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class="field-label" for="staff-tier">Access tier</label>
				<select id="staff-tier" class="select" bind:value={tier}>
					<option value={0}>Tier 0 — Super Admin</option>
					<option value={1}>Tier 1 — Configure</option>
					<option value={2}>Tier 2 — Mutation</option>
					<option value={3}>Tier 3 — Read only</option>
				</select>
			</div>
		</div>
		<div class="rounded-lg border border-[#2a2a32] bg-[#18181e] p-2.5 text-[9.5px] leading-relaxed text-[#8f8f9b]">
			Invites are signed with your Super Admin key and expire after 24 hours. Until a FIDO2 credential is enrolled, the account cannot read any tenant data.
		</div>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (inviteOpen = false)}>Cancel</button>
			<button type="submit" class="btn btn-sm btn-primary" disabled={busy}><UserPlus size={12} /> Issue enrolment link</button>
		</div>
	</form>
</Sheet>
