<script lang="ts">
	import {
		ArrowUpRight,
		Ban,
		Check,
		Download,
		Eye,
		FileText,
		ShieldCheck,
		UserCheck,
		Users,
		ZoomIn
	} from '@lucide/svelte';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass, ticketStatus, userStatus, orderStatus } from '$admin/utils/status';
	import { money, moneyCompact, num, relative, time } from '$admin/utils/format';
	import type { AdminApprovalAttachment, AdminUser } from '$admin/types';
	import PageHeader from '$components/PageHeader.svelte';
	import Avatar from '$components/Avatar.svelte';
	import StatusChip from '$components/StatusChip.svelte';
	import Pagination from '$components/Pagination.svelte';
	import SearchField from '$components/SearchField.svelte';
	import Sheet from '$components/Sheet.svelte';

	let { data } = $props();

	let tab = $state<'overview' | 'passes' | 'ledger' | 'audit'>('overview');
	let blockTarget = $state<AdminUser | null>(null);
	let previewAttachment = $state<AdminApprovalAttachment | null>(null);
	let reason = $state('');
	let busyUserId = $state<string | null>(null);

	const selected = $derived(data.selected);

	function hrefFor(userId: string): string {
		const url = new URL(page.url);
		url.searchParams.set('user', userId);
		return `${url.pathname}${url.search}`;
	}

	function change(event: Event) {
		(event.currentTarget as HTMLSelectElement).form?.requestSubmit();
	}

	async function setStatus(target: AdminUser, status: 'active' | 'blocked', customReason?: string) {
		busyUserId = target.id;
		const response = await fetch(`/api/users/${target.id}/status`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				status,
				reason: customReason || reason || (status === 'blocked' ? 'Disabled by Owltside Admin' : 'Re-enabled by Owltside Admin')
			})
		});
		const payload = (await response.json().catch(() => ({}))) as { message?: string };
		busyUserId = null;
		if (!response.ok) {
			toasts.error('Account update failed', payload.message ?? 'Insufficient privileges.');
			return;
		}
		toasts.ok(
			status === 'blocked' ? 'User account disabled' : 'User account enabled',
			`${target.name} (@${target.handle}) · active sessions updated.`
		);
		blockTarget = null;
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
		subtitle="Manage attendee & organizer accounts, disable/enable access, and inspect full unredacted contact, KYC ID, and bank payout details."
		crumbs={['platform', 'users']}
		eyebrow="Supabase · live accounts"
	>
		{#snippet actions()}
			<a class="btn btn-sm" href="/api/export/users" download><Download size={12} /> Export CSV Roster</a>
			<a class="btn btn-sm btn-primary" href="/staff"><UserCheck size={13} /> Invite Staff</a>
		{/snippet}
	</PageHeader>

	{#if data.error}
		<div class="panel border border-rose-500/30 p-4 text-[11px] text-rose-200">
			{data.error}
			<span class="mt-1 block text-[#8f8f9b]">Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in this admin app's environment, then reload.</span>
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Total registered</p><Users size={13} class="text-[#6f6f7b]" /></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.total)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">public.profiles records</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Enabled accounts</p><span class="status-dot"></span></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.active)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Permitted to sign in on public app</p>
		</div>
		<div class="panel p-4">
			<div class="flex items-center justify-between"><p class="mono-label">Organizer profiles</p><ShieldCheck size={13} class="text-[#8dd3c7]" /></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">{num(data.counts.verifiedOrganizers)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Host identity or active listings</p>
		</div>
		<div class="panel border-red-500/20 bg-red-500/[0.03] p-4">
			<div class="flex items-center justify-between"><p class="mono-label !text-red-200/70">Disabled accounts</p><span class="chip chip-danger !h-[17px] !text-[8px]">Auth blocked</span></div>
			<p class="mt-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-red-100">{num(data.counts.flagged + data.counts.blocked)}</p>
			<p class="mt-1.5 text-[10.5px] text-[#a0a0ab]">Signed out & blocked on public app</p>
		</div>
	</div>

	<div class="panel px-3 py-2.5">
		<form method="GET" class="flex flex-col gap-2 xl:flex-row xl:items-center">
			<SearchField value={data.filters.q} placeholder="Search by name, @handle, email, phone, ID…" class="xl:w-[300px]" />
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<select name="status" class="select !h-[34px] !text-[11.5px]" onchange={change} aria-label="Filter by status">
					<option value="all" selected={data.filters.status === 'all'}>Status: All</option>
					<option value="active" selected={data.filters.status === 'active'}>Active (enabled)</option>
					<option value="blocked" selected={data.filters.status === 'blocked'}>Disabled (blocked)</option>
				</select>
				<select name="role" class="select !h-[34px] !text-[11.5px]" onchange={change} aria-label="Filter by role">
					<option value="all" selected={data.filters.role === 'all'}>Role: All</option>
					<option value="Attendee" selected={data.filters.role === 'Attendee'}>Attendee</option>
					<option value="Organizer" selected={data.filters.role === 'Organizer'}>Organizer</option>
				</select>
				<select name="kyc" class="select !h-[34px] !text-[11.5px]" onchange={change} aria-label="Filter by KYC">
					<option value="all" selected={data.filters.kyc === 'all'}>Verification: All</option>
					<option value="1" selected={data.filters.kyc === '1'}>Verified</option>
					<option value="0" selected={data.filters.kyc === '0'}>Unverified</option>
				</select>
				<span class="chip !h-[34px] justify-center !text-[9px]">Sort: Latest registration</span>
			</div>
			<a href="/users" class="btn btn-sm btn-ghost xl:ml-auto">Reset</a>
		</form>
	</div>

	<section class="panel overflow-hidden">
		<div class="flex items-center justify-between border-b border-[#26262e] px-4 py-2.5">
			<div class="flex items-center gap-2">
				<p class="font-code text-[9px] uppercase tracking-[0.1em] text-[#8f8f9b]">User accounts</p>
				<span class="chip chip-accent !h-[18px] !text-[8px]">{data.table.total.toLocaleString('en-US')} total</span>
			</div>
		</div>
		<div class="table-wrap">
			<table class="tbl">
				<thead>
					<tr>
						<th>User</th>
						<th>Email & phone</th>
						<th>Role & status</th>
						<th>Activity & spend</th>
						<th class="!text-right">Actions</th>
					</tr>
				</thead>
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
											{#if user.status === 'active'}<span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>{/if}
										</a>
										<p class="font-code text-[8.5px] text-[#6f6f7b]">@{user.handle} · {user.id.slice(0, 8)}</p>
									</div>
								</div>
							</td>
							<td>
								<p class="primary-cell max-w-[210px] truncate font-code text-[10.5px]">{user.email || '—'}</p>
								<p class="font-code text-[8.5px] text-[#8f8f9b]">{user.phone || '—'}</p>
							</td>
							<td>
								<div class="flex flex-wrap items-center gap-1.5">
									<span class="text-[10.5px] text-[#d4d4dc]">{user.role}</span>
									<StatusChip label={status.label} tone={status.tone} />
								</div>
								<p class="mt-0.5 font-code text-[8.5px] text-[#8f8f9b]">
									Verified: {user.kycTier === 1 ? 'Yes' : 'No'}{user.bankAccountNumber ? ` · Bank ${user.bankAccountNumber}` : ''}
								</p>
							</td>
							<td>
								<p class="font-code text-[11px] text-[#ececf1]">{money(user.spendNgn)}</p>
								<p class="font-code text-[8px] uppercase tracking-[0.04em] text-[#6f6f7b]">{user.ticketsCount} passes · {user.ordersCount} orders</p>
							</td>
							<td>
								<div class="flex justify-end gap-1">
									{#if user.status === 'active'}
										<button
											type="button"
											class="row-action text-rose-300 hover:text-rose-200"
											title="Disable user account"
											aria-label={`Disable ${user.name}`}
											disabled={busyUserId === user.id}
											onclick={() => {
												blockTarget = user;
												reason = '';
											}}
										>
											<Ban size={13} />
										</button>
									{:else}
										<button
											type="button"
											class="row-action text-emerald-300 hover:text-emerald-200"
											title="Enable user account"
											aria-label={`Enable ${user.name}`}
											disabled={busyUserId === user.id}
											onclick={() => setStatus(user, 'active', 'Re-enabled from Users table')}
										>
											<Check size={13} />
										</button>
									{/if}
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
				<div class="flex items-center gap-2">
					<p class="mono-label">User dossier // full unredacted view</p>
					<span class="font-code text-[8px] text-[#6f6f7b]">{selected.id}</span>
				</div>
				<a href={`/users/${selected.id}`} class="font-code text-[8px] uppercase tracking-[0.1em] text-[#c6bcff] hover:underline">
					Full page dossier ↗
				</a>
			</div>
			<div class="grid grid-cols-1 lg:grid-cols-[1.1fr_1.35fr]">
				<div class="border-b border-[#24242c] p-4 lg:border-b-0 lg:border-r">
					<div class="flex items-start gap-3">
						<Avatar name={selected.name} size="lg" />
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-1.5">
								<h3 class="font-display text-[17px] font-semibold text-[#f0f0f5]">{selected.name}</h3>
								<span class="chip chip-accent !h-[17px] !text-[8px]">Verified: {selected.kycTier === 1 ? 'Yes' : 'No'}</span>
							</div>
							<p class="mt-0.5 font-code text-[9px] text-[#8f8f9b]">@{selected.handle}</p>
							<div class="mt-2 flex flex-wrap gap-1">
								<StatusChip label={userStatus(selected.status).label} tone={userStatus(selected.status).tone} />
								<span class="chip !h-[16px] !text-[7.5px]">{selected.role}</span>
								<span class="chip !h-[16px] !text-[7.5px]">{selected.city}</span>
							</div>
						</div>
					</div>

					<div class="mt-3 flex flex-wrap gap-1.5">
						{#if selected.status === 'active'}
							<button
								type="button"
								class="btn btn-sm btn-danger-soft"
								disabled={busyUserId === selected.id}
								onclick={() => {
									blockTarget = selected;
									reason = '';
								}}
							>
								<Ban size={12} /> Disable account
							</button>
						{:else}
							<button
								type="button"
								class="btn btn-sm btn-primary"
								disabled={busyUserId === selected.id}
								onclick={() => setStatus(selected, 'active')}
							>
								<Check size={12} /> Enable account
							</button>
						{/if}
						<button type="button" class="btn btn-sm" onclick={exportDossier}>
							<Download size={12} /> Export JSON dossier
						</button>
					</div>

					{#if selected.disabledReason && selected.status === 'blocked'}
						<div class="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-2.5 text-[10.5px] text-rose-200">
							<strong>Disabled reason:</strong> {selected.disabledReason}
						</div>
					{/if}

					<div class="mt-4 flex items-center gap-3 border-b border-[#26262e]">
						{#each [{ key: 'overview', label: 'Contact, KYC & Bank' }, { key: 'passes', label: `Passes (${selected.ticketsCount})` }, { key: 'ledger', label: 'Orders' }, { key: 'audit', label: 'Audit' }] as item}
							<button type="button" class="tab !text-[10.5px]" data-active={tab === item.key} onclick={() => (tab = item.key as typeof tab)}>{item.label}</button>
						{/each}
					</div>

					{#if tab === 'overview'}
						<div class="mt-3 space-y-3 text-[10.5px]">
							<div class="rounded-lg border border-[#2a2a32] p-2.5 space-y-1">
								<p class="mono-label !text-[7.5px]">Contact & profile</p>
								<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Email</span><span class="font-code select-all text-[#ededf4]">{selected.email || '—'}</span></p>
								<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Phone</span><span class="font-code select-all text-[#ededf4]">{selected.phone || '—'}</span></p>
								<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Operating identity</span><span class="font-code text-[#dcdce4]">{selected.operatingIdentity ?? selected.role}</span></p>
								{#if selected.link}
									<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Website</span><span class="truncate font-code text-[#c6bcff]">{selected.link}</span></p>
								{/if}
								{#if selected.bio}
									<p class="pt-1 text-[10px] text-[#a0a0ab]">{selected.bio}</p>
								{/if}
							</div>

							<div class="rounded-lg border border-[#2a2a32] p-2.5 space-y-1">
								<p class="mono-label !text-[7.5px]">Government ID / KYC (unmasked)</p>
								{#if selected.kycReference || selected.kycDocument || selected.kycLegalName}
									<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Status</span><span class="font-code uppercase text-[#c6bcff]">{selected.kycStatus ?? 'submitted'}</span></p>
									{#if selected.kycLegalName}
										<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Legal name</span><span class="font-code select-all text-[#ededf4]">{selected.kycLegalName}</span></p>
									{/if}
									{#if selected.kycDateOfBirth}
										<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Date of birth</span><span class="font-code select-all text-[#ededf4]">{selected.kycDateOfBirth}</span></p>
									{/if}
									{#if selected.kycDocument}
										<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Document</span><span class="font-code text-[#ededf4]">{selected.kycDocument}</span></p>
									{/if}
									{#if selected.kycReference}
										<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">ID / NIN / BVN #</span><span class="font-code font-semibold select-all text-emerald-300">{selected.kycReference}</span></p>
									{/if}
									{#if selected.kycAttachments && selected.kycAttachments.length > 0}
										<div class="mt-2 grid grid-cols-2 gap-2 pt-1">
											{#each selected.kycAttachments as att}
												<button
													type="button"
													onclick={() => (previewAttachment = att)}
													class="flex items-center justify-between rounded border border-[#32323d] bg-[#14141b] px-2 py-1.5 text-left font-code text-[9px] text-[#c6bcff] hover:border-[#7c60f6]"
												>
													<span class="truncate">{att.side.toUpperCase()}: {att.name}</span>
													{#if att.mimeType.startsWith('image/')}
														<ZoomIn size={11} />
													{:else}
														<FileText size={11} />
													{/if}
												</button>
											{/each}
										</div>
									{/if}
								{:else}
									<p class="text-[10px] text-[#7f7f8c]">No KYC document submitted yet.</p>
								{/if}
							</div>

							<div class="rounded-lg border border-[#2a2a32] p-2.5 space-y-1">
								<p class="mono-label !text-[7.5px]">Payout bank details (unmasked)</p>
								{#if selected.bankAccountNumber || selected.bankName}
									<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Bank</span><span class="font-code text-[#ededf4]">{selected.bankName || '—'}</span></p>
									<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Account # (NUBAN)</span><span class="font-code font-semibold select-all text-emerald-300">{selected.bankAccountNumber || '—'}</span></p>
									{#if selected.bankAccountHolder}
										<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Account holder</span><span class="font-code text-[#ededf4]">{selected.bankAccountHolder}</span></p>
									{/if}
									{#if selected.bankStatus}
										<p class="flex justify-between gap-2"><span class="text-[#8f8f9b]">Verification</span><span class="font-code uppercase text-[#c6bcff]">{selected.bankStatus}</span></p>
									{/if}
								{:else}
									<p class="text-[10px] text-[#7f7f8c]">No bank account submitted yet.</p>
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
								<p class="text-[10.5px] text-[#6f6f7b]">No administrative actions recorded yet.</p>
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
							<p class="mono-label !text-[7px]">Joined</p>
							<p class="mt-1 font-display text-[14px] font-semibold text-[#ececf1]">{relative(selected.joinedAt)}</p>
							<p class="font-code text-[7.5px] uppercase text-[#6f6f7b]">Last seen {relative(selected.lastSeenAt)}</p>
						</div>
						<div class="panel-inset p-2.5">
							<p class="mono-label !text-[7px]">Passes held</p>
							<p class="mt-1 font-display text-[15px] font-semibold text-[#ececf1]">{selected.ticketsCount}</p>
							<p class="font-code text-[7.5px] uppercase text-[#6f6f7b]">{selected.ordersCount} orders</p>
						</div>
					</div>

					<div class="mt-3">
						<div class="flex items-center justify-between">
							<p class="mono-label !text-[8px]">Recent passes</p>
							<a href={`/tickets?q=${selected.handle}`} class="font-code text-[8px] uppercase text-[#c6bcff] hover:underline">View all →</a>
						</div>
						<div class="mt-1.5 space-y-1.5">
							{#each data.related.tickets.slice(0, 4) as ticket}
								<div class="flex items-center gap-2 rounded-md border border-[#24242c] px-2.5 py-1.5">
									<span class="flex h-6 w-6 items-center justify-center rounded border border-[#33333d] bg-[#1e1e25] text-[7px] text-[#8f8f9b]">PASS</span>
									<div class="min-w-0 flex-1">
										<p class="truncate text-[10px] text-[#d4d4dc]">{ticket.eventTitle}</p>
										<p class="font-code text-[7.5px] text-[#6f6f7b]">{ticket.tierName} · {ticket.code}</p>
									</div>
									<span class={chipClass(ticketStatus(ticket.status).tone)}>{ticketStatus(ticket.status).label}</span>
								</div>
							{:else}
								<p class="text-[10px] text-[#6f6f7b]">No passes yet.</p>
							{/each}
						</div>
					</div>
				</div>
			</div>
		</section>
	{/if}
</div>

<Sheet
	open={blockTarget !== null}
	title={blockTarget ? `Disable account · ${blockTarget.name}` : 'Disable user account'}
	subtitle="Blocks sign-in and terminates active sessions on the public app immediately."
	onclose={() => (blockTarget = null)}
	width="430px"
>
	{#if blockTarget}
		<form
			class="space-y-3"
			onsubmit={(event) => {
				event.preventDefault();
				if (blockTarget) setStatus(blockTarget, 'blocked');
			}}
		>
			<div class="rounded-lg border border-red-500/25 bg-red-500/[0.06] p-3 text-[10.5px] leading-relaxed text-red-100/80">
				{blockTarget.name} · @{blockTarget.handle}{blockTarget.email ? ` (${blockTarget.email})` : ''}. You can re-enable this account at any time.
			</div>
			<label class="field-label" for="user-reason">Reason</label>
			<textarea
				id="user-reason"
				class="textarea"
				bind:value={reason}
				required
				placeholder="e.g. Policy violation / fraudulent activity under Trust & Safety review."
			></textarea>
			<div class="flex justify-end gap-2">
				<button type="button" class="btn btn-sm btn-ghost" onclick={() => (blockTarget = null)}>Cancel</button>
				<button type="submit" class="btn btn-sm btn-danger" disabled={busyUserId !== null}>
					<Ban size={12} /> Disable user account
				</button>
			</div>
		</form>
	{/if}
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
