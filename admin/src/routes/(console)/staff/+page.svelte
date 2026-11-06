<script lang="ts">
	import {
		Check,
		Download,
		KeyRound,
		Lock,
		Search,
		ShieldAlert,
		ShieldCheck,
		Trash2,
		UserPlus,
		Users
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toasts } from '$admin/state/toast.svelte';
	import { chipClass, staffStatus } from '$admin/utils/status';
	import { num, relative } from '$admin/utils/format';
	import type { AdminStaff, DbAdminRole } from '$admin/types';
	import type { AssignableUser } from '$admin/server/admin-access';
	import PageHeader from '$components/PageHeader.svelte';
	import Avatar from '$components/Avatar.svelte';
	import Sheet from '$components/Sheet.svelte';

	let { data } = $props();

	let tab = $state<'directory' | 'matrix'>('directory');
	let roleFilter = $state<'all' | 'superadmin' | 'admin'>('all');
	let searchQuery = $state('');
	let selectedId = $state<string | null>(null);
	let assignOpen = $state(false);
	let busy = $state(false);

	// Assign form state
	let candidateQuery = $state('');
	let pickedUser = $state<AssignableUser | null>(null);
	let name = $state('');
	let email = $state('');
	let targetRole = $state<DbAdminRole>('admin');

	const filteredStaff = $derived(
		data.staff.filter((member) => {
			if (roleFilter !== 'all' && member.dbRole !== roleFilter) return false;
			const q = searchQuery.trim().toLowerCase();
			if (!q) return true;
			return [member.name, member.handle, member.email, member.role].some((val) =>
				val.toLowerCase().includes(q)
			);
		})
	);

	const selected = $derived(
		filteredStaff.find((member) => member.id === selectedId) ??
			data.staff.find((member) => member.id === selectedId) ??
			filteredStaff[0] ??
			data.staff[0] ??
			null
	);

	const matchingCandidates = $derived.by(() => {
		const q = (candidateQuery || email).trim().toLowerCase();
		if (!q) return data.candidates.slice(0, 6);
		return data.candidates
			.filter((user) =>
				[user.name, user.handle, user.email].some((field) => field.toLowerCase().includes(q))
			)
			.slice(0, 6);
	});

	const matrix = $derived([
		{
			role: 'Super Admin' as const,
			dbRole: 'superadmin' as const,
			tier: 0,
			members: data.counts.superAdmins,
			grants: {
				signIn: true,
				operations: true,
				approvalsAndRefunds: true,
				announcements: true,
				exports: true,
				settings: true,
				manageAdmins: true
			}
		},
		{
			role: 'Admin' as const,
			dbRole: 'admin' as const,
			tier: 1,
			members: data.counts.admins,
			grants: {
				signIn: true,
				operations: true,
				approvalsAndRefunds: true,
				announcements: true,
				exports: true,
				settings: false,
				manageAdmins: false
			}
		}
	]);

	const scopeCopy: Record<string, string> = {
		'Super Admin':
			'Full control-plane authority across all modules, including assigning or revoking Admin roles, updating platform financial settings, and verifying audit ledgers.',
		Admin:
			'Full operational dashboard access for moderating events, deciding KYC/payout/refund approvals, managing users and organizers, resolving reports, sending announcements, and exporting CSV ledgers.'
	};

	function openAssignSheet() {
		pickedUser = null;
		candidateQuery = '';
		name = '';
		email = '';
		targetRole = 'admin';
		assignOpen = true;
	}

	function selectCandidate(user: AssignableUser) {
		pickedUser = user;
		email = user.email;
		name = user.name;
		candidateQuery = '';
	}

	function clearPickedUser() {
		pickedUser = null;
	}

	async function assignAdmin(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;

		const trimmedEmail = email.trim().toLowerCase();
		if (!pickedUser && (!trimmedEmail || !trimmedEmail.includes('@'))) {
			toasts.error('Valid email required', 'Select an existing user or enter a valid email address.');
			return;
		}

		busy = true;
		const response = await fetch('/api/staff/invite', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				userId: pickedUser?.id,
				email: trimmedEmail,
				name: name.trim(),
				role: targetRole
			})
		});
		const payload = (await response.json().catch(() => ({}))) as {
			message?: string;
			error?: string;
			staff?: AdminStaff;
		};
		busy = false;

		if (!response.ok) {
			toasts.error(
				'Role assignment failed',
				payload.message ?? payload.error ?? 'Only Super Admins can assign administrator roles.'
			);
			return;
		}

		toasts.ok(
			'Administrator role assigned',
			`${payload.staff?.name ?? trimmedEmail} now has ${payload.staff?.role ?? 'Admin'} access.`
		);
		assignOpen = false;
		pickedUser = null;
		name = '';
		email = '';
		await invalidateAll();
	}

	async function changeRole(member: AdminStaff, nextRole: 'superadmin' | 'admin' | 'user') {
		if (busy) return;
		busy = true;
		const response = await fetch(`/api/staff/${member.id}/status`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				role: nextRole,
				reason:
					nextRole === 'user'
						? 'Removed administrator role from Roles & Admins'
						: `Changed role to ${nextRole}`
			})
		});
		const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
		busy = false;

		if (!response.ok) {
			toasts.error(
				'Could not update role',
				payload.message ?? payload.error ?? 'Action could not be completed.'
			);
			return;
		}

		if (nextRole === 'user') {
			toasts.ok('Admin access removed', `${member.name} (@${member.handle}) is now a standard user.`);
			if (selectedId === member.id) selectedId = null;
		} else {
			toasts.ok(
				'Role updated',
				`${member.name} is now ${nextRole === 'superadmin' ? 'Super Admin' : 'Admin'}.`
			);
		}
		await invalidateAll();
	}
</script>

<svelte:head><title>Roles &amp; Admins · Owltside Admin</title></svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Roles & Administrators"
		subtitle="Manage Super Admin and Admin access for the Owltside control plane. Administrators sign in with the same Owltside account used on the main app."
		crumbs={['governance', 'roles & admins']}
		eyebrow="Supabase · public.profiles.role"
	>
		{#snippet actions()}
			<a class="btn btn-sm" href="/api/export/staff" download>
				<Download size={12} /> Export Manifest (CSV)
			</a>
			{#if data.isSuperAdmin}
				<button type="button" class="btn btn-sm btn-primary" onclick={openAssignSheet}>
					<UserPlus size={13} /> Assign Administrator
				</button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if data.error}
		<div class="panel border border-rose-500/30 p-4 text-[11.5px] leading-relaxed text-rose-200" role="alert">
			<p class="font-medium text-rose-100">{data.error}</p>
			<p class="mt-1 text-[10.5px] text-[#9c9ca8]">
				Ensure <code class="text-[#c6bcff]">PUBLIC_SUPABASE_URL</code> and
				<code class="text-[#c6bcff]">SUPABASE_SERVICE_ROLE_KEY</code> are configured and
				<code class="text-[#c6bcff]">supabase/sql/032_profile_admin_roles.sql</code> has been applied.
			</p>
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
		<div class="panel p-4">
			<div class="flex items-center justify-between">
				<p class="mono-label">Total administrators</p>
				<Users size={13} class="text-[#6f6f7b]" />
			</div>
			<p class="mt-2 flex items-baseline gap-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">
				{num(data.counts.total)}
				<span class="font-code text-[9px] font-normal text-[#8f8f9b]">accounts</span>
			</p>
			<p class="mt-1.5 flex items-center gap-1 text-[10.5px] text-[#8f8f9b]">
				<span class="status-dot"></span> {num(data.counts.active)} active on control plane
			</p>
		</div>

		<div class="panel p-4">
			<div class="flex items-center justify-between">
				<p class="mono-label">Super Admins</p>
				<ShieldCheck size={13} class="text-[#c6bcff]" />
			</div>
			<p class="mt-2 flex items-baseline gap-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">
				{num(data.counts.superAdmins)}
				<span class="font-code text-[9px] font-normal text-[#8f8f9b]">tier 0</span>
			</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Full governance &amp; role assignment</p>
		</div>

		<div class="panel p-4">
			<div class="flex items-center justify-between">
				<p class="mono-label">Admins</p>
				<Lock size={13} class="text-emerald-400" />
			</div>
			<p class="mt-2 flex items-baseline gap-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">
				{num(data.counts.admins)}
				<span class="font-code text-[9px] font-normal text-[#8f8f9b]">tier 1</span>
			</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Dashboard operations &amp; approvals</p>
		</div>

		<div class="panel p-4">
			<div class="flex items-center justify-between">
				<p class="mono-label">Standard users</p>
				<KeyRound size={13} class="text-[#6f6f7b]" />
			</div>
			<p class="mt-2 flex items-baseline gap-2 font-display text-[clamp(17px,2.5vw,25px)] font-semibold leading-none text-[#f1f1f6]">
				{num(data.counts.regularUsers)}
				<span class="font-code text-[9px] font-normal text-[#8f8f9b]">users</span>
			</p>
			<p class="mt-1.5 text-[10.5px] text-[#8f8f9b]">Blocked from admin console sign-in</p>
		</div>
	</div>

	<div class="flex flex-col gap-2 xl:flex-row xl:items-center">
		<div class="panel flex w-full flex-wrap gap-1 p-1 xl:w-auto">
			{#each [{ key: 'directory', label: `Administrators (${data.counts.total})` }, { key: 'matrix', label: 'Role Capabilities Matrix' }] as item}
				<button
					type="button"
					class="tab !text-[10.5px]"
					data-active={tab === item.key}
					onclick={() => (tab = item.key as typeof tab)}
				>
					{item.label}
				</button>
			{/each}
		</div>

		{#if tab === 'directory'}
			<div class="flex flex-wrap items-center gap-2 xl:ml-auto">
				<div class="relative">
					<Search size={12} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6f6f7b]" />
					<input
						type="search"
						bind:value={searchQuery}
						placeholder="Filter by name, @handle, email…"
						class="input !h-[32px] !w-[230px] !pl-8 !text-[11px]"
					/>
				</div>
				<select
					class="select !h-[32px] !min-w-[165px] !text-[10.5px]"
					aria-label="Filter role"
					bind:value={roleFilter}
				>
					<option value="all">Filter: All roles</option>
					<option value="superadmin">Super Admin (Tier 0)</option>
					<option value="admin">Admin (Tier 1)</option>
				</select>
			</div>
		{/if}
	</div>

	<div class="grid grid-cols-1 gap-3 xl:grid-cols-[1.9fr_1fr]">
		<div class="space-y-3">
			{#if tab === 'directory'}
				<section class="panel overflow-hidden">
					<header class="panel-head">
						<div class="flex items-center gap-2">
							<p class="mono-label">Authorized administrators</p>
							<span class="chip chip-ok !h-[16px] !text-[7.5px]">{filteredStaff.length} shown</span>
						</div>
						<span class="font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">
							Unified login with main app
						</span>
					</header>

					{#if filteredStaff.length === 0}
						<div class="px-5 py-10 text-center">
							<p class="font-display text-[14px] font-semibold text-[#ececf1]">
								{data.counts.total === 0
									? 'No administrators assigned yet'
									: 'No administrators match this filter'}
							</p>
							<p class="mx-auto mt-1.5 max-w-[440px] text-[11.5px] leading-relaxed text-[#8f8f9b]">
								{#if data.counts.total === 0}
									Set a user's <code class="text-[#c6bcff]">role</code> column to
									<code class="text-[#c6bcff]">superadmin</code> in Supabase
									<code class="text-[#c6bcff]">public.profiles</code>, then assign additional admins from here.
								{:else}
									Clear your search or role filter to view all active administrators.
								{/if}
							</p>
						</div>
					{:else}
						<div class="table-wrap">
							<table class="tbl">
								<thead>
									<tr>
										<th>Administrator</th>
										<th>Role</th>
										<th>Sign-in method</th>
										<th>Last sign-in</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{#each filteredStaff as member (member.id)}
										{@const status = staffStatus(member.status)}
										{@const isSelf = Boolean(data.currentUserId && member.id === data.currentUserId)}
										<tr
											data-selected={selected?.id === member.id}
											onclick={() => (selectedId = member.id)}
										>
											<td class="min-w-[190px]">
												<div class="flex items-center gap-2.5">
													<Avatar name={member.name} size="sm" accent={member.status === 'active'} />
													<div class="min-w-0">
														<p class="flex items-center gap-1.5 truncate text-[11px] font-medium text-[#e8e8ee]">
															<span class="truncate">{member.name}</span>
															{#if member.dbRole === 'superadmin'}
																<ShieldCheck size={11} class="shrink-0 text-[#c6bcff]" />
															{/if}
															{#if isSelf}
																<span class="chip chip-accent !h-[15px] !px-1.5 !text-[7px]">You</span>
															{/if}
														</p>
														<p class="truncate font-code text-[8px] text-[#6f6f7b]">
															@{member.handle}{member.email ? ` · ${member.email}` : ''}
														</p>
													</div>
												</div>
											</td>
											<td>
												<span class="chip {member.dbRole === 'superadmin' ? 'chip-accent' : 'chip-ok'} !h-[18px] !text-[8px]">
													{member.role}
												</span>
												<p class="mt-0.5 font-code text-[8px] uppercase text-[#6f6f7b]">
													Tier {member.tier} · {status.label}
												</p>
											</td>
											<td>
												<p class="flex items-center gap-1 text-[9.5px] text-[#c9c9d4]">
													<KeyRound size={9} class="text-[#6f6f7b]" /> {member.auth}
												</p>
												<p class="mt-0.5 max-w-[150px] truncate text-[8px] text-[#6f6f7b]">
													{member.city}
												</p>
											</td>
											<td class="whitespace-nowrap">
												<p class="text-[9.5px] text-[#c9c9d4]">
													{member.lastActive ? relative(member.lastActive) : 'Never signed in'}
												</p>
												<p class="font-code text-[8px] text-[#6f6f7b]">
													Added {relative(member.createdAt)}
												</p>
											</td>
											<td>
												{#if data.isSuperAdmin}
													<div class="flex items-center justify-end gap-1.5" onclick={(e) => e.stopPropagation()} role="presentation">
														{#if member.dbRole === 'admin'}
															<button
																type="button"
																class="chip !h-[20px] !text-[7.5px] hover:!border-[#c6bcff]/50 hover:!text-[#c6bcff]"
																disabled={busy}
																onclick={() => changeRole(member, 'superadmin')}
															>
																Make Super Admin
															</button>
														{:else if !isSelf}
															<button
																type="button"
																class="chip !h-[20px] !text-[7.5px]"
																disabled={busy}
																onclick={() => changeRole(member, 'admin')}
															>
																Make Admin
															</button>
														{/if}
														<button
															type="button"
															class="chip chip-danger !h-[20px] !text-[7.5px]"
															disabled={busy || isSelf}
															title={isSelf ? 'You cannot remove your own Super Admin role' : 'Remove admin access'}
															onclick={() => changeRole(member, 'user')}
														>
															<Trash2 size={9} /> Remove
														</button>
													</div>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}

					<div class="flex flex-wrap items-center justify-between gap-2 border-t border-[#26262e] px-4 py-2 font-code text-[8px] uppercase tracking-[0.08em] text-[#6f6f7b]">
						<span>{data.counts.total} administrator{data.counts.total === 1 ? '' : 's'} · Source: public.profiles.role</span>
						<span>Live role enforcement</span>
					</div>
				</section>

				{#if data.telemetry.length > 0}
					<section class="panel overflow-hidden">
						<header class="panel-head">
							<p class="mono-label">Recent governance &amp; role audit log</p>
							<span class="font-code text-[8px] uppercase text-emerald-300">Session ledger</span>
						</header>
						<div class="divide-y divide-[#24242c]">
							{#each data.telemetry as entry}
								<div class="flex flex-wrap items-start gap-2 px-3.5 py-2">
									<span class="font-code text-[8.5px] text-[#6f6f7b]">[{entry.at.slice(11, 19)}]</span>
									<p class="min-w-0 flex-1 text-[10px] leading-snug text-[#c9c9d4]">
										<span class="font-code text-[9.5px] text-[#e6e6ec]">{entry.actor}</span> {entry.message}
									</p>
									<span class={chipClass(entry.tone === 'danger' ? 'danger' : entry.tone === 'warn' ? 'warn' : 'ok')}>
										{entry.tag}
									</span>
								</div>
							{/each}
						</div>
					</section>
				{/if}
			{:else}
				<section class="panel overflow-hidden">
					<header class="panel-head">
						<p class="mono-label">Role capabilities matrix</p>
						<span class="font-code text-[8px] uppercase text-[#6f6f7b]">Server-enforced guards</span>
					</header>
					<div class="table-wrap">
						<table class="tbl">
							<thead>
								<tr>
									<th>Role</th>
									<th>Tier</th>
									<th>Console login</th>
									<th>Events &amp; users</th>
									<th>Approvals &amp; refunds</th>
									<th>Announcements</th>
									<th>CSV exports</th>
									<th>Platform settings</th>
									<th>Manage admins</th>
								</tr>
							</thead>
							<tbody>
								{#each matrix as row}
									<tr>
										<td class="primary-cell text-[10.5px]">
											{row.role}
											<span class="ml-1.5 font-code text-[8px] text-[#6f6f7b]">({row.members})</span>
										</td>
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
					<p class="border-t border-[#26262e] px-4 py-2 text-[9.5px] text-[#6f6f7b]">
						Permissions resolve server-side in <code class="text-[#c6bcff]">$admin/server/auth.ts</code> against <code class="text-[#c6bcff]">public.profiles.role</code> on every request.
					</p>
				</section>
			{/if}
		</div>

		<aside class="space-y-3">
			<section class="panel overflow-hidden">
				<header class="flex items-start justify-between gap-2 border-b border-[#26262e] px-3.5 py-2.5">
					<div>
						<p class="mono-label flex items-center gap-1"><span class="status-dot"></span> Role inspector</p>
						<h2 class="mt-1 font-display text-[16px] font-semibold leading-tight text-[#f0f0f5]">
							{selected?.role ?? 'Super Admin & Admin'}
						</h2>
					</div>
					{#if selected}
						<span class="chip !h-[18px] !text-[7.5px]">Tier {selected.tier}</span>
					{/if}
				</header>
				<div class="space-y-3 p-3.5">
					<p class="text-[10.5px] leading-relaxed text-[#8f8f9b]">
						{scopeCopy[selected?.role ?? 'Admin']}
					</p>

					{#if selected}
						<div class="panel-inset space-y-1.5 p-2.5 text-[10px]">
							<div class="flex items-center justify-between gap-2">
								<span class="text-[#6f6f7b]">Account</span>
								<span class="truncate font-medium text-[#ececf1]">{selected.name} (@{selected.handle})</span>
							</div>
							<div class="flex items-center justify-between gap-2">
								<span class="text-[#6f6f7b]">Email</span>
								<span class="truncate font-code text-[9px] text-[#c9c9d4]">{selected.email || '—'}</span>
							</div>
							<div class="flex items-center justify-between gap-2">
								<span class="text-[#6f6f7b]">DB column</span>
								<code class="text-[9px] text-[#c6bcff]">profiles.role = '{selected.dbRole}'</code>
							</div>
						</div>
					{/if}

					<div class="flex items-start gap-2 rounded-md border border-[#2a2a32] bg-[#18181e] px-2.5 py-2">
						<ShieldAlert size={12} class="mt-0.5 shrink-0 text-[#c6bcff]" />
						<p class="text-[9.5px] leading-snug text-[#8f8f9b]">
							<strong class="text-[#dcdce4]">Unified Owltside identity.</strong> Any user whose
							<code>profiles.role</code> is <code>user</code> is denied entry at sign-in. Removing an admin immediately invalidates their active console session while keeping their customer account intact.
						</p>
					</div>

					{#if data.isSuperAdmin}
						<button type="button" class="btn btn-primary w-full" onclick={openAssignSheet}>
							<UserPlus size={13} /> Assign role to a user
						</button>
					{/if}
				</div>
			</section>
		</aside>
	</div>
</div>

<Sheet
	open={assignOpen}
	title="Assign administrator role"
	subtitle="Grant Admin or Super Admin dashboard access to an existing or new Owltside user."
	onclose={() => (assignOpen = false)}
	width="460px"
>
	<form class="space-y-3.5" onsubmit={assignAdmin}>
		{#if data.candidates.length > 0 && !pickedUser}
			<div>
				<label class="field-label" for="candidate-search">
					<span>Select existing Owltside user</span>
					<span class="!text-[8px] text-[#6f6f7b]">Optional quick pick</span>
				</label>
				<div class="relative">
					<Search size={12} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6f6f7b]" />
					<input
						id="candidate-search"
						type="search"
						class="input !pl-8 !text-[12px]"
						bind:value={candidateQuery}
						placeholder="Search registered users by name, @handle, or email…"
					/>
				</div>
				{#if matchingCandidates.length > 0}
					<div class="mt-1.5 max-h-[156px] divide-y divide-[#25252e] overflow-y-auto rounded-lg border border-[#2a2a32] bg-[#141419]">
						{#each matchingCandidates as candidate (candidate.id)}
							<button
								type="button"
								onclick={() => selectCandidate(candidate)}
								class="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[#1d1d25]"
							>
								<Avatar name={candidate.name} size="xs" />
								<span class="min-w-0 flex-1">
									<span class="block truncate text-[11px] font-medium text-[#ececf1]">
										{candidate.name} <span class="font-code text-[9px] text-[#7c7c8a]">@{candidate.handle}</span>
									</span>
									<span class="block truncate font-code text-[8.5px] text-[#6f6f7b]">{candidate.email}</span>
								</span>
								<span class="chip !h-[17px] !text-[7.5px]">Select</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		{#if pickedUser}
			<div class="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] px-3 py-2">
				<div class="min-w-0">
					<p class="flex items-center gap-1 text-[11px] font-medium text-emerald-100">
						<Check size={12} class="text-emerald-300" /> {pickedUser.name} (@{pickedUser.handle})
					</p>
					<p class="truncate font-code text-[9px] text-emerald-200/75">{pickedUser.email}</p>
				</div>
				<button type="button" class="chip !h-[19px] !text-[8px]" onclick={clearPickedUser}>
					Change
				</button>
			</div>
		{:else}
			<div>
				<label class="field-label" for="staff-email">
					<span>User email address</span>
					<span class="!text-[8px] text-[#6f6f7b]">Existing or new user</span>
				</label>
				<input
					id="staff-email"
					type="email"
					class="input"
					bind:value={email}
					required
					placeholder="user@example.com"
				/>
				<p class="mt-1 text-[10px] text-[#7a7a88]">
					If this email already has a main-app account, that account is promoted. Otherwise a new Owltside account is created automatically.
				</p>
			</div>

			<div>
				<label class="field-label" for="staff-name">
					<span>Display name</span>
					<span class="!text-[8px] text-[#6f6f7b]">Used if creating a new account</span>
				</label>
				<input
					id="staff-name"
					class="input"
					bind:value={name}
					placeholder="Full name"
				/>
			</div>
		{/if}

		<div>
			<label class="field-label" for="staff-role">Dashboard role</label>
			<select id="staff-role" class="select" bind:value={targetRole}>
				<option value="admin">Admin — Dashboard operations &amp; approvals</option>
				<option value="superadmin">Super Admin — Full control &amp; manage admins</option>
			</select>
		</div>

		<div class="rounded-lg border border-[#2a2a32] bg-[#18181e] p-2.5 text-[10px] leading-relaxed text-[#8f8f9b]">
			Once assigned, this user can sign in to both the <strong class="text-[#dcdce4]">Owltside main app</strong> and the <strong class="text-[#dcdce4]">Admin dashboard</strong> using their email 6-digit login code or Google account.
		</div>

		<div class="flex justify-end gap-2 pt-1">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (assignOpen = false)}>
				Cancel
			</button>
			<button type="submit" class="btn btn-sm btn-primary" disabled={busy}>
				<UserPlus size={12} /> {busy ? 'Assigning…' : 'Assign Role'}
			</button>
		</div>
	</form>
</Sheet>
