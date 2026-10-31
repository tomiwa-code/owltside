<script lang="ts">
	import {
		Bell,
		ChevronDown,
		Download,
		KeyRound,
		LogOut,
		Menu,
		RefreshCw,
		Search,
		ShieldCheck
	} from '@lucide/svelte';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import Avatar from './Avatar.svelte';
	import { shell } from '$admin/state/shell.svelte';
	import { relative } from '$admin/utils/format';
	import type { AdminNotificationItem, AdminSession } from '$admin/types';

	let {
		admin,
		serverTime,
		alerts = 0,
		initialNotifications = []
	}: {
		admin: AdminSession;
		serverTime: string;
		alerts?: number;
		initialNotifications?: AdminNotificationItem[];
	} = $props();

	let clock = $state(untrack(() => serverTime));
	let notificationsOpen = $state(false);
	let liveItems = $state<AdminNotificationItem[]>(untrack(() => initialNotifications));
	let liveAlertCount = $state(untrack(() => alerts));
	let refreshing = $state(false);

	$effect(() => {
		liveItems = initialNotifications;
		liveAlertCount = alerts;
	});

	async function refreshFeed() {
		refreshing = true;
		try {
			const res = await fetch('/api/notifications?limit=25', {
				credentials: 'same-origin',
				cache: 'no-store'
			});
			if (res.ok) {
				const payload = (await res.json()) as {
					actionableCount: number;
					items: AdminNotificationItem[];
				};
				liveItems = payload.items ?? [];
				liveAlertCount = payload.actionableCount ?? 0;
			}
		} catch {
			// Ignore transient poll errors
		} finally {
			refreshing = false;
		}
	}

	onMount(() => {
		const tick = () => (clock = new Date().toISOString());
		tick();
		const id = setInterval(tick, 1000);
		const pollId = setInterval(() => void refreshFeed(), 20_000);
		return () => {
			clearInterval(id);
			clearInterval(pollId);
		};
	});

	const time = $derived(
		new Intl.DateTimeFormat('en-NG', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
			timeZone: 'Africa/Lagos'
		}).format(new Date(clock))
	);

	const labelMap: Record<string, string> = {
		dashboard: 'Dashboard',
		notifications: 'Notifications',
		events: 'Events',
		approvals: 'Approvals',
		organizers: 'Organizers',
		users: 'Users',
		tickets: 'Tickets',
		orders: 'Orders & Txns',
		settlements: 'Financial Analytics',
		refunds: 'Refunds',
		moderation: 'Moderation',
		reports: 'Reports',
		audit: 'Audit Logs',
		staff: 'Roles & Admins',
		settings: 'Settings',
		search: 'Search HUD'
	};
	const segments = $derived(page.url.pathname.split('/').filter(Boolean));
	const current = $derived(labelMap[segments[0] ?? 'dashboard'] ?? 'Control plane');
	const isDetail = $derived(segments.length > 1);

	function kindLabel(kind: AdminNotificationItem['kind']): string {
		switch (kind) {
			case 'verification':
				return 'KYC / Bank';
			case 'payout':
				return 'Payout';
			case 'refund':
				return 'Refund';
			case 'report':
				return 'Report';
			case 'event':
				return 'Event';
			case 'order':
				return 'Order';
			default:
				return 'Approval';
		}
	}

	function dotColor(item: AdminNotificationItem): string {
		if (!item.actionable) return 'bg-emerald-400';
		if (item.kind === 'report') return 'bg-red-400';
		if (item.kind === 'refund' || item.kind === 'payout') return 'bg-amber-400';
		return 'bg-[#a998ff]';
	}
</script>

<header
	class="sticky top-0 z-30 flex h-[57px] items-center gap-3 border-b border-[#232329] bg-[#101014]/92 px-3 backdrop-blur-xl sm:px-5"
>
	<button
		type="button"
		class="row-action lg:hidden"
		aria-label="Open navigation"
		onclick={() => shell.openNav()}
	>
		<Menu size={16} />
	</button>

	<div class="hidden min-w-0 shrink-0 items-center gap-2 font-code text-[9.5px] uppercase tracking-[0.12em] text-[#63636f] sm:flex">
		<span class="whitespace-nowrap text-[#8f8f9b]">owltside</span>
		<span class="text-[#3f3f49]">/</span>
		<span class="whitespace-nowrap">control-plane</span>
		<span class="text-[#3f3f49]">/</span>
		<span class="truncate whitespace-nowrap text-[#b6b6c0]">{current}{isDetail ? ' · record' : ''}</span>
	</div>

	<button
		type="button"
		onclick={() => shell.openPalette()}
		class="mx-auto flex h-[32px] w-full min-w-0 max-w-[420px] items-center gap-2 rounded-lg border border-[#2d2d36] bg-[#17171d] px-2.5 text-left transition-colors hover:border-[#3c3c46] hover:bg-[#1c1c23]"
	>
		<Search size={13} class="shrink-0 text-[#6f6f7b]" />
		<span class="hidden flex-1 truncate text-[11.5px] text-[#6f6f7b] sm:block">
			Search events, orders, attendees, tickets…
		</span>
		<span class="flex-1 text-[11.5px] text-[#6f6f7b] sm:hidden">Search</span>
		<span class="kbd hidden sm:inline-flex">⌘K</span>
	</button>

	<div class="ml-auto flex shrink-0 items-center gap-1.5">
		<div class="hidden items-center gap-2 rounded-md border border-[#2b2b33] bg-[#17171d] px-2 py-1.5 xl:flex">
			<span class="status-dot !h-1 !w-1"></span>
			<span class="font-code text-[9px] uppercase tracking-[0.1em] text-[#8f8f9b]">WAT Node 01</span>
			<span class="font-code text-[9px] text-[#5d5d69]">//</span>
			<span class="font-code text-[9px] text-[#c6bcff]">12ms</span>
		</div>
		<span class="hidden whitespace-nowrap font-code text-[9.5px] text-[#6f6f7b] md:inline">{time} WAT</span>

		<div class="relative">
			<button
				type="button"
				class="row-action relative !h-8 !w-8"
				aria-label="Submitted requests and notifications"
				aria-expanded={notificationsOpen}
				onclick={() => {
					notificationsOpen = !notificationsOpen;
					shell.accountMenu = false;
					if (notificationsOpen) void refreshFeed();
				}}
			>
				<Bell size={15} />
				{#if liveAlertCount > 0}
					<span class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-code text-[8px] font-bold text-white ring-2 ring-[#101014]">
						{liveAlertCount > 99 ? '99+' : liveAlertCount}
					</span>
				{/if}
			</button>
			{#if notificationsOpen}
				<button
					type="button"
					class="fixed inset-0 z-30 h-full w-full cursor-default"
					aria-label="Dismiss notifications"
					onclick={() => (notificationsOpen = false)}
				></button>
				<div class="absolute right-0 top-10 z-40 w-[360px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-[#34343e] bg-[#17171d] shadow-2xl animate-fade-up">
					<div class="flex items-center justify-between border-b border-[#2a2a32] px-3.5 py-2.5">
						<div class="flex items-center gap-2">
							<p class="mono-label !text-[8.5px]">Submitted requests & alerts</p>
							<button
								type="button"
								onclick={() => refreshFeed()}
								class="text-[#8f8f9b] hover:text-white"
								aria-label="Refresh notifications"
							>
								<RefreshCw size={11} class={refreshing ? 'animate-spin' : ''} />
							</button>
						</div>
						<span class="chip {liveAlertCount > 0 ? 'chip-warn' : 'chip-ok'} !h-[16px] !text-[8px]">
							{liveAlertCount} pending
						</span>
					</div>
					<div class="max-h-[380px] overflow-y-auto">
						{#if liveItems.length === 0}
							<div class="px-4 py-7 text-center">
								<p class="text-[12px] font-medium text-[#d4d4de]">Queue is clear</p>
								<p class="mt-1 text-[11px] text-[#7f7f8c]">
									New approvals, KYC submissions, payouts, refunds, reports, and events appear here automatically.
								</p>
							</div>
						{:else}
							{#each liveItems.slice(0, 12) as item (item.id)}
								<a
									href={item.href}
									onclick={() => (notificationsOpen = false)}
									class="flex gap-2.5 border-b border-[#24242c] px-3.5 py-2.5 last:border-0 hover:bg-[#1e1e25]"
								>
									<span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full {dotColor(item)}"></span>
									<span class="min-w-0 flex-1">
										<span class="flex items-center justify-between gap-2">
											<span class="font-code text-[8px] uppercase tracking-[0.12em] text-[#a998ff]">
												{kindLabel(item.kind)} · {item.status}
											</span>
											<span class="shrink-0 font-code text-[8.5px] text-[#6f6f7b]">
												{relative(item.createdAt)}
											</span>
										</span>
										<span class="mt-0.5 block truncate text-[11.5px] font-medium text-[#e4e4ea]">
											{item.title}
										</span>
										<span class="mt-0.5 line-clamp-2 block text-[10.5px] leading-snug text-[#8d8d9a]">
											{item.body}
										</span>
										<span class="mt-0.5 block truncate font-code text-[8.5px] text-[#6b6b78]">
											From: {item.actor}
										</span>
									</span>
								</a>
							{/each}
						{/if}
					</div>
					<a
						href="/notifications"
						onclick={() => (notificationsOpen = false)}
						class="block border-t border-[#2a2a32] px-3.5 py-2.5 font-code text-[9px] uppercase tracking-[0.1em] text-[#c6bcff] hover:bg-[#1e1e25]"
					>
						View all requests & notifications ({liveItems.length}) →
					</a>
				</div>
			{/if}
		</div>

		<a href="/api/export/overview" class="btn btn-sm hidden sm:inline-flex" download>
			<Download size={12} />
			<span class="hidden md:inline">Export</span>
		</a>

		<div class="relative">
			<button
				type="button"
				class="flex items-center gap-1.5 rounded-md px-1 py-1 transition-colors hover:bg-[#1d1d24]"
				aria-label="Account menu"
				aria-expanded={shell.accountMenu}
				onclick={() => {
					shell.toggleAccount();
					notificationsOpen = false;
				}}
			>
				<Avatar name={admin.name} size="sm" />
				<span class="hidden max-w-[92px] truncate text-[11.5px] text-[#c9c9d4] md:inline">{admin.name}</span>
				<ChevronDown size={11} class="hidden text-[#6f6f7b] md:inline" />
			</button>
			{#if shell.accountMenu}
				<button
					type="button"
					class="fixed inset-0 z-30 h-full w-full cursor-default"
					aria-label="Dismiss account menu"
					onclick={() => (shell.accountMenu = false)}
				></button>
				<div class="absolute right-0 top-11 z-40 w-[250px] overflow-hidden rounded-xl border border-[#34343e] bg-[#17171d] shadow-2xl animate-fade-up">
					<div class="border-b border-[#2a2a32] px-3.5 py-3">
						<p class="text-[12px] font-medium text-[#ececf1]">{admin.name}</p>
						<p class="mt-0.5 font-code text-[9px] text-[#7f7f8c]">{admin.email}</p>
						<div class="mt-2 flex items-center gap-1.5">
							<span class="chip chip-accent !h-[16px] !text-[8px]">{admin.role}</span>
							<span class="chip !h-[16px] !text-[8px]">Tier {admin.tier}</span>
						</div>
					</div>
					<a href="/staff" class="flex items-center gap-2 px-3.5 py-2.5 text-[11.5px] text-[#c1c1cc] hover:bg-[#1e1e25]">
						<ShieldCheck size={13} /> Roles & access control
					</a>
					<a href="/settings" class="flex items-center gap-2 px-3.5 py-2.5 text-[11.5px] text-[#c1c1cc] hover:bg-[#1e1e25]">
						<KeyRound size={13} /> Security & hardware keys
					</a>
					<div class="border-t border-[#2a2a32] p-1.5">
						<form method="POST" action="/logout">
							<button type="submit" class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[11.5px] text-red-300 hover:bg-red-500/10">
								<LogOut size={13} /> Sign out
							</button>
						</form>
					</div>
				</div>
			{/if}
		</div>
	</div>
</header>
