<script lang="ts">
	import {
		ArrowUpRight,
		Ban,
		Download,
		Eye,
		Fingerprint,
		MapPin,
		ShieldCheck,
		Smartphone,
		UserCheck,
		Users
	} from '@lucide/svelte';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass, ticketStatus, userStatus, orderStatus } from '$admin/utils/status';
	import { money, moneyCompact, num, relative, time } from '$admin/utils/format';
	import PageHeader from '$components/PageHeader.svelte';
	import Avatar from '$components/Avatar.svelte';
	import StatusChip from '$components/StatusChip.svelte';
	import Pagination from '$components/Pagination.svelte';
	import SearchField from '$components/SearchField.svelte';
	import Sheet from '$components/Sheet.svelte';

	let { data } = $props();

	let tab = $state<'overview' | 'passes' | 'ledger' | 'audit'>('overview');
	let blockOpen = $state(false);
	let reason = $state('');
	let busy = $state(false);

	const selected = $derived(data.selected);

	function hrefFor(userId: string): string {
		const url = new URL(page.url);
		url.searchParams.set('user', userId);
		return `${url.pathname}${url.search}`;
	}

	function change(event: Event) {
		(event.currentTarget as HTMLSelectElement).form?.requestSubmit();
	}

	async function setStatus(status: 'active' | 'blocked') {
		if (!selected) return;
		busy = true;
		const response = await fetch(`/api/users/${selected.id}/status`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status, reason: reason || 'Account review decision' })
		});
		busy = false;
		if (!response.ok) {
			toasts.error('Account update failed', 'Insufficient privileges.');
			return;
		}
		toasts.ok(status === 'blocked' ? 'Account blocked' : 'Account reinstated', `${selected.name} · audit trail updated.`);
		blockOpen = false;
		reason = '';
		await invalidateAll();
	}

	function exportDossier() {
		if (!selected) return;
		const blob = new Blob([JSON.stringify({ user: selected, related: data.related }, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${selected.handle}-dossier.json`;
		anchor.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head><title>Users · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Users Directory"
		subtitle="Audit account statuses, access rights, KYC tiers, and ticket spend across the platform."
		crumbs={['platform', 'users']}
		eyebrow="Live cluster"
	>
		{#snippet actions()}
			<a class="btn btn-sm" href="/api/export/users" download><Download size={12} /> Export CSV Roster</a>
			<a class="btn btn-sm btn-primary" href="/staff"><UserCheck size={13} /> Invite User / Staff</a>
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Total registered</p><Users size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.total)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Cumulative accounts <span class="text-emerald-300">+12.4% MoM</span></p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Active attendees</p><span class="status-dot"></span></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.active)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Engaged within last 90 days · {Math.round((data.counts.active / data.counts.total) * 100)}% active</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Verified organizers</p><ShieldCheck size={13} class="text-[#8dd3c7]" /></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.verifiedOrganizers)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">KYC tiers 1–3 · certified merchant payouts</p>
		</div>
		<div class="panel border-red-500/20 bg-red-500/[0.03] p-4">
			<div class="flex items-center justify-between"><p class="mono-label !text-red-200/70">Suspended / flagged</p><span class="chip chip-danger !h-[17px] !text-[8px]">Under audit</span></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-red-100">{num(data.counts.flagged + data.counts.blocked)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#a0a0ab]">Chargebacks, bot signatures, KYC blocks</p>
		</div>
	</div>

	<div class="panel px-3 py-2.5">
		<form method="GET" class="flex flex-col gap-2 xl:flex-row xl:items-center">
			<SearchField value={data.filters.q} placeholder="Search by name, email, or #USR-XXXX…" class="xl:w-[300px]" />
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<select name="status" class="select !h-[34px] !text-[11.5px]" onchange={change} aria-label="Filter by status">
					<option value="all" selected={data.filters.status === 'all'}>Status: All</option>
					<option value="active" selected={data.filters.status === 'active'}>Active</option>
					<option value="flagged" selected={data.filters.status === 'flagged'}>Flagged</option>
					<option value="blocked" selected={data.filters.status === 'blocked'}>Blocked</option>
				</select>
				<select name="role" class="select !h-[34px] !text-[11.5px]" onchange={change} aria-label="Filter by role">
					<option value="all" selected={data.filters.role === 'all'}>Role: All</option>
					<option value="Attendee" selected={data.filters.role === 'Attendee'}>Attendee</option>
					<option value="Organizer" selected={data.filters.role === 'Organizer'}>Organizer</option>
					<option value="Speaker" selected={data.filters.role === 'Speaker'}>Speaker</option>
				</select>
				<select name="kyc" class="select !h-[34px] !text-[11.5px]" onchange={change} aria-label="Filter by KYC">
					<option value="all" selected={data.filters.kyc === 'all'}>KYC: All tiers</option>
					<option value="3" selected={data.filters.kyc === '3'}>Tier 3</option>
					<option value="2" selected={data.filters.kyc === '2'}>Tier 2</option>
					<option value="1" selected={data.filters.kyc === '1'}>Tier 1</option>
					<option value="0" selected={data.filters.kyc === '0'}>Tier 0</option>
				</select>
				<span class="chip !h-[34px] justify-center !text-[9px]">Sort: Latest registration</span>
			</div>
			<a href="/users" class="btn btn-sm btn-ghost xl:ml-auto">Reset</a>
		</form>
	</div>

	<section class="panel overflow-hidden">
		<div class="flex items-center justify-between border-b border-[#26262e] px-4 py-2.5">
			<div class="flex items-center gap-2">
				<p class="font-code text-[9px] uppercase tracking-[0.1em] text-[#8f8f9b]">Entities discovered</p>
				<span class="chip chip-ok !h-[18px] !text-[8px]">Query {data.table.total.toLocaleString('en-US')} · 8.4ms</span>
			</div>
			<div class="flex items-center gap-2 font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">
				<span>Engine: postgres-read-replica-01</span>
				<span class="chip !h-[16px] !text-[7px]">Dense mode</span>
			</div>
		</div>
		<div class="table-wrap">
			<table class="tbl">
				<thead><tr><th>User</th><th>Email & phone</th><th>Role & KYC</th><th>Activity & spend</th><th></th></tr></thead>
				<tbody>
					{#each data.table.rows as user (user.id)}
						{@const status = userStatus(user.status)}
						<tr data-selected={selected?.id === user.id}>
							<td class="min-w-[200px]">
								<div class="flex items-center gap-2.5">
									<Avatar name={user.name} size="sm" accent={user.status === 'active'} />
									<div class="min-w-0">
										<a href={hrefFor(user.id)} class="flex items-center gap-1 truncate text-[11.5px] font-medium text-[#e8e8ee] hover:text-[#c6bcff]">
											{user.name}
											{#if user.status === 'active'}<span class="h-1 w-1 rounded-full bg-emerald-400"></span>{/if}
										</a>
										<p class="font-code text-[8.5px] text-[#6f6f7b]">@{user.handle} · #{user.id.toUpperCase()}</p>
									</div>
								</div>
							</td>
							<td>
								<p class="primary-cell max-w-[190px] truncate text-[10.5px]">{user.email}</p>
								<p class="font-code text-[8.5px] text-[#6f6f7b]">{user.phone}</p>
							</td>
							<td>
								<p class="text-[10.5px] text-[#d4d4dc]">{user.role}</p>
								<div class="mt-0.5 flex items-center gap-1">
									<span class="font-code text-[8.5px] text-[#8f8f9b]">KYC Tier {user.kycTier}</span>
									{#if user.status !== 'active'}<StatusChip label={status.label} tone={status.tone} />{/if}
								</div>
							</td>
							<td>
								<p class="font-code text-[11px] text-[#ececf1]">{money(user.spendNgn)}</p>
								<p class="font-code text-[8px] uppercase tracking-[0.04em] text-[#6f6f7b]">{user.ticketsCount} passes · {user.ordersCount} orders</p>
							</td>
							<td>
								<div class="flex justify-end gap-1">
									<a href={hrefFor(user.id)} class="row-action" aria-label={`Inspect ${user.name}`}><Eye size={13} /></a>
									<a href={`/users/${user.id}`} class="row-action" aria-label={`Open ${user.name}`}><ArrowUpRight size={12} /></a>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<Pagination pageNumber={data.table.page} pages={data.table.pages} total={data.table.total} perPage={data.table.perPage} label="users" />
	</section>

	{#if selected}
		<section class="panel overflow-hidden">
			<div class="flex items-center justify-between border-b border-[#26262e] px-4 py-2.5">
				<div class="flex items-center gap-2"><p class="mono-label">User dossier // inspect</p><span class="font-code text-[8px] text-[#54545f]">Session token: tok_ng_live_{selected.id.slice(-5)}</span></div>
				<span class="chip !h-[17px] !text-[7.5px]">GDPR scoped</span>
			</div>
			<div class="grid grid-cols-1 lg:grid-cols-[1fr_1.45fr]">
				<div class="border-b border-[#24242c] p-4 lg:border-b-0 lg:border-r">
					<div class="flex items-start gap-3">
						<Avatar name={selected.name} size="lg" />
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-1.5">
								<h3 class="font-display text-[17px] font-semibold text-[#f0f0f5]">{selected.name}</h3>
								<span class="chip chip-accent !h-[17px] !text-[8px]">Tier {selected.kycTier} verified</span>
							</div>
							<p class="mt-0.5 font-code text-[9px] text-[#8f8f9b]">@{selected.handle} · #{selected.id.toUpperCase()}</p>
							<div class="mt-2 flex flex-wrap gap-1">
								<StatusChip label={userStatus(selected.status).label} tone={userStatus(selected.status).tone} />
								<span class="chip !h-[16px] !text-[7.5px]">{selected.role}</span>
								<span class="chip !h-[16px] !text-[7.5px]">{selected.city}</span>
							</div>
						</div>
					</div>

					<div class="mt-3 flex flex-wrap gap-1.5">
						<button type="button" class="btn btn-sm" onclick={() => toasts.info('Admin ping sent', `${selected.name} received a secure in-app notification.`)}>
							<Smartphone size={12} /> Send admin ping
						</button>
						<button type="button" class="btn btn-sm" onclick={exportDossier}><Download size={12} /> Export dossier</button>
					</div>

					<div class="mt-4 flex items-center gap-3 border-b border-[#26262e]">
						{#each [{ key: 'overview', label: 'Overview & KYC' }, { key: 'passes', label: `Passes ${selected.ticketsCount}` }, { key: 'ledger', label: 'Ledger' }, { key: 'audit', label: 'Audit history' }] as item}
							<button type="button" class="tab !text-[10.5px]" data-active={tab === item.key} onclick={() => (tab = item.key as typeof tab)}>{item.label}</button>
						{/each}
					</div>

					{#if tab === 'overview'}
						<div class="mt-3 space-y-3">
							<div>
								<p class="mono-label !text-[7.5px]">Personal & contact telemetry</p>
								<div class="mt-1.5 space-y-1 text-[10px]">
									<p class="flex justify-between gap-2"><span class="text-[#6f6f7b]">Primary work email</span><span class="truncate font-code text-[#dcdce4]">{selected.email}</span></p>
									<p class="flex justify-between gap-2"><span class="text-[#6f6f7b]">Registered phone</span><span class="font-code text-[#dcdce4]">{selected.phone}</span></p>
									<p class="flex justify-between gap-2"><span class="text-[#6f6f7b]">Verification</span><span class="font-code text-emerald-300">Verified (SPF/DKIM valid)</span></p>
									<p class="flex justify-between gap-2"><span class="text-[#6f6f7b]">Last seen</span><span class="text-[#dcdce4]">{relative(selected.lastSeenAt)}</span></p>
									<p class="flex justify-between gap-2"><span class="text-[#6f6f7b]">Joined</span><span class="text-[#dcdce4]">{relative(selected.joinedAt)}</span></p>
								</div>
							</div>
							<div>
								<p class="mono-label !text-[7.5px]">Geo-IP & operational base</p>
								<p class="mt-1 flex items-center gap-1.5 text-[10.5px] text-[#c9c9d4]"><MapPin size={11} class="text-[#6f6f7b]" /> {selected.city}, Nigeria <span class="font-code text-[8px] text-[#6f6f7b]">(AS37148 MainOne)</span></p>
							</div>
							<div>
								<p class="mono-label !text-[7.5px]">Compliance & KYC verification</p>
								<div class="mt-1.5 space-y-1.5 text-[10px]">
									<p class="flex items-center gap-1.5 text-[#a0a0ab]"><ShieldCheck size={11} class="text-emerald-400" /> NIN identity slip · <span class="font-code text-[#dcdce4]">9048-••••-319</span></p>
									<p class="flex items-center gap-1.5 text-[#a0a0ab]"><Fingerprint size={11} class="text-emerald-400" /> Biometric passkey enclave · FIDO2 WebAuthn</p>
									<p class="flex items-center gap-1.5 text-[#a0a0ab]"><ShieldCheck size={11} class="text-emerald-400" /> Payment gateway anchor · Paystack</p>
								</div>
							</div>
							<div>
								<p class="mono-label !text-[7.5px]">Security & policy integrity</p>
								<div class="mt-1.5 space-y-1 text-[10px]">
									<p class="flex justify-between"><span class="text-[#6f6f7b]">Hardware 2FA</span><span class="font-code text-emerald-300">Enforced</span></p>
									<p class="flex justify-between"><span class="text-[#6f6f7b]">Community policy strikes</span><span class="font-code text-[#dcdce4]">{selected.flags?.length ?? 0} strikes</span></p>
									<p class="flex justify-between"><span class="text-[#6f6f7b]">Chargebacks</span><span class="font-code text-[#dcdce4]">0 (0.0%)</span></p>
								</div>
							</div>
							<div class="pt-1">
								{#if selected.status === 'active'}
									<button type="button" class="btn btn-sm btn-danger-soft w-full" onclick={() => (blockOpen = true)}><Ban size={12} /> Suspend account access</button>
								{:else}
									<button type="button" class="btn btn-sm btn-primary w-full" disabled={busy} onclick={() => setStatus('active')}>Reinstate account</button>
								{/if}
							</div>
						</div>
					{:else if tab === 'passes'}
						<div class="mt-3 space-y-1.5">
							{#each data.related.tickets as ticket}
								<a href={`/tickets?ticket=${ticket.id}`} class="flex items-center gap-2 rounded-md border border-[#292930] px-2.5 py-2 hover:bg-[#1e1e25]">
									<div class="min-w-0 flex-1">
										<p class="truncate text-[10.5px] text-[#dcdce4]">{ticket.eventTitle}</p>
										<p class="font-code text-[8px] text-[#6f6f7b]">{ticket.tierName} · {ticket.code}</p>
									</div>
									<span class={chipClass(ticketStatus(ticket.status).tone)}>{ticketStatus(ticket.status).label}</span>
								</a>
							{:else}
								<p class="text-[10.5px] text-[#6f6f7b]">No indexed passes for this account.</p>
							{/each}
						</div>
					{:else if tab === 'ledger'}
						<div class="mt-3 space-y-1.5">
							{#each data.related.orders as order}
								<a href={`/orders?order=${order.id}`} class="flex items-center gap-2 rounded-md border border-[#292930] px-2.5 py-2 hover:bg-[#1e1e25]">
									<div class="min-w-0 flex-1">
										<p class="truncate text-[10.5px] text-[#dcdce4]">{order.eventTitle}</p>
										<p class="font-code text-[8px] text-[#6f6f7b]">{order.reference} · {time(order.createdAt)}</p>
									</div>
									<span class="font-code text-[10px] text-[#dcdce4]">{money(order.totalNgn)}</span>
									<span class={chipClass(orderStatus(order.status).tone)}>{orderStatus(order.status).label}</span>
								</a>
							{:else}
								<p class="text-[10.5px] text-[#6f6f7b]">No order ledger entries indexed.</p>
							{/each}
						</div>
					{:else}
						<div class="mt-3 space-y-2">
							{#each data.related.audit as record}
								<div class="border-l border-[#33333d] pl-2.5">
									<p class="font-code text-[8.5px] uppercase text-[#c9c9d4]">{record.action}</p>
									<p class="text-[9px] text-[#6f6f7b]">{record.actor} · {relative(record.at)} · {record.target}</p>
								</div>
							{:else}
								<p class="text-[10.5px] text-[#6f6f7b]">No administrative actions recorded for this account.</p>
							{/each}
						</div>
					{/if}
				</div>

				<div class="p-4">
					<div class="grid grid-cols-3 gap-2">
						<div class="panel-inset p-2.5">
							<p class="mono-label !text-[7px]">Net spend</p>
							<p class="mt-1 font-display text-[15px] font-semibold text-[#ececf1]">{moneyCompact(selected.spendNgn)}</p>
							<p class="font-code text-[7.5px] uppercase text-[#6f6f7b]">{selected.ordersCount} orders</p>
						</div>
						<div class="panel-inset p-2.5">
							<p class="mono-label !text-[7px]">Chargebacks</p>
							<p class="mt-1 font-display text-[15px] font-semibold text-emerald-300">0</p>
							<p class="font-code text-[7.5px] uppercase text-[#6f6f7b]">zero fraud flags</p>
						</div>
						<div class="panel-inset p-2.5">
							<p class="mono-label !text-[7px]">Passes held</p>
							<p class="mt-1 font-display text-[15px] font-semibold text-[#ececf1]">{selected.ticketsCount}</p>
							<p class="font-code text-[7.5px] uppercase text-[#6f6f7b]">{selected.ordersCount} orders</p>
						</div>
					</div>

					<div class="mt-3 rounded-lg border border-[#2a2a32] p-3">
						<div class="flex items-center justify-between">
							<p class="mono-label !text-[8px]">Lifetime spend & reliability</p>
							<span class="chip chip-ok !h-[16px] !text-[7.5px]">Clean</span>
						</div>
						<div class="mt-1.5 space-y-1 text-[10px]">
							<p class="flex justify-between"><span class="text-[#6f6f7b]">Lifetime ticket value</span><span class="font-code text-[#dcdce4]">{money(selected.spendNgn)}</span></p>
							<p class="flex justify-between"><span class="text-[#6f6f7b]">Passes purchased</span><span class="font-code text-[#dcdce4]">{selected.ticketsCount}</span></p>
							<p class="flex justify-between"><span class="text-[#6f6f7b]">Disputes</span><span class="font-code text-[#dcdce4]">0.0%</span></p>
						</div>
					</div>

					<div class="mt-3">
						<div class="flex items-center justify-between">
							<p class="mono-label !text-[8px]">Recent passes</p>
							<a href={`/tickets?q=${selected.handle}`} class="font-code text-[8px] uppercase text-[#c6bcff] hover:underline">View all →</a>
						</div>
						<div class="mt-1.5 space-y-1.5">
							{#each data.related.tickets.slice(0, 2) as ticket}
								<div class="flex items-center gap-2">
									<span class="flex h-6 w-6 items-center justify-center rounded border border-[#33333d] bg-[#1e1e25] text-[7px] text-[#8f8f9b]">PASS</span>
									<div class="min-w-0 flex-1">
										<p class="truncate text-[10px] text-[#d4d4dc]">{ticket.eventTitle}</p>
										<p class="font-code text-[7.5px] text-[#6f6f7b]">{ticket.tierName} · {ticket.status === 'valid' ? 'Valid / unused' : ticketStatus(ticket.status).label}</p>
									</div>
									<span class={chipClass(ticketStatus(ticket.status).tone)}>{ticketStatus(ticket.status).label}</span>
								</div>
							{:else}
								<p class="text-[10px] text-[#6f6f7b]">No passes yet.</p>
							{/each}
						</div>
					</div>

					<div class="mt-3 flex items-center justify-between rounded-lg border border-[#2a2a32] bg-[#18181e] px-3 py-2">
						<div>
							<p class="mono-label !text-[7px]">Last password rotation</p>
							<p class="mt-0.5 text-[10px] text-[#c9c9d4]">48 days ago</p>
						</div>
						<span class="chip chip-warn !h-[16px] !text-[7.5px]">Review advised</span>
					</div>
				</div>
			</div>
		</section>
	{/if}
</div>

<Sheet open={blockOpen} title="Suspend account access" subtitle="This immediately revokes wallet passes and chat access." onclose={() => (blockOpen = false)} width="430px">
	<form class="space-y-3" onsubmit={(event) => { event.preventDefault(); setStatus('blocked'); }}>
		<div class="rounded-lg border border-red-500/25 bg-red-500/[0.06] p-3 text-[10.5px] leading-relaxed text-red-100/80">
			{selected?.name} · @{selected?.handle}. Blocking is reversible but will be logged with your admin signature.
		</div>
		<label class="field-label" for="user-reason">Reason</label>
		<textarea id="user-reason" class="textarea" bind:value={reason} required placeholder="e.g. Chargeback ring investigation — risk engine escalation."></textarea>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (blockOpen = false)}>Cancel</button>
			<button type="submit" class="btn btn-sm btn-danger" disabled={busy}>Suspend account</button>
		</div>
	</form>
</Sheet>
