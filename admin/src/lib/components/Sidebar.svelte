<script lang="ts">
	import {
		BarChart3,
		Building2,
		CalendarDays,
		Flag,
		LayoutDashboard,
		LogOut,
		Receipt,
		RotateCcw,
		ScanLine,
		ScrollText,
		Search,
		Settings,
		ShieldCheck,
		Ticket,
		Users
	} from '@lucide/svelte';
	import { ArrowUpRight } from '@lucide/svelte';
	import type { LucideIcon } from '@lucide/svelte';
	import Logo from './Logo.svelte';
	import Avatar from './Avatar.svelte';
	import { page } from '$app/state';
	import { shell } from '$admin/state/shell.svelte';
	import type { AdminSession } from '$admin/types';

	let {
		admin,
		counts,
		publicAppUrl = 'http://localhost:5173'
	}: {
		admin: AdminSession;
		counts: { pendingEvents: number; refunds: number; moderation: number };
		publicAppUrl?: string;
	} = $props();

	interface NavItem {
		label: string;
		href: string;
		icon: LucideIcon;
		badge?: number;
		live?: boolean;
	}
	interface NavGroup {
		label: string;
		items: NavItem[];
	}

	const groups = $derived.by<NavGroup[]>(() => [
		{
			label: 'Overview',
			items: [
				{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
				{ label: 'Search HUD', href: '/search', icon: Search }
			]
		},
		{
			label: 'Platform',
			items: [
				{ label: 'Events', href: '/events', icon: CalendarDays, badge: counts.pendingEvents },
				{ label: 'Organizers', href: '/organizers', icon: Building2 },
				{ label: 'Users', href: '/users', icon: Users }
			]
		},
		{
			label: 'Ticketing & Ops',
			items: [
				{ label: 'Tickets', href: '/tickets', icon: Ticket },
				{ label: 'Orders & Txns', href: '/orders', icon: Receipt },
				{ label: 'Check-in Ops', href: '/checkin', icon: ScanLine, live: true }
			]
		},
		{
			label: 'Finance',
			items: [
				{ label: 'Financial Analytics', href: '/settlements', icon: BarChart3 },
				{ label: 'Refunds', href: '/refunds', icon: RotateCcw, badge: counts.refunds }
			]
		},
		{
			label: 'Trust & System',
			items: [
				{ label: 'Moderation', href: '/moderation', icon: Flag, badge: counts.moderation },
				{ label: 'Audit Logs', href: '/audit', icon: ScrollText },
				{ label: 'Roles & Admins', href: '/staff', icon: ShieldCheck },
				{ label: 'Settings', href: '/settings', icon: Settings }
			]
		}
	]);

	function isActive(href: string): boolean {
		if (href === '/search') return false;
		if (href === '/dashboard') return page.url.pathname === '/' || page.url.pathname === '/dashboard';
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}

	function activate(href: string) {
		shell.closeNav();
		if (href === '/search') {
			shell.openPalette();
			return false;
		}
		return true;
	}
</script>

{#if shell.mobileNav}
	<button
		type="button"
		class="fixed inset-0 z-40 bg-black/70 backdrop-blur-[2px] lg:hidden"
		aria-label="Close navigation"
		onclick={() => shell.closeNav()}
	></button>
{/if}

<aside
	class="fixed inset-y-0 left-0 z-50 flex w-[252px] flex-col border-r border-[#24242b] bg-[#121216] transition-transform duration-200 lg:translate-x-0"
	class:-translate-x-full={!shell.mobileNav}
	aria-label="Admin navigation"
>
	<div class="flex h-[57px] shrink-0 items-center justify-between border-b border-[#232329] px-4">
		<Logo />
		<button
			type="button"
			class="row-action lg:hidden"
			aria-label="Close navigation"
			onclick={() => shell.closeNav()}
		>
			<span class="text-[15px] leading-none">×</span>
		</button>
	</div>

	<div class="px-3 pt-3">
		<div class="flex items-center gap-2 rounded-lg border border-[#26262e] bg-[#17171d] px-2.5 py-2">
			<span class="status-dot"></span>
			<span class="font-code text-[9px] uppercase tracking-[0.12em] text-[#9a9aa6]">Prod-cluster</span>
			<span class="ml-auto font-code text-[9px] text-[#6ee7a0]">99.98% SLA</span>
		</div>
	</div>

	<nav class="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
		{#each groups as group}
			<div class="mb-4">
				<p class="mono-label mb-1.5 px-2 !text-[8.5px] !tracking-[0.16em]">{group.label}</p>
				<ul class="space-y-0.5">
					{#each group.items as item}
						{@const Icon = item.icon}
						<li>
							{#if item.href === '/search'}
								<button type="button" class="nav-item w-full" onclick={() => activate(item.href)}>
									<Icon size={14} strokeWidth={1.8} class="shrink-0" />
									<span>{item.label}</span>
									<span class="nav-count"><span class="kbd">⌘K</span></span>
								</button>
							{:else}
								<a
									href={item.href}
									class="nav-item"
									data-active={isActive(item.href)}
									onclick={() => activate(item.href)}
								>
									<Icon size={14} strokeWidth={1.8} class="shrink-0" />
									<span>{item.label}</span>
									{#if item.live}
										<span class="ml-auto status-dot !h-1 !w-1"></span>
									{:else if item.badge}
										<span class="nav-count">{item.badge}</span>
									{/if}
								</a>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</nav>

	<div class="shrink-0 border-t border-[#232329] p-3">
		<div class="flex items-center gap-2.5 rounded-lg bg-[#19191f] p-2">
			<Avatar name={admin.name} size="sm" />
			<div class="min-w-0 flex-1">
				<p class="truncate text-[11.5px] font-medium text-[#ececf1]">{admin.name}</p>
				<p class="truncate font-code text-[9px] text-[#777783]">{admin.email}</p>
			</div>
			<form method="POST" action="/logout">
				<button
					type="submit"
					class="row-action !h-7 !w-7"
					aria-label="Sign out of the admin workspace"
					title="Sign out"
				>
					<LogOut size={13} />
				</button>
			</form>
		</div>
		<div class="mt-2 flex items-center justify-between px-1 font-code text-[8px] uppercase tracking-[0.12em] text-[#54545f]">
			<span>{admin.demo ? 'Demo cluster' : 'Secure cluster'}</span>
			<a href={publicAppUrl} target="_blank" rel="noreferrer" class="flex items-center gap-1 hover:text-[#c6bcff]" title="Open the public Owltside app">
				Public site <ArrowUpRight size={9} />
			</a>
		</div>
	</div>
</aside>
