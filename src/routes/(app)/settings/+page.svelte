<script lang="ts">
	import { busyEnhance as enhance } from '$lib/utils/enhance';
	import {
		Accessibility,
		BadgeCheck,
		Bell,
		CheckCheck,
		ChevronRight,
		Coins,
		CreditCard,
		Database,
		HelpCircle,
		LockKeyhole,
		LogOut,
		Mail,
		Megaphone,
		RefreshCw,
		Search,
		ShieldCheck,
		ArrowLeftRight,
		Smartphone,
		Ticket,
		User,
		UserRound,
		Wallet,
		WifiOff
	} from '@lucide/svelte';
	import TopBar from '$components/TopBar.svelte';
	import SettingsDetails from '$components/SettingsDetails.svelte';
	import Avatar from '$components/Avatar.svelte';
	import CurrencyPill from '$components/CurrencyPill.svelte';
	import Sheet from '$components/Sheet.svelte';
	import RoleSwitcher from '$components/RoleSwitcher.svelte';
	import { page } from '$app/state';
	import { toast } from '$lib/state/toast.svelte';
	import { appSettings } from '$lib/state/settings.svelte';

	let { data } = $props();
	const session = $derived(page.data.session);
	const isFullyVerified = $derived(!!session && Object.values(appSettings.value.verification).every(Boolean));

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	const role = $derived(data.operatingIdentity ?? 'attendee');

	const securityRows: Array<[string, string]> = [
		['Cipher_Suite', 'RSA-4096 / TLS 1.3'],
		['Token_Rotation', '45s HMAC window'],
		['Client_Build', 'PWA v2.4.1']
	];
	const sessionNodes: Array<[string, string, string]> = [
		['Lagos Edge 0x7E3', 'Primary • this device', '12ms'],
		['Backup Vault NG-01', 'Encrypted mirror', '24ms']
	];

	let openCategory = $state<string | null>(null);
</script>

<svelte:head><title>Settings • Owltside</title></svelte:head>

<!-- ── desktop (md+) settings & identity console in the shipped console design
     language (design source unavailable this turn — extrapolated); mobile
     settings below unchanged ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">


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
					<Avatar name={session?.name ?? 'Guest Explorer'} src={session?.avatarUrl} size="md" />
				</span>
				<span class="min-w-0">
					<span class="flex items-center gap-2 flex-wrap">
						<span class="font-display text-headline-md text-on-surface truncate">{session?.name ?? 'Guest Explorer'}</span>
						{#if isFullyVerified}<BadgeCheck class="w-4 h-4 text-tertiary shrink-0" aria-label="Verified member" />{/if}
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

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6">
		<div class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden divide-y divide-surface-glass-border">
			<button type="button" onclick={() => (openCategory = 'identity')} class="w-full flex items-center gap-4 p-5 hover:bg-surface-container-high/50 transition-colors text-left">
				<span class="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><ArrowLeftRight class="w-5 h-5 text-primary" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-md font-semibold text-on-surface">Operating Identity</span><span class="block text-body-sm text-on-surface-variant truncate">Current: {role} • Switch views & venue tools</span></span>
				<ChevronRight class="w-5 h-5 text-on-surface-variant shrink-0" />
			</button>
			<button type="button" onclick={() => (openCategory = 'preferences')} class="w-full flex items-center gap-4 p-5 hover:bg-surface-container-high/50 transition-colors text-left">
				<span class="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><Bell class="w-5 h-5 text-primary" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-md font-semibold text-on-surface">Preferences</span><span class="block text-body-sm text-on-surface-variant truncate">Currency • Push notifications • Offline cache</span></span>
				<ChevronRight class="w-5 h-5 text-on-surface-variant shrink-0" />
			</button>
			<button type="button" onclick={() => (openCategory = 'account')} class="w-full flex items-center gap-4 p-5 hover:bg-surface-container-high/50 transition-colors text-left">
				<span class="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><User class="w-5 h-5 text-primary" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-md font-semibold text-on-surface">Account</span><span class="block text-body-sm text-on-surface-variant truncate">{session?.email ?? 'Guest'} • {session ? 'Session active' : 'Guest mode'}</span></span>
				<ChevronRight class="w-5 h-5 text-on-surface-variant shrink-0" />
			</button>
			<button type="button" onclick={() => (openCategory = 'sessions')} class="w-full flex items-center gap-4 p-5 hover:bg-surface-container-high/50 transition-colors text-left">
				<span class="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><Smartphone class="w-5 h-5 text-primary" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-md font-semibold text-on-surface">Active Session Nodes</span><span class="block text-body-sm text-on-surface-variant truncate">{sessionNodes.length} nodes • Mesh registry</span></span>
				<ChevronRight class="w-5 h-5 text-on-surface-variant shrink-0" />
			</button>
			<button type="button" onclick={() => (openCategory = 'securityAbout')} class="w-full flex items-center gap-4 p-5 hover:bg-surface-container-high/50 transition-colors text-left">
				<span class="w-10 h-10 rounded-xl bg-accent-emerald/10 text-accent-emerald flex items-center justify-center shrink-0"><ShieldCheck class="w-5 h-5" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-md font-semibold text-on-surface">Security & About</span><span class="block text-body-sm text-on-surface-variant truncate">End-to-end protection • TLS 1.3 • v2.4.1</span></span>
				<ChevronRight class="w-5 h-5 text-on-surface-variant shrink-0" />
			</button>
			<button type="button" onclick={() => (openCategory = 'verification')} class="w-full flex items-center gap-4 p-5 hover:bg-surface-container-high/50 transition-colors text-left">
				<span class="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><ShieldCheck class="w-5 h-5 text-primary" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-md font-semibold text-on-surface">Verification</span><span class="block text-body-sm text-on-surface-variant truncate">Email • Phone • Identity • Payout • Age</span></span>
				<ChevronRight class="w-5 h-5 text-on-surface-variant shrink-0" />
			</button>
			<button type="button" onclick={() => (openCategory = 'notifications')} class="w-full flex items-center gap-4 p-5 hover:bg-surface-container-high/50 transition-colors text-left">
				<span class="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><Bell class="w-5 h-5 text-primary" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-md font-semibold text-on-surface">Notifications</span><span class="block text-body-sm text-on-surface-variant truncate">Channels • Delivery • Quiet hours</span></span>
				<ChevronRight class="w-5 h-5 text-on-surface-variant shrink-0" />
			</button>
			<button type="button" onclick={() => (openCategory = 'privacy')} class="w-full flex items-center gap-4 p-5 hover:bg-surface-container-high/50 transition-colors text-left">
				<span class="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><UserRound class="w-5 h-5 text-primary" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-md font-semibold text-on-surface">Privacy</span><span class="block text-body-sm text-on-surface-variant truncate">Profile visibility & data use</span></span>
				<ChevronRight class="w-5 h-5 text-on-surface-variant shrink-0" />
			</button>
			<button type="button" onclick={() => (openCategory = 'securitySessions')} class="w-full flex items-center gap-4 p-5 hover:bg-surface-container-high/50 transition-colors text-left">
				<span class="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><LockKeyhole class="w-5 h-5 text-primary" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-md font-semibold text-on-surface">Security & Sessions</span><span class="block text-body-sm text-on-surface-variant truncate">Biometrics • 2FA • Active sessions</span></span>
				<ChevronRight class="w-5 h-5 text-on-surface-variant shrink-0" />
			</button>
			<button type="button" onclick={() => (openCategory = 'payments')} class="w-full flex items-center gap-4 p-5 hover:bg-surface-container-high/50 transition-colors text-left">
				<span class="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><CreditCard class="w-5 h-5 text-primary" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-md font-semibold text-on-surface">Saved Payment Methods</span><span class="block text-body-sm text-on-surface-variant truncate">Cards on this device • Default & removal</span></span>
				<ChevronRight class="w-5 h-5 text-on-surface-variant shrink-0" />
			</button>
			<button type="button" onclick={() => (openCategory = 'accessibility')} class="w-full flex items-center gap-4 p-5 hover:bg-surface-container-high/50 transition-colors text-left">
				<span class="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><Accessibility class="w-5 h-5 text-primary" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-md font-semibold text-on-surface">Accessibility</span><span class="block text-body-sm text-on-surface-variant truncate">Appearance • Motion • Reading comfort • Page size</span></span>
				<ChevronRight class="w-5 h-5 text-on-surface-variant shrink-0" />
			</button>
			<button type="button" onclick={() => (openCategory = 'offline')} class="w-full flex items-center gap-4 p-5 hover:bg-surface-container-high/50 transition-colors text-left">
				<span class="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><Database class="w-5 h-5 text-primary" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-md font-semibold text-on-surface">Offline & Storage</span><span class="block text-body-sm text-on-surface-variant truncate">Offline mode • Auto-download • Wallet • Cache</span></span>
				<ChevronRight class="w-5 h-5 text-on-surface-variant shrink-0" />
			</button>
			<button type="button" onclick={() => (openCategory = 'help')} class="w-full flex items-center gap-4 p-5 hover:bg-surface-container-high/50 transition-colors text-left">
				<span class="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><HelpCircle class="w-5 h-5 text-primary" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-md font-semibold text-on-surface">Help & Legal</span><span class="block text-body-sm text-on-surface-variant truncate">Support • Terms • Privacy • Cookies • Licenses</span></span>
				<ChevronRight class="w-5 h-5 text-on-surface-variant shrink-0" />
			</button>
		</div>
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

	<main class="flex-1 flex flex-col relative w-full  pb-28 md:pb-16 bg-surface min-h-dvh">
		<div class="flex flex-col w-full md:max-w-2xl md:mx-auto pb-10">
			<!-- snapshot -->
			<section class="px-margin pt-space-sm pb-space-md">
				<div class="bg-surface-container rounded-xl p-space-md shadow-lg relative overflow-hidden">
					<div class="absolute -right-8 -top-8 w-32 h-32 bg-primary-container/20 rounded-full blur-2xl pointer-events-none"></div>
					<div class="flex items-center gap-space-md relative z-10">
						<div class="relative">
							<Avatar name={session?.name ?? 'Guest Explorer'} src={session?.avatarUrl} size="lg" />
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-space-xs">
								<span class="font-display text-headline-md text-on-surface truncate">{session?.name ?? 'Guest Explorer'}</span>
								{#if isFullyVerified}<BadgeCheck class="w-4 h-4 text-tertiary shrink-0" aria-label="Verified member" />{/if}
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

			<!-- settings categories as list (mobile) -->
			<section class="px-margin mb-space-lg">
				<div class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden divide-y divide-surface-glass-border">
					<button type="button" onclick={() => (openCategory = 'identity')} class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-high/50 transition-colors text-left">
						<span class="w-9 h-9 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><ArrowLeftRight class="w-5 h-5 text-primary" /></span>
						<span class="flex-1 min-w-0"><span class="block text-body-sm font-semibold text-on-surface">Operating Identity</span><span class="block text-xs text-on-surface-variant truncate">Current: {role}</span></span>
						<ChevronRight class="w-4 h-4 text-on-surface-variant shrink-0" />
					</button>
					<button type="button" onclick={() => (openCategory = 'preferences')} class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-high/50 transition-colors text-left">
						<span class="w-9 h-9 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><Bell class="w-5 h-5 text-primary" /></span>
						<span class="flex-1 min-w-0"><span class="block text-body-sm font-semibold text-on-surface">Preferences</span><span class="block text-xs text-on-surface-variant truncate">Currency • Push • Offline</span></span>
						<ChevronRight class="w-4 h-4 text-on-surface-variant shrink-0" />
					</button>
					<button type="button" onclick={() => (openCategory = 'account')} class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-high/50 transition-colors text-left">
						<span class="w-9 h-9 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><User class="w-5 h-5 text-primary" /></span>
						<span class="flex-1 min-w-0"><span class="block text-body-sm font-semibold text-on-surface">Account</span><span class="block text-xs text-on-surface-variant truncate">{session?.email ?? 'Guest'}</span></span>
						<ChevronRight class="w-4 h-4 text-on-surface-variant shrink-0" />
					</button>
					<button type="button" onclick={() => (openCategory = 'sessions')} class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-high/50 transition-colors text-left">
						<span class="w-9 h-9 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><Smartphone class="w-5 h-5 text-primary" /></span>
						<span class="flex-1 min-w-0"><span class="block text-body-sm font-semibold text-on-surface">Active Session Nodes</span><span class="block text-xs text-on-surface-variant truncate">{sessionNodes.length} nodes</span></span>
						<ChevronRight class="w-4 h-4 text-on-surface-variant shrink-0" />
					</button>
					<button type="button" onclick={() => (openCategory = 'securityAbout')} class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-high/50 transition-colors text-left">
						<span class="w-9 h-9 rounded-full bg-accent-emerald/10 text-accent-emerald flex items-center justify-center shrink-0"><ShieldCheck class="w-5 h-5" /></span>
						<span class="flex-1 min-w-0"><span class="block text-body-sm font-semibold text-on-surface">Security & About</span><span class="block text-xs text-on-surface-variant truncate">TLS 1.3 • v2.4.1</span></span>
						<ChevronRight class="w-4 h-4 text-on-surface-variant shrink-0" />
					</button>
					<button type="button" onclick={() => (openCategory = 'verification')} class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-high/50 transition-colors text-left">
						<span class="w-9 h-9 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><ShieldCheck class="w-5 h-5 text-primary" /></span>
						<span class="flex-1 min-w-0"><span class="block text-body-sm font-semibold text-on-surface">Verification</span><span class="block text-xs text-on-surface-variant truncate">Email • Phone • Identity</span></span>
						<ChevronRight class="w-4 h-4 text-on-surface-variant shrink-0" />
					</button>
					<button type="button" onclick={() => (openCategory = 'notifications')} class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-high/50 transition-colors text-left">
						<span class="w-9 h-9 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><Bell class="w-5 h-5 text-primary" /></span>
						<span class="flex-1 min-w-0"><span class="block text-body-sm font-semibold text-on-surface">Notifications</span><span class="block text-xs text-on-surface-variant truncate">Channels • Delivery</span></span>
						<ChevronRight class="w-4 h-4 text-on-surface-variant shrink-0" />
					</button>
					<button type="button" onclick={() => (openCategory = 'privacy')} class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-high/50 transition-colors text-left">
						<span class="w-9 h-9 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><UserRound class="w-5 h-5 text-primary" /></span>
						<span class="flex-1 min-w-0"><span class="block text-body-sm font-semibold text-on-surface">Privacy</span><span class="block text-xs text-on-surface-variant truncate">Profile visibility</span></span>
						<ChevronRight class="w-4 h-4 text-on-surface-variant shrink-0" />
					</button>
					<button type="button" onclick={() => (openCategory = 'securitySessions')} class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-high/50 transition-colors text-left">
						<span class="w-9 h-9 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><LockKeyhole class="w-5 h-5 text-primary" /></span>
						<span class="flex-1 min-w-0"><span class="block text-body-sm font-semibold text-on-surface">Security & Sessions</span><span class="block text-xs text-on-surface-variant truncate">Biometrics • 2FA</span></span>
						<ChevronRight class="w-4 h-4 text-on-surface-variant shrink-0" />
					</button>
					<button type="button" onclick={() => (openCategory = 'payments')} class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-high/50 transition-colors text-left">
						<span class="w-9 h-9 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><CreditCard class="w-5 h-5 text-primary" /></span>
						<span class="flex-1 min-w-0"><span class="block text-body-sm font-semibold text-on-surface">Saved Payment Methods</span><span class="block text-xs text-on-surface-variant truncate">Cards on this device</span></span>
						<ChevronRight class="w-4 h-4 text-on-surface-variant shrink-0" />
					</button>
					<button type="button" onclick={() => (openCategory = 'accessibility')} class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-high/50 transition-colors text-left">
						<span class="w-9 h-9 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><Accessibility class="w-5 h-5 text-primary" /></span>
						<span class="flex-1 min-w-0"><span class="block text-body-sm font-semibold text-on-surface">Accessibility</span><span class="block text-xs text-on-surface-variant truncate">Appearance • Motion</span></span>
						<ChevronRight class="w-4 h-4 text-on-surface-variant shrink-0" />
					</button>
					<button type="button" onclick={() => (openCategory = 'offline')} class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-high/50 transition-colors text-left">
						<span class="w-9 h-9 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><Database class="w-5 h-5 text-primary" /></span>
						<span class="flex-1 min-w-0"><span class="block text-body-sm font-semibold text-on-surface">Offline & Storage</span><span class="block text-xs text-on-surface-variant truncate">Offline mode • Cache</span></span>
						<ChevronRight class="w-4 h-4 text-on-surface-variant shrink-0" />
					</button>
					<button type="button" onclick={() => (openCategory = 'help')} class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-high/50 transition-colors text-left">
						<span class="w-9 h-9 rounded-xl bg-surface-container-highest flex items-center justify-center shrink-0"><HelpCircle class="w-5 h-5 text-primary" /></span>
						<span class="flex-1 min-w-0"><span class="block text-body-sm font-semibold text-on-surface">Help & Legal</span><span class="block text-xs text-on-surface-variant truncate">Support • Terms • Privacy</span></span>
						<ChevronRight class="w-4 h-4 text-on-surface-variant shrink-0" />
					</button>
				</div>
			</section>
		</div>
	</main>
</div>

	<!-- popups for desktop categories -->
	<Sheet open={openCategory === 'identity'} title="Operating Identity" close={() => (openCategory = null)}>
		<RoleSwitcher currentRole={role} signedIn={!!session} expanded />
	</Sheet>

	<Sheet open={openCategory === 'preferences'} title="Preferences" close={() => (openCategory = null)}>
		<div class="flex flex-col gap-3">
			<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3">
				<span class="w-9 h-9 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0"><Coins class="w-4 h-4 text-on-surface-variant" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-sm font-medium text-on-surface">Display currency</span><span class="block text-xs text-on-surface-variant mt-0.5">Prices convert at render time</span></span>
				<CurrencyPill />
			</div>
			<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3">
				<span class="w-9 h-9 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0"><Bell class="w-4 h-4 text-on-surface-variant" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-sm font-medium text-on-surface">Push notifications</span><span class="block text-xs text-on-surface-variant mt-0.5">Drops, gate updates & replies</span></span>
				<button role="switch" aria-checked={appSettings.value.notifications.pushEnabled} aria-label="Push notifications" class="w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors {appSettings.value.notifications.pushEnabled ? 'bg-primary-container border-primary/50 text-on-primary-container' : 'bg-surface-bright border-surface-glass-border text-transparent'}" onclick={() => (appSettings.value.notifications.pushEnabled = !appSettings.value.notifications.pushEnabled)}><CheckCheck class="w-3 h-3" /></button>
			</div>
			<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3">
				<span class="w-9 h-9 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0"><WifiOff class="w-4 h-4 text-accent-emerald" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-sm font-medium text-on-surface">Offline wallet cache</span><span class="block text-xs text-on-surface-variant mt-0.5">Keep HMAC passes on-device</span></span>
				<button role="switch" aria-checked={appSettings.value.storage.offlineMode} aria-label="Offline wallet cache" class="w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors {appSettings.value.storage.offlineMode ? 'bg-primary-container border-primary/50 text-on-primary-container' : 'bg-surface-bright border-surface-glass-border text-transparent'}" onclick={() => (appSettings.value.storage.offlineMode = !appSettings.value.storage.offlineMode)}><CheckCheck class="w-3 h-3" /></button>
			</div>
		</div>
	</Sheet>

	<Sheet open={openCategory === 'account'} title="Account" close={() => (openCategory = null)}>
		<div class="flex flex-col gap-3">
			<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3">
				<span class="w-9 h-9 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0"><Mail class="w-4 h-4 text-on-surface-variant" /></span>
				<span class="flex-1 min-w-0"><span class="block text-body-sm font-medium text-on-surface truncate">{session?.email ?? 'No email (guest)'}</span><span class="block text-xs text-on-surface-variant mt-0.5">Passwordless sign-in</span></span>
				<span class="{MONO} px-2 py-0.5 rounded text-accent-emerald bg-accent-emerald/10 border border-accent-emerald/20 shrink-0">Verified</span>
			</div>
			{#if session}
				<form method="POST" action="?/signout" use:enhance><button class="w-full h-10 rounded-lg bg-error/10 border border-error/30 text-error text-body-sm font-semibold flex items-center justify-center gap-2 hover:bg-error/15 transition-colors"><LogOut class="w-4 h-4" /><span>Sign out of this node</span></button></form>
			{:else}
				<a href="/auth/login" class="w-full h-10 rounded-lg bg-on-surface text-surface-base text-body-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">Sign in</a>
			{/if}
		</div>
	</Sheet>

	<Sheet open={openCategory === 'sessions'} title="Active Session Nodes" close={() => (openCategory = null)}>
		<div class="flex flex-col gap-2.5">
			{#each sessionNodes as [name, sub, ms], i}
				<div class="flex items-center justify-between gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
					<span class="flex items-center gap-2.5 min-w-0"><span class="w-1.5 h-1.5 rounded-full shrink-0 {i === 0 ? 'bg-primary glow-primary' : 'bg-accent-emerald'}"></span><span class="min-w-0"><span class="block text-body-sm font-medium text-on-surface truncate">{name}</span><span class="block text-xs text-on-surface-variant truncate">{sub}</span></span></span>
					<span class="{MONO} text-on-surface-variant shrink-0">{ms}</span>
				</div>
			{/each}
		</div>
	</Sheet>

	<Sheet open={openCategory === 'securityAbout'} title="Security & About" close={() => (openCategory = null)}>
		<div class="flex flex-col gap-4">
			<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 p-4">
				<span class="w-10 h-10 rounded-full bg-accent-emerald/10 text-accent-emerald flex items-center justify-center shrink-0"><ShieldCheck class="w-5 h-5" /></span>
				<span class="min-w-0"><span class="block {MONO} text-on-surface">End-to-End Dynamic Protection</span><span class="block text-body-sm text-on-surface-variant mt-0.5">256-bit TLS • rotating HMAC gate tokens • PWA v1.0</span></span>
			</div>
			<div class="flex flex-col gap-2">
				{#each securityRows as [label, value]}
					<div class="flex items-center justify-between gap-3 text-body-sm"><span class="{MONO} text-on-surface-variant">{label}</span><span class="{MONO} text-on-surface">{value}</span></div>
				{/each}
			</div>
			<div class="flex items-center justify-between gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high px-4 py-3">
				<span class="flex items-center gap-2 min-w-0 {MONO} text-on-surface-variant"><ShieldCheck class="w-4 h-4 text-accent-emerald shrink-0" />Secure_Channel: RSA-4096 / TLS 1.3</span>
				<span class="{MONO} text-outline-variant shrink-0">v2.4.1</span>
			</div>
		</div>
	</Sheet>

	<Sheet open={openCategory === 'verification'} title="Verification" close={() => (openCategory = null)}>
		<SettingsDetails category="verification" />
	</Sheet>
	<Sheet open={openCategory === 'notifications'} title="Notifications" close={() => (openCategory = null)}>
		<SettingsDetails category="notifications" />
	</Sheet>
	<Sheet open={openCategory === 'privacy'} title="Privacy" close={() => (openCategory = null)}>
		<SettingsDetails category="privacy" />
	</Sheet>
	<Sheet open={openCategory === 'securitySessions'} title="Security & Sessions" close={() => (openCategory = null)}>
		<SettingsDetails category="security" />
	</Sheet>
	<Sheet open={openCategory === 'payments'} title="Saved Payment Methods" close={() => (openCategory = null)}>
		<SettingsDetails category="payments" />
	</Sheet>
	<Sheet open={openCategory === 'accessibility'} title="Accessibility" close={() => (openCategory = null)}>
		<SettingsDetails category="accessibility" />
	</Sheet>
	<Sheet open={openCategory === 'offline'} title="Offline & Storage" close={() => (openCategory = null)}>
		<SettingsDetails category="offline" />
	</Sheet>
	<Sheet open={openCategory === 'help'} title="Help & Legal" close={() => (openCategory = null)}>
		<SettingsDetails category="help" />
	</Sheet>

