<script lang="ts">
	import {
		ArrowLeft,
		ArrowUpRight,
		Ban,
		Check,
		Download,
		FileText,
		Fingerprint,
		Mail,
		MapPin,
		Phone,
		Ticket,
		Wallet,
		ZoomIn
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass, orderStatus, ticketStatus, userStatus } from '$admin/utils/status';
	import { money, moneyCompact, num, relative, shortDate } from '$admin/utils/format';
	import type { AdminApprovalAttachment, AdminUser } from '$admin/types';
	import PageHeader from '$components/PageHeader.svelte';
	import Avatar from '$components/Avatar.svelte';
	import StatusChip from '$components/StatusChip.svelte';
	import Sheet from '$components/Sheet.svelte';

	let { data } = $props();

	let blockOpen = $state(false);
	let previewAttachment = $state<AdminApprovalAttachment | null>(null);
	let reason = $state('');
	let busy = $state(false);

	const user = $derived<AdminUser>(data.user);
	const activePasses = $derived(data.tickets.filter((ticket) => ticket.status === 'valid').length);

	async function setStatus(status: 'active' | 'blocked') {
		busy = true;
		const response = await fetch(`/api/users/${user.id}/status`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				status,
				reason: reason || (status === 'blocked' ? 'Disabled from user dossier' : 'Enabled from user dossier')
			})
		});
		const payload = (await response.json().catch(() => ({}))) as { message?: string };
		busy = false;
		if (!response.ok) {
			toasts.error('Account update failed', payload.message ?? 'Insufficient privileges.');
			return;
		}
		toasts.ok(
			status === 'blocked' ? 'User account disabled' : 'User account enabled',
			`${user.name} (@${user.handle}) · audit trail updated.`
		);
		blockOpen = false;
		reason = '';
		await invalidateAll();
	}
</script>

<svelte:head><title>{user.name} · Users · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title={user.name}
		subtitle={`@${user.handle} · ${user.email || 'No email'} · ${user.phone || 'No phone'}`}
		crumbs={['platform', 'users', user.handle]}
		eyebrow={`Live profile · Verified: ${user.kycTier === 1 ? 'Yes' : 'No'}`}
	>
		{#snippet actions()}
			<a href="/users" class="btn btn-sm"><ArrowLeft size={12} /> Back to directory</a>
			<a class="btn btn-sm" href={`/tickets?q=${encodeURIComponent(user.handle)}`}>
				<Ticket size={12} /> All passes
			</a>
			{#if user.status === 'active'}
				<button type="button" class="btn btn-sm btn-danger-soft" onclick={() => (blockOpen = true)}>
					<Ban size={12} /> Disable account
				</button>
			{:else}
				<button type="button" class="btn btn-sm btn-primary" disabled={busy} onclick={() => setStatus('active')}>
					<Check size={12} /> Enable account
				</button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if user.disabledReason && user.status === 'blocked'}
		<div class="panel border border-rose-500/30 bg-rose-500/[0.06] p-3.5 text-[11.5px] text-rose-200">
			<strong>Account disabled:</strong> {user.disabledReason}
		</div>
	{/if}

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
			<p class="mono-label">Active passes</p>
			<p class="mt-1.5 font-display text-[clamp(16px,2.2vw,22px)] font-semibold leading-none text-[#f1f1f6]">{activePasses} <span class="font-code text-[10px] font-normal text-[#8f8f9b]">of {data.tickets.length}</span></p>
			<p class="mt-1.5 text-[10px] text-[#8f8f9b]">Not yet redeemed</p>
		</div>
		<div class="panel p-4">
			<p class="mono-label">Settlement bank</p>
			<p class="mt-1.5 truncate font-code text-[13px] font-semibold text-[#f1f1f6]">{user.bankAccountNumber || 'Not linked'}</p>
			<p class="mt-1 text-[10px] text-[#8f8f9b]">{user.bankName || 'No payout bank submitted'}</p>
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
								<p class="font-code text-[8px] text-[#6f6f7b]">{ticket.code} · {ticket.tierName}</p>
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
				<header class="panel-head"><p class="mono-label">Full contact & profile</p><Mail size={12} class="text-[#8f8f9b]" /></header>
				<div class="space-y-1.5 p-3.5 text-[10.5px]">
					<p class="flex items-center justify-between gap-3"><span class="flex items-center gap-1.5 text-[#8f8f9b]"><Mail size={10} /> Email</span><span class="truncate font-code select-all text-[#ededf4]">{user.email || '—'}</span></p>
					<p class="flex items-center justify-between gap-3"><span class="flex items-center gap-1.5 text-[#8f8f9b]"><Phone size={10} /> Phone</span><span class="font-code select-all text-[#ededf4]">{user.phone || '—'}</span></p>
					<p class="flex items-center justify-between gap-3"><span class="flex items-center gap-1.5 text-[#8f8f9b]"><MapPin size={10} /> City</span><span class="text-[#dcdce4]">{user.city}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#8f8f9b]">Role</span><span class="text-[#dcdce4]">{user.role} ({user.operatingIdentity ?? 'attendee'})</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#8f8f9b]">User ID</span><span class="font-code text-[9px] select-all text-[#a0a0ab]">{user.id}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#8f8f9b]">Joined</span><span class="text-[#dcdce4]">{relative(user.joinedAt)}</span></p>
					<p class="flex justify-between gap-3"><span class="text-[#8f8f9b]">Last seen</span><span class="text-[#dcdce4]">{relative(user.lastSeenAt)}</span></p>
					{#if user.bio}
						<p class="border-t border-[#24242c] pt-2 text-[10px] text-[#a0a0ab]">{user.bio}</p>
					{/if}
				</div>
			</section>

			<section class="panel overflow-hidden">
				<header class="panel-head"><p class="mono-label">Unmasked KYC & bank details</p><Fingerprint size={12} class="text-[#8f8f9b]" /></header>
				<div class="space-y-1.5 p-3.5 text-[10.5px]">
					<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Profile verified</span><span class="font-code text-[#dcdce4]">{user.kycTier === 1 ? 'Yes' : 'No'}</span></p>
					<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Legal name</span><span class="font-code select-all text-[#ededf4]">{user.kycLegalName || user.name}</span></p>
					<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Date of birth</span><span class="font-code select-all text-[#ededf4]">{user.kycDateOfBirth || '—'}</span></p>
					<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">ID type</span><span class="font-code text-[#ededf4]">{user.kycDocument || '—'}</span></p>
					<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Full ID / NIN / BVN</span><span class="font-code font-semibold select-all text-emerald-300">{user.kycReference || '—'}</span></p>
					<p class="flex justify-between gap-2 border-t border-[#24242c] pt-1.5"><span class="text-[#8f8f9b]">Bank</span><span class="font-code text-[#ededf4]">{user.bankName || '—'}</span></p>
					<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Full NUBAN</span><span class="font-code font-semibold select-all text-emerald-300">{user.bankAccountNumber || '—'}</span></p>
					<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Account holder</span><span class="font-code text-[#ededf4]">{user.bankAccountHolder || '—'}</span></p>

					{#if user.kycAttachments && user.kycAttachments.length > 0}
						<div class="grid grid-cols-2 gap-2 pt-2">
							{#each user.kycAttachments as att}
								<button
									type="button"
									onclick={() => (previewAttachment = att)}
									class="flex items-center justify-between rounded border border-[#32323d] bg-[#14141b] px-2.5 py-2 font-code text-[9px] text-[#c6bcff] hover:border-[#7c60f6]"
								>
									<span class="truncate">{att.side.toUpperCase()} ID</span>
									{#if att.mimeType.startsWith('image/')}
										<ZoomIn size={11} />
									{:else}
										<FileText size={11} />
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
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
						<p class="text-[10.5px] text-[#6f6f7b]">No session audit entries recorded for this account yet.</p>
					{/each}
				</div>
			</section>

			<div class="panel p-3.5 text-[9.5px] leading-relaxed text-[#6f6f7b]">
				Disabling an account terminates active sessions on the public app and prevents OTP/OAuth/passkey login until re-enabled. {num(user.ticketsCount)} passes · {money(user.spendNgn)} lifetime.
			</div>
		</div>
	</div>
</div>

<Sheet open={blockOpen} title="Disable user account" subtitle="Reversible; logged with your admin signature." onclose={() => (blockOpen = false)} width="430px">
	<form class="space-y-3" onsubmit={(event) => { event.preventDefault(); setStatus('blocked'); }}>
		<label class="field-label" for="block-reason">Reason</label>
		<textarea id="block-reason" class="textarea" bind:value={reason} required placeholder="e.g. Policy violation — account access disabled."></textarea>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (blockOpen = false)}>Cancel</button>
			<button type="submit" class="btn btn-sm btn-danger" disabled={busy}>
				<Ban size={12} /> Disable account
			</button>
		</div>
	</form>
</Sheet>

<Sheet
	open={previewAttachment !== null}
	title={previewAttachment ? `${previewAttachment.side.toUpperCase()} ID · ${previewAttachment.name}` : 'ID Document'}
	subtitle="Uploaded KYC identity document"
	onclose={() => (previewAttachment = null)}
	width="680px"
>
	{#if previewAttachment?.dataUrl}
		<div class="space-y-3">
			{#if previewAttachment.mimeType.startsWith('image/')}
				<img src={previewAttachment.dataUrl} alt={previewAttachment.name} class="max-h-[72vh] w-full rounded-lg border border-[#2d2d37] bg-black object-contain" />
			{:else}
				<iframe src={previewAttachment.dataUrl} title={previewAttachment.name} class="h-[70vh] w-full rounded-lg border border-[#2d2d37] bg-white"></iframe>
			{/if}
			<div class="flex justify-end gap-2">
				<a href={previewAttachment.dataUrl} download={previewAttachment.name} class="btn btn-sm btn-primary">
					<Download size={12} /> Download original
				</a>
			</div>
		</div>
	{/if}
</Sheet>
