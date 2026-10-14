<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		BadgeCheck,
		Bell,
		CheckCheck,
		Coins,
		Megaphone,
		LogOut,
		Mail,
		RefreshCw,
		Search,
		ShieldCheck,
		ArrowLeftRight,
		Ticket,
		User,
		UserRound,
		WifiOff
	} from '@lucide/svelte';
	import TopBar from '$components/TopBar.svelte';
	import SettingsDetails from '$components/SettingsDetails.svelte';
	import Avatar from '$components/Avatar.svelte';
	import CurrencyPill from '$components/CurrencyPill.svelte';
	import { page } from '$app/state';
	import { toast } from '$lib/state/toast.svelte';
	import { appSettings } from '$lib/state/settings.svelte';

	let { data } = $props();
	const session = $derived(page.data.session);

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	let role = $state<'attendee' | 'guest' | 'organizer'>('attendee');

	const roles = [
		{ id: 'attendee', label: 'Attendee', icon: Ticket, sub: 'Wallet, drops & gate passes' },
		{ id: 'guest', label: 'Guest', icon: UserRound, sub: 'Browse-only, no stored passes' },
		{ id: 'organizer', label: 'Organizer', icon: Megaphone, sub: 'Console, gates & settlement' }
	] as const;

	const securityRows: Array<[string, string]> = [
		['Cipher_Suite', 'RSA-4096 / TLS 1.3'],
		['Token_Rotation', '45s HMAC window'],
		['Client_Build', 'PWA v2.4.1']
	];
	const sessionNodes: Array<[string, string, string]> = [
		['Lagos Edge 0x7E3', 'Primary • this device', '12ms'],
		['Backup Vault NG-01', 'Encrypted mirror', '24ms']
	];
</script>

<svelte:head><title>Settings • Owltside</title></svelte:head>

<!-- ── desktop (md+) settings & identity console in the shipped console design
     language (design source unavailable this turn — extrapolated); mobile
     settings below unchanged ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">
	<header class="sticky top-0 z-50 border-b border-surface-glass-border bg-surface-base/85 backdrop-blur-xl">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 h-16 flex items-center gap-5">
			<a href="/home" class="flex items-center gap-2.5 shrink-0">
				<span class="w-2 h-2 rounded-full bg-primary glow-primary"></span>
				<span class="font-display font-bold tracking-tight text-on-surface text-[17px]">OWLTSIDE</span>
				<span class="{MONO} text-tertiary border border-tertiary/25 bg-tertiary/10 rounded px-1.5 py-0.5">Secure_Node</span>
			</a>
			<nav class="flex items-center gap-1" aria-label="Primary">
				{#each [
					['/home', 'Home'],
					['/explore', 'Explore'],
					['/tickets', 'Tickets'],
					['/organizer', 'Organizer']
				] as [href, label]}
					<a
						{href}
						class="px-3 h-9 rounded-lg flex items-center text-body-sm text-on-surface-variant hover:text-on-surface transition-colors"
					>
						{label}
					</a>
				{/each}
			</nav>
			<div class="flex-1"></div>
			<span class="relative hidden lg:flex items-center w-72 h-10">
				<Search class="absolute left-3.5 w-4 h-4 text-outline-variant pointer-events-none" />
				<span class="w-full h-full rounded-full bg-surface-container-low border border-surface-glass-border pl-10 pr-12 flex items-center text-body-md text-outline-variant">Search events, gates, artists…</span>
				<kbd class="{MONO} absolute right-3 text-on-surface-variant border border-surface-glass-border rounded px-1.5 py-0.5">⌘K</kbd>
			</span>
			<a href="/notifications" aria-label="Notifications" class="relative w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors shrink-0">
				<Bell class="w-4.5 h-4.5" />
				<span class="absolute top-2 right-2 w-2 h-2 rounded-full bg-secondary ring-2 ring-surface-base"></span>
			</a>
			<div class="hidden xl:flex flex-col items-end leading-tight shrink-0">
				<span class="font-code text-label-badge text-on-surface">0x7E3…A14</span>
				<span class="font-code text-[10px] tracking-[0.14em] text-accent-emerald">GATE_PASS_ACTIVE</span>
			</div>
			<a href="/profile" aria-label="Your profile" class="shrink-0">
				<Avatar name={session?.name ?? 'Guest'} size="sm" />
			</a>
		</div>
	</header>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-10 pb-2 flex flex-wrap items-end justify-between gap-4">
		<div class="min-w-0">
			<span class="flex items-center gap-2 {MONO} text-on-surface-variant">
				<span>Config_Suite</span>
				<span class="text-outline-variant">/</span>
				<span>Terminal_Local</span>
			</span>
			<h1 class="font-display text-[30px] leading-9 font-bold tracking-tight text-on-surface mt-3">Settings & Identity Controls</h1>
			<p class="text-body-md text-on-surface-variant mt-2">Operating identity, alert pipelines, on-device pass cache and security posture for this access node.</p>
		</div>
		<div class="flex items-center gap-3">
			<span class="h-10 px-3.5 rounded-lg flex items-center gap-2 {MONO} text-on-surface-variant border border-surface-glass-border">
				<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span> Local Node Synced
			</span>
			<button
				class="h-10 px-4 rounded-lg flex items-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors"
				onclick={() => toast('Preferences synced to mesh node 0x7E3', 'success')}
			>
				<RefreshCw class="w-4 h-4 text-primary" /><span>Sync Preferences</span>
			</button>
		</div>
	</div>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-8">
		<div class="rounded-xl border border-surface-glass-border bg-surface-container p-5 flex flex-wrap items-center gap-x-5 gap-y-4 justify-between">
			<span class="flex items-center gap-4 min-w-0">
				<span class="relative shrink-0">
					<Avatar name={session?.name ?? 'Guest Explorer'} size="md" />
					{#if session}
						<span class="absolute -bottom-1 -right-1 bg-accent-emerald text-surface w-5 h-5 rounded-full flex items-center justify-center shadow">
							<BadgeCheck class="w-3.5 h-3.5" />
						</span>
					{/if}
				</span>
				<span class="min-w-0">
					<span class="flex items-center gap-2 flex-wrap">
						<span class="font-display text-headline-md text-on-surface truncate">{session?.name ?? 'Guest Explorer'}</span>
						<span class="{MONO} px-2 py-0.5 rounded bg-primary/15 border border-primary/25 text-primary">ID #8921</span>
					</span>
					<span class="block text-body-sm text-on-surface-variant mt-0.5 truncate">{session?.email ?? 'browsing as guest'}</span>
				</span>
			</span>
			<span class="h-9 px-3.5 rounded-lg flex items-center gap-2 {MONO} text-on-surface-variant border border-surface-glass-border">
				<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span> Gate Biometrics Active
			</span>
		</div>
	</div>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 grid lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)] gap-6 items-start">
		<div class="flex flex-col gap-6 min-w-0">
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Operating Identity</h2>
					<span class="{MONO} px-2 py-0.5 rounded bg-primary text-on-primary">{role}</span>
				</div>
				<p class="text-body-sm text-on-surface-variant mt-1">Switch views to toggle permissions & venue tools</p>
				<div class="flex flex-col gap-2.5 mt-4">
					{#each roles as r (r.id)}
						{@const RIcon = r.icon}
						<button
							class="flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors {role === r.id ? 'border-primary/50 bg-primary/10' : 'border-surface-glass-border bg-surface-container-high/50 hover:bg-surface-container-high'}"
							onclick={() => {
								if (r.id === 'organizer') {
									location.href = '/organizer';
									return;
								}
								role = r.id;
							}}
						>
							<span class="w-9 h-9 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0">
								<RIcon class="w-4 h-4 text-on-surface-variant" />
							</span>
							<span class="flex-1 min-w-0">
								<span class="block text-body-sm font-medium text-on-surface">{r.label}</span>
								<span class="block text-xs text-on-surface-variant mt-0.5">{r.sub}</span>
							</span>
							{#if role === r.id}
								<span class="w-1.5 h-1.5 rounded-full bg-primary glow-primary shrink-0"></span>
							{/if}
						</button>
					{/each}
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between">
					<h2 class="font-display text-headline-md text-on-surface">Security & About</h2>
					<ShieldCheck class="w-4 h-4 text-on-surface-variant" />
				</div>
				<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 p-4 mt-4">
					<span class="w-10 h-10 rounded-full bg-accent-emerald/10 text-accent-emerald flex items-center justify-center shrink-0">
						<ShieldCheck class="w-5 h-5" />
					</span>
					<span class="min-w-0">
						<span class="block {MONO} text-on-surface">End-to-End Dynamic Protection</span>
						<span class="block text-body-sm text-on-surface-variant mt-0.5">256-bit TLS • rotating HMAC gate tokens • PWA v1.0</span>
					</span>
				</div>
				<div class="flex flex-col gap-2 mt-4">
					{#each securityRows as [label, value]}
						<div class="flex items-center justify-between gap-3 text-body-sm">
							<span class="{MONO} text-on-surface-variant">{label}</span>
							<span class="{MONO} text-on-surface">{value}</span>
						</div>
					{/each}
				</div>
				<div class="flex items-center justify-between gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high px-4 py-3 mt-4">
					<span class="flex items-center gap-2 min-w-0 {MONO} text-on-surface-variant">
						<ShieldCheck class="w-4 h-4 text-accent-emerald shrink-0" />
						Secure_Channel: RSA-4096 / TLS 1.3
					</span>
					<span class="{MONO} text-outline-variant shrink-0">v2.4.1</span>
				</div>
			</section>
		</div>

		<div class="flex flex-col gap-6 min-w-0">
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Preferences</h2>
					<span class="{MONO} text-on-surface-variant">Terminal_Local</span>
				</div>
				<div class="flex flex-col gap-2.5 mt-4">
					<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3">
						<span class="w-9 h-9 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0">
							<Coins class="w-4 h-4 text-on-surface-variant" />
						</span>
						<span class="flex-1 min-w-0">
							<span class="block text-body-sm font-medium text-on-surface">Display currency</span>
							<span class="block text-xs text-on-surface-variant mt-0.5">Prices convert at render time</span>
						</span>
						<CurrencyPill />
					</div>
					<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3">
						<span class="w-9 h-9 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0">
							<Bell class="w-4 h-4 text-on-surface-variant" />
						</span>
						<span class="flex-1 min-w-0">
							<span class="block text-body-sm font-medium text-on-surface">Push notifications</span>
							<span class="block text-xs text-on-surface-variant mt-0.5">Drops, gate updates & replies</span>
						</span>
						<button
							role="switch"
							aria-checked={appSettings.value.notifications.pushEnabled}
							aria-label="Push notifications"
							class="w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors {appSettings.value.notifications.pushEnabled ? 'bg-primary-container border-primary/50 text-on-primary-container' : 'bg-surface-bright border-surface-glass-border text-transparent'}"
							onclick={() => (appSettings.value.notifications.pushEnabled = !appSettings.value.notifications.pushEnabled)}
						>
							<CheckCheck class="w-3 h-3" />
						</button>
					</div>
					<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3">
						<span class="w-9 h-9 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0">
							<WifiOff class="w-4 h-4 text-accent-emerald" />
						</span>
						<span class="flex-1 min-w-0">
							<span class="block text-body-sm font-medium text-on-surface">Offline wallet cache</span>
							<span class="block text-xs text-on-surface-variant mt-0.5">Keep HMAC passes on-device</span>
						</span>
						<button
							role="switch"
							aria-checked={appSettings.value.storage.offlineMode}
							aria-label="Offline wallet cache"
							class="w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors {appSettings.value.storage.offlineMode ? 'bg-primary-container border-primary/50 text-on-primary-container' : 'bg-surface-bright border-surface-glass-border text-transparent'}"
							onclick={() => (appSettings.value.storage.offlineMode = !appSettings.value.storage.offlineMode)}
						>
							<CheckCheck class="w-3 h-3" />
						</button>
					</div>
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Account</h2>
					<span class="{MONO} px-2 py-0.5 rounded bg-surface-container-high border border-surface-glass-border text-on-surface-variant">{session ? 'Session Active' : 'Guest Mode'}</span>
				</div>
				<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3 mt-4">
					<span class="w-9 h-9 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0">
						<Mail class="w-4 h-4 text-on-surface-variant" />
					</span>
					<span class="flex-1 min-w-0">
						<span class="block text-body-sm font-medium text-on-surface truncate">{session?.email ?? 'No email (guest)'}</span>
						<span class="block text-xs text-on-surface-variant mt-0.5">Passwordless sign-in</span>
					</span>
					<span class="{MONO} px-2 py-0.5 rounded text-accent-emerald bg-accent-emerald/10 border border-accent-emerald/20 shrink-0">Verified</span>
				</div>
				{#if session}
					<form method="POST" action="?/signout" use:enhance class="mt-3">
						<button class="w-full h-10 rounded-lg bg-error/10 border border-error/30 text-error text-body-sm font-semibold flex items-center justify-center gap-2 hover:bg-error/15 transition-colors">
							<LogOut class="w-4 h-4" /><span>Sign out of this node</span>
						</button>
					</form>
				{:else}
					<a href="/auth/login" class="w-full h-10 mt-3 rounded-lg bg-on-surface text-surface-base text-body-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
						Sign in
					</a>
				{/if}
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Active Session Nodes</h2>
					<span class="{MONO} text-on-surface-variant">Mesh_Registry</span>
				</div>
				<div class="flex flex-col gap-2.5 mt-4">
					{#each sessionNodes as [name, sub, ms], i}
						<div class="flex items-center justify-between gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
							<span class="flex items-center gap-2.5 min-w-0">
								<span class="w-1.5 h-1.5 rounded-full shrink-0 {i === 0 ? 'bg-primary glow-primary' : 'bg-accent-emerald'}"></span>
								<span class="min-w-0">
									<span class="block text-body-sm font-medium text-on-surface truncate">{name}</span>
									<span class="block text-xs text-on-surface-variant truncate">{sub}</span>
								</span>
							</span>
							<span class="{MONO} text-on-surface-variant shrink-0">{ms}</span>
						</div>
					{/each}
				</div>
			</section>
		</div>
	</div>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pb-10">
		<SettingsDetails />
	</div>

	<footer class="mt-4 border-t border-surface-glass-border">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-col lg:flex-row items-center justify-between gap-3">
			<span class="flex items-center gap-3">
				<span class="font-display font-bold text-on-surface tracking-tight">OWLTSIDE</span>
				<span class="w-px h-4 bg-outline-variant/40"></span>
				<span class="{MONO} text-on-surface-variant">Event Ticketing Architecture</span>
			</span>
			<span class="flex items-center gap-5">
				<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
					System Status: 99.98% Optimal
				</span>
				<span class="{MONO} text-on-surface-variant">© {new Date().getFullYear()} Owltside Protocol</span>
			</span>
		</div>
	</footer>
</div>

<div class="md:hidden">
	<TopBar back title="Settings" subtitle="Identity, preferences & security">
		{#snippet right()}
			<button aria-label="Sync preferences" onclick={() => toast('Preferences synced to mesh node 0x7E3', 'success')} class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container">
				<RefreshCw class="w-4.5 h-4.5" />
			</button>
		{/snippet}
	</TopBar>

	<main class="flex-1 flex flex-col relative w-full pt-mobile-header pb-28 md:pb-16 bg-surface min-h-dvh">
		<div class="flex flex-col w-full md:max-w-2xl md:mx-auto pb-10">
			<!-- snapshot -->
			<section class="px-margin pt-space-sm pb-space-md">
				<div class="bg-surface-container rounded-xl p-space-md shadow-lg relative overflow-hidden">
					<div class="absolute -right-8 -top-8 w-32 h-32 bg-primary-container/20 rounded-full blur-2xl pointer-events-none"></div>
					<div class="flex items-center gap-space-md relative z-10">
						<div class="relative">
							<Avatar name={session?.name ?? 'Guest Explorer'} size="lg" />
							{#if session}
								<span class="absolute -bottom-1 -right-1 bg-accent-emerald text-surface text-label-badge w-5 h-5 rounded-full flex items-center justify-center shadow">
									<BadgeCheck class="w-3.5 h-3.5" />
								</span>
							{/if}
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-space-xs">
								<span class="font-display text-headline-md text-on-surface truncate">{session?.name ?? 'Guest Explorer'}</span>
								<span class="bg-primary/20 text-primary text-label-badge px-2 py-0.5 rounded-full">ID #8921</span>
							</div>
							<p class="text-body-sm text-on-surface-variant truncate">{session?.email ?? 'browsing as guest'}</p>
							<div class="flex items-center gap-1.5 mt-1">
								<span class="w-2 h-2 rounded-full bg-accent-emerald"></span>
								<span class="text-label-badge text-accent-emerald uppercase tracking-wider">Gate Biometrics Active</span>
							</div>
						</div>
					</div>
				</div>
			</section>

			<!-- role switcher -->
			<section class="px-margin mb-space-lg">
				<div class="flex items-center justify-between mb-space-xs">
					<div>
						<h2 class="font-display text-headline-md text-on-surface flex items-center gap-1.5">
							<ArrowLeftRight class="w-5 h-5 text-primary" /> Operating Identity
						</h2>
						<p class="text-body-sm text-on-surface-variant">Switch views to toggle permissions & venue tools</p>
					</div>
					<span class="text-label-badge bg-primary text-on-primary px-2.5 py-1 rounded-full shadow-sm uppercase">{role}</span>
				</div>
				<div class="flex gap-2 overflow-x-auto py-2 -mx-margin px-margin scrollbar-none">
					{#each roles as r (r.id)}
						{@const RIcon = r.icon}
						<button
							class="flex-shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-full transition-all duration-200 {role === r.id ? 'bg-primary text-on-primary shadow-md' : 'bg-surface-container text-on-surface-variant hover:text-on-surface'}"
							onclick={() => {
								if (r.id === 'organizer') {
									location.href = '/organizer';
									return;
								}
								role = r.id;
							}}
						>
							<RIcon class="w-4.5 h-4.5" />
							<span class="text-body-sm font-semibold">{r.label}</span>
						</button>
					{/each}
				</div>
			</section>

			<!-- preferences -->
			<section class="px-margin mb-space-lg flex flex-col gap-space-xs">
				<h2 class="font-display text-headline-md text-on-surface flex items-center gap-1.5">
					<Bell class="w-5 h-5 text-primary" /> Preferences
				</h2>
				<div class="flex items-center justify-between bg-surface-container rounded-xl p-4">
					<div>
						<p class="text-body-md text-on-surface font-medium">Display currency</p>
						<p class="text-body-sm text-on-surface-variant">Prices convert at render time</p>
					</div>
					<CurrencyPill />
				</div>
				<label class="flex items-center justify-between bg-surface-container rounded-xl p-4 cursor-pointer">
					<div>
						<p class="text-body-md text-on-surface font-medium">Push notifications</p>
						<p class="text-body-sm text-on-surface-variant">Drops, gate updates & replies</p>
					</div>
					<input type="checkbox" checked={appSettings.value.notifications.pushEnabled} onchange={() => (appSettings.value.notifications.pushEnabled = !appSettings.value.notifications.pushEnabled)} class="w-5 h-5 accent-[#c0c1ff]" />
				</label>
				<label class="flex items-center justify-between bg-surface-container rounded-xl p-4 cursor-pointer">
					<div>
						<p class="text-body-md text-on-surface font-medium flex items-center gap-1.5"><WifiOff class="w-4 h-4 text-accent-emerald" /> Offline wallet cache</p>
						<p class="text-body-sm text-on-surface-variant">Keep HMAC passes on-device</p>
					</div>
					<input type="checkbox" checked={appSettings.value.storage.offlineMode} onchange={() => (appSettings.value.storage.offlineMode = !appSettings.value.storage.offlineMode)} class="w-5 h-5 accent-[#c0c1ff]" />
				</label>
			</section>

			<!-- account -->
			<section class="px-margin mb-space-lg flex flex-col gap-space-xs">
				<h2 class="font-display text-headline-md text-on-surface flex items-center gap-1.5">
					<User class="w-5 h-5 text-primary" /> Account
				</h2>
				<div class="flex items-center justify-between bg-surface-container rounded-xl p-4">
					<div class="flex items-center gap-2 min-w-0">
						<Mail class="w-4.5 h-4.5 text-on-surface-variant" />
						<div class="min-w-0">
							<p class="text-body-md text-on-surface font-medium truncate">{session?.email ?? 'No email (guest)'}</p>
							<p class="text-body-sm text-on-surface-variant">Passwordless sign-in</p>
						</div>
					</div>
					<span class="text-label-badge text-accent-emerald bg-accent-emerald/10 border border-accent-emerald/20 px-2 py-0.5 rounded-full">Verified</span>
				</div>
				{#if session}
					<form method="POST" action="?/signout" use:enhance>
						<button class="w-full h-12 rounded-xl bg-error-container/40 border border-error-container text-error font-semibold text-body-md flex items-center justify-center gap-2 active:scale-[0.98]">
							<LogOut class="w-4.5 h-4.5" /> Sign out
						</button>
					</form>
				{:else}
					<a href="/auth/login" class="w-full h-12 rounded-xl bg-primary text-on-primary font-semibold text-body-md flex items-center justify-center gap-2 active:scale-[0.98] glow-primary">
						Sign in
					</a>
				{/if}
			</section>

			<!-- active desktop session-node registry parity -->
			<section class="px-margin mb-space-lg flex flex-col gap-space-xs">
				<div class="flex items-center justify-between gap-2"><h2 class="font-display text-headline-md text-on-surface">Active Session Nodes</h2><span class="{MONO} text-on-surface-variant">Mesh Registry</span></div>
				<div class="flex flex-col gap-2">
					{#each sessionNodes as [name, sub, ms], i}
						<div class="flex items-center justify-between gap-3 rounded-xl border border-surface-glass-border bg-surface-container px-4 py-3">
							<span class="flex items-center gap-2.5 min-w-0"><span class="w-2 h-2 rounded-full shrink-0 {i === 0 ? 'bg-primary glow-primary' : 'bg-accent-emerald'}"></span><span class="min-w-0"><span class="block text-body-sm font-medium text-on-surface truncate">{name}</span><span class="block text-label-badge text-on-surface-variant truncate">{sub}</span></span></span>
							<span class="{MONO} text-on-surface-variant shrink-0">{ms}</span>
						</div>
					{/each}
				</div>
			</section>

			<!-- security -->
			<section class="px-margin flex flex-col gap-space-xs">
				<h2 class="font-display text-headline-md text-on-surface flex items-center gap-1.5">
					<ShieldCheck class="w-5 h-5 text-primary" /> Security & About
				</h2>
				<div class="bg-surface-container-low rounded-xl p-4 flex items-center gap-3">
					<span class="w-10 h-10 rounded-full bg-accent-emerald/10 text-accent-emerald flex items-center justify-center flex-shrink-0">
						<ShieldCheck class="w-5 h-5" />
					</span>
					<div>
						<p class="text-label-badge text-on-surface font-semibold">End-to-End Dynamic Protection</p>
						<p class="text-body-sm text-on-surface-variant">256-bit TLS • rotating HMAC gate tokens • PWA v1.0</p>
					</div>
				</div>
				<div class="flex flex-col gap-2 rounded-xl border border-surface-glass-border bg-surface-container p-4">
					{#each securityRows as [label, value]}
						<div class="flex items-center justify-between gap-3 text-body-sm"><span class="{MONO} text-on-surface-variant">{label}</span><span class="{MONO} text-on-surface">{value}</span></div>
					{/each}
				</div>
				<div class="flex items-center justify-between gap-3 rounded-xl border border-surface-glass-border bg-surface-container-high px-4 py-3">
					<span class="flex items-center gap-2 min-w-0 {MONO} text-on-surface-variant"><ShieldCheck class="w-4 h-4 text-accent-emerald shrink-0" />Secure channel: RSA-4096 / TLS 1.3</span>
					<span class="{MONO} text-outline-variant shrink-0">v2.4.1</span>
				</div>
			</section>
		</div>
		<div class="px-margin pb-10">
			<SettingsDetails />
		</div>
	</main>
</div>
