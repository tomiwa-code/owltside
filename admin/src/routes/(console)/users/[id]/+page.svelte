<script lang="ts">
	import {
		ArrowLeft,
		ArrowUpRight,
		Ban,
		Fingerprint,
		Mail,
		MapPin,
		Phone,
		ShieldCheck,
		Ticket,
		Wallet
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass, orderStatus, ticketStatus, userStatus } from '$admin/utils/status';
	import { money, moneyCompact, num, relative, shortDate } from '$admin/utils/format';
	import type { AdminUser } from '$admin/types';
	import PageHeader from '$components/PageHeader.svelte';
	import Avatar from '$components/Avatar.svelte';
	import StatusChip from '$components/StatusChip.svelte';
	import Sheet from '$components/Sheet.svelte';

	let { data } = $props();

	let blockOpen = $state(false);
	let reason = $state('');
	let busy = $state(false);

	const user = $derived<AdminUser>(data.user);
	const checkedIn = $derived(data.tickets.filter((ticket) => ticket.status === 'checked_in').length);

	async function setStatus(status: 'active' | 'blocked') {
		busy = true;
		const response = await fetch(`/api/users/${user.id}/status`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status, reason: reason || 'Account review decision' })
		});
		busy = false;
		if (!response.ok) {
			toasts.error('Account update failed', 'Insufficient privileges.');
			return;
		}
		toasts.ok(status === 'blocked' ? 'Account blocked' : 'Account reinstated', `${user.name} · audit trail updated.`);
		blockOpen = false;
		reason = '';
		await invalidateAll();
	}
</script>

<svelte:head><title>{user.name} · Users · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title={user.name}
		subtitle={`@${user.handle} · ${user.email}`}
		crumbs={['platform', 'users', user.handle]}
		eyebrow={`KYC Tier ${user.kycTier}`}
	>
		{#snippet actions()}
			<a href="/users" class="btn btn-sm"><ArrowLeft size={12} /> Back to directory</a>
			<a class="btn btn-sm" href={`/tickets?q=${encodeURIComponent(user.handle)}`}><Ticket size={12} /> All passes</a>
			{#if user.status === 'active'}
				<button type="button" class="btn btn-sm btn-danger-soft" onclick={() => (blockOpen = true)}><Ban size={12} /> Suspend account</button>
			{:else}
				<button type="button" class="btn btn-sm btn-primary" disabled={busy} onclick={() => setStatus('active')}>Reinstate account</button>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel flex items-center gap-3 p-4">
			<Avatar name={user.name} size="md" accent={user.status === 'active'} />
			<div class="min-w-0">
				<p class="mono-label !text-[7.5px]">Account status</p>
				<div class="mt-1"><StatusChip label={userStatus(user.status).label} tone={userStatus(user.status).tone} /></div>
			</div>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Lifetime spend</p>
			<p class="mt-1.5 font-display text-[clamp(16px,2.2vw,22px)] font-semibold leading-none text-[#f1f1f6]">{moneyCompact(user.spendNgn)}</p>
			<p class="mt-1.5 text-[10px] text-[#8f8f9b]">{user.ordersCount} orders · {user.ticketsCount} passes</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Gate clearance</p>
			<p class="mt-1.5 font-display text-[clamp(16px,2.2vw,22px)] font-semibold leading-none text-[#f1f1f6]">{checkedIn} <span class="font-code text-[10px] font-normal text-[#8f8f9b]">of {data.tickets.length}</span></p>
			<p class="mt-1.5 text-[10px] text-[#8f8f9b]">Turnstile SLA 99.8%</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Risk signals</p>
			<p class="mt-1.5 font-display text-[clamp(16px,2.2vw,22px)] font-semibold leading-none text-[#f1f1f6]">{user.flags?.length ?? 0}</p>
			<p class="mt-1.5 text-[10px] text-[#8f8f9b]">Chargebacks 0.0%</p>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-3 xl:grid-cols-[1.55fr_1fr]">
		<div class="space-y-3">
			<section class="panel overflow-hidden">
				<header class="panel-head"><p class="mono-label">Registered passes</p><span class="font-code text-[8px] uppercase text-[#6f6f7b]">{data.tickets.length} records</span></header>
				<div class="divide-y divide-[#24242c]">
					{#each data.tickets as ticket}
						<a href={`/tickets?ticket=${ticket.id}`} class="flex items-center gap-3 px-3.5 py-2.5 hover:bg-[#1b1b22]">
							<div class="min-w-0 flex-1">
								<p class="truncate text-[11px] text-[#e6e6ec]">{ticket.eventTitle}</p>
								<p class="font-code text-[8px] text-[#6f6f7b]">{ticket.code} · {ticket.tierName} · {ticket.seat}</p>
							</div>
							<span class="font-code text-[10px] text-[#dcdce4]">{money(ticket.priceNgn)}</span>
							<span class={chipClass(ticketStatus(ticket.status).tone)}>{ticketStatus(ticket.status).label}</span>
						</a>
					{:else}
						<p class="px-3.5 py-4 text-center text-[11px] text-[#6f6f7b]">No passes issued to this account.</p>
					{/each}
				</div>
			</section>

			<section class="panel overflow-hidden">
				<header class="panel-head"><p class="mono-label">Order ledger</p><Wallet size={12} class="text-[#8f8f9b]" /></header>
				<div class="table-wrap">
					<table class="tbl">
						<thead><tr><th>Reference</th><th>Event</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
						<tbody>
							{#each data.orders as order}
								<tr>
									<td><a href={`/orders?order=${order.id}`} class="font-code text-[9.5px] text-[#c6bcff] hover:underline">{order.reference}</a></td>
									<td class="max-w-[220px]"><p class="truncate text-[10.5px] text-[#dcdce4]">{order.eventTitle}</p></td>
									<td class="whitespace-nowrap font-code text-[9px] text-[#8f8f9b]">{shortDate(order.createdAt)}</td>
									<td class="font-code text-[10px] text-[#e6e6ec]">{money(order.totalNgn)}</td>
									<td><span class={chipClass(orderStatus(order.status).tone)}>{orderStatus(order.status).label}</span></td>
								</tr>
							{:else}
								<tr><td colspan="5" class="!py-5 text-center text-[11px] text-[#6f6f7b]">No transactions on record.</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		</div>

		<div class="space-y-3">
			<section class="panel overflow-hidden">
				<header class="panel-head"><p class="mono-label">Contact telemetry</p><Mail size={12} class="text-[#8f8f9b]" /></header>
				<div class="space-y-1.5 p-3.5 text-[10px]">
					<p class="flex items-center justify-between gap-3"><span class="flex items-center gap-1.5 text-[#6f6f7b]"><Mail size={9} /> Email</span><span class="truncate font-code text-[#dcdce4]">{user.email}</span></p>
					<p class="flex items-center justify-between gap-3"><span class="flex items-center gap-1.5 text-[#6f6f7b]"><Phone size={9} /> Phone</span><span class="font-code text-[#dcdce4]">{user.phone}</span></p>
					<p class="flex items-center justify-between gap-3"><span class="flex items-center gap-1.5 text-[#6f6f7b]"><MapPin size={9} /> Base</span><span class="text-[#dcdce4]">{user.city}, Nigeria</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Role</span><span class="text-[#dcdce4]">{user.role}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Joined</span><span class="text-[#dcdce4]">{relative(user.joinedAt)}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#6f6f7b]">Last seen</span><span class="text-[#dcdce4]">{relative(user.lastSeenAt)}</span></p>
				</div>
			</section>

			<section class="panel overflow-hidden">
				<header class="panel-head"><p class="mono-label">Compliance &amp; identity</p><Fingerprint size={12} class="text-[#8f8f9b]" /></header>
				<div class="space-y-1.5 p-3.5 text-[10px]">
					<p class="flex items-center justify-between gap-2"><span class="flex items-center gap-1.5 text-[#6f6f7b]"><ShieldCheck size={9} class="text-emerald-400" /> NIN identity</span><span class="font-code text-[#dcdce4]">9048-••••-319</span></p>
					<p class="flex items-center justify-between gap-2"><span class="flex items-center gap-1.5 text-[#6f6f7b]"><Fingerprint size={9} class="text-emerald-400" /> Passkey enclave</span><span class="font-code text-[#dcdce4]">FIDO2 active</span></p>
					<p class="flex justify-between gap-2"><span class="text-[#6f6f7b]">KYC tier</span><span class="font-code text-[#dcdce4]">Tier {user.kycTier} verified</span></p>
					<p class="flex justify-between gap-2"><span class="text-[#6f6f7b]">Payment anchor</span><span class="font-code text-[#dcdce4]">Paystack CUS_{user.id.slice(-6)}</span></p>
				</div>
				{#if user.flags?.length}
					<div class="flex flex-wrap gap-1 border-t border-[#26262e] px-3.5 py-2">
						{#each user.flags as flag}<span class="chip chip-warn !h-[17px] !text-[7.5px]">{flag}</span>{/each}
					</div>
				{/if}
			</section>

			<section class="panel overflow-hidden">
				<header class="panel-head"><p class="mono-label">Administrative history</p><ArrowUpRight size={12} class="text-[#8f8f9b]" /></header>
				<div class="space-y-2 p-3.5">
					{#each data.audit as record}
						<div class="border-l border-[#33333d] pl-2.5">
							<p class="font-code text-[8.5px] uppercase text-[#c9c9d4]">{record.action}</p>
							<p class="text-[9px] text-[#6f6f7b]">{record.actor} · {relative(record.at)}</p>
						</div>
					{:else}
						<p class="text-[10.5px] text-[#6f6f7b]">No admin actions on this account.</p>
					{/each}
				</div>
			</section>

			<div class="panel p-3.5 text-[9.5px] leading-relaxed text-[#6f6f7b]">
				Account actions are append-only and require a written justification. Suspensions revoke wallet passes and chat access within 30 seconds. {num(user.ticketsCount)} passes · {money(user.spendNgn)} lifetime.
			</div>
		</div>
	</div>
</div>

<Sheet open={blockOpen} title="Suspend account access" subtitle="Reversible; logged with your admin signature." onclose={() => (blockOpen = false)} width="430px">
	<form class="space-y-3" onsubmit={(event) => { event.preventDefault(); setStatus('blocked'); }}>
		<label class="field-label" for="block-reason">Justification</label>
		<textarea id="block-reason" class="textarea" bind:value={reason} required placeholder="e.g. Chargeback ring investigation — risk engine escalation."></textarea>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (blockOpen = false)}>Cancel</button>
			<button type="submit" class="btn btn-sm btn-danger" disabled={busy}>Suspend account</button>
		</div>
	</form>
</Sheet>
