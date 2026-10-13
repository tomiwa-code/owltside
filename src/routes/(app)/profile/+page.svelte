<script lang="ts">
	import {
		BadgeCheck,
		Bell,
		CalendarDays,
		ChevronRight,
		Copy,
		Edit,
		Globe,
		Link2,
		QrCode,
		RefreshCw,
		Search,
		Settings2,
		Share2,
		ShieldCheck,
		WifiOff
	} from '@lucide/svelte';
	import Avatar from '$components/Avatar.svelte';
	import Sheet from '$components/Sheet.svelte';
	import { page } from '$app/state';
	import { follows } from '$lib/state/prefs.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import { fmtDate } from '$lib/utils/dates';

	let { data } = $props();
	const session = $derived(page.data.session);
	const name = $derived(session?.name ?? 'Guest Explorer');
	const handle = $derived(session?.handle ?? 'guest');

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';

	const upcoming = $derived(
		(data.tickets ?? []).filter((t) => t.status === 'valid' && new Date(t.eventStartsAt) > new Date())
	);

	let calendarOpen = $state(false);
	let editOpen = $state(false);
	let editName = $state(name);
	let editBio = $state('Chasing good sound and good software across Lagos.');

	// month grid for the current month
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth();
	const firstDay = (new Date(year, month, 1).getDay() + 6) % 7; // Monday start
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const monthLabel = now.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
	const eventDays = $derived(
		new Set(
			upcoming
				.filter((t) => {
					const d = new Date(t.eventStartsAt);
					return d.getMonth() === month && d.getFullYear() === year;
				})
				.map((t) => new Date(t.eventStartsAt).getDate())
		)
	);

	const vaultRows = $derived([
		{ icon: WifiOff, label: 'Offline Cache', value: 'Enabled' },
		{ icon: QrCode, label: 'Passes On Device', value: String(data.tickets?.length ?? 0) },
		{ icon: ShieldCheck, label: 'Gate Biometrics', value: 'Active' },
		{ icon: RefreshCw, label: 'Last Vault Sync', value: '12m ago' }
	]);

	function share() {
		void navigator.clipboard?.writeText(`https://owltside.app/@${handle}`);
		toast('Profile link copied', 'success');
	}
	async function copyText(value: string, label: string) {
		try {
			await navigator.clipboard.writeText(value);
			toast(`${label} copied`, 'success');
		} catch {
			toast(label, 'info');
		}
	}
</script>

<svelte:head><title>Profile • Owltside</title></svelte:head>

<!-- ── desktop (md+) profile & pass portfolio in the shipped console design
     language (design source unavailable this turn — extrapolated); mobile
     profile below unchanged ── -->
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
				<Avatar name={name} size="sm" />
			</a>
		</div>
	</header>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-10 pb-2 flex flex-wrap items-end justify-between gap-4">
		<div class="min-w-0">
			<span class="flex items-center gap-2 {MONO} text-on-surface-variant">
				<span>Identity_Node</span>
				<span class="text-outline-variant">/</span>
				<span>Public_Profile</span>
			</span>
			<h1 class="font-display text-[30px] leading-9 font-bold tracking-tight text-on-surface mt-3">Profile & Pass Portfolio</h1>
			<p class="text-body-md text-on-surface-variant mt-2">Public identity, vault readiness and the upcoming gate schedule for this access node.</p>
		</div>
		<div class="flex items-center gap-3">
			<a href="/settings" aria-label="Settings" class="w-10 h-10 rounded-lg bg-surface-container-high border border-surface-glass-border text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors">
				<Settings2 class="w-4 h-4" />
			</a>
			<button class="h-10 px-4 rounded-lg flex items-center gap-2 bg-surface-container-high border border-surface-glass-border text-on-surface text-body-sm hover:bg-surface-bright transition-colors" onclick={share}>
				<Share2 class="w-4 h-4 text-on-surface-variant" /><span>Share Profile</span>
			</button>
			<button class="h-10 px-4 rounded-lg flex items-center gap-2 bg-on-surface text-surface-base text-body-sm font-semibold hover:opacity-90 transition-opacity" onclick={() => (editOpen = true)}>
				<Edit class="w-4 h-4" /><span>Edit Profile</span>
			</button>
		</div>
	</div>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 pt-8">
		<section class="rounded-xl border border-surface-glass-border bg-surface-container overflow-hidden">
			<div class="relative h-32" style="background: linear-gradient(140deg, #312e81 0%, #1e1b4b 45%, #0b1326 100%);">
				<div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface-container"></div>
				<span class="absolute top-3 left-4 flex items-center gap-2 bg-surface-base/50 backdrop-blur-md px-3 py-1.5 rounded-full {MONO} text-accent-emerald">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span> PWA Sync
				</span>
				<span class="absolute top-3 right-4 {MONO} text-on-surface-variant">Node 0x7E3 • Lagos</span>
			</div>
			<div class="px-6 pb-6 flex flex-wrap items-start gap-6 justify-between">
				<span class="flex items-start gap-5 -mt-10 relative min-w-0">
					<span class="relative shrink-0">
						<span class="block w-24 h-24 rounded-full overflow-hidden shadow-2xl p-0.5 bg-gradient-to-tr from-primary to-accent-emerald">
							<span class="block w-full h-full rounded-full bg-surface-container flex items-center justify-center">
								<Avatar name={name} size="xl" />
							</span>
						</span>
						{#if session}
							<span class="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-md">
								<BadgeCheck class="w-4 h-4" />
							</span>
						{/if}
					</span>
					<span class="min-w-0 pt-1">
						<span class="flex items-center flex-wrap gap-2">
							<span class="font-display text-headline-lg text-on-surface tracking-tight">{name}</span>
							{#if session}
								<span class="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary-container {MONO}">
									<BadgeCheck class="w-3 h-3" /> Verified Member
								</span>
							{:else}
								<span class="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant {MONO}">Guest</span>
							{/if}
							<span class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-high border border-surface-glass-border text-on-surface-variant {MONO}">
								<WifiOff class="w-3 h-3 text-accent-emerald" /> Ticket Vault Ready
							</span>
						</span>
						<span class="{MONO} text-outline block mt-1.5">@{handle} • Lagos & Global Remote</span>
						<span class="block text-body-md text-on-surface-variant mt-2 leading-relaxed max-w-xl">{editBio}</span>
						<span class="flex items-center gap-4 mt-2.5 flex-wrap">
							<span class="inline-flex items-center gap-1.5 {MONO} text-tertiary"><Globe class="w-3.5 h-3.5" /> owltside.app/@{handle}</span>
							<span class="inline-flex items-center gap-1.5 {MONO} text-on-surface-variant"><Link2 class="w-3.5 h-3.5" /> @{handle}</span>
						</span>
					</span>
				</span>
				<span class="flex items-center gap-3 flex-wrap">
					{#each [
						[upcoming.length + (data.tickets?.length ?? 0), 'Tickets', true],
						[follows.value.length + 86, 'Following', false],
						[342, 'Followers', false]
					] as [value, label, accent]}
						<span class="rounded-lg border border-surface-glass-border bg-surface-container-high/60 px-6 py-3 text-center">
							<span class="block font-display text-headline-md font-semibold {accent ? 'text-primary' : 'text-on-surface'}">{value}</span>
							<span class="{MONO} text-on-surface-variant block mt-0.5">{label}</span>
						</span>
					{/each}
				</span>
			</div>
		</section>
	</div>

	<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
		<div class="flex flex-col gap-6 min-w-0">
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<span class="flex items-center gap-2.5">
						<span class="w-2 h-2 rounded-full bg-primary glow-primary"></span>
						<span class="font-display text-headline-md text-on-surface">Gate Schedule — Next Up</span>
					</span>
					<span class="{MONO} text-on-surface-variant">{upcoming.length} Valid Passes</span>
				</div>
				<div class="flex flex-col gap-2.5 mt-4">
					{#each upcoming.slice(0, 5) as t (t.id)}
						<a href="/tickets/{t.id}" class="flex items-center gap-4 rounded-lg border border-surface-glass-border bg-surface-container-high/50 p-3 hover:bg-surface-container-high transition-colors">
							<span class="w-12 h-12 rounded-md bg-surface-container-highest border border-surface-glass-border flex flex-col items-center justify-center shrink-0">
								<span class="font-code text-[10px] tracking-[0.14em] text-on-surface-variant uppercase">{new Date(t.eventStartsAt).toLocaleDateString('en-NG', { month: 'short' })}</span>
								<span class="font-display text-body-lg font-bold text-on-surface leading-5">{new Date(t.eventStartsAt).getDate()}</span>
							</span>
							<span class="flex-1 min-w-0">
								<span class="block text-body-md font-semibold text-on-surface truncate">{t.eventTitle}</span>
								<span class="block text-body-sm text-on-surface-variant truncate">{fmtDate(t.eventStartsAt)} • {t.venue}</span>
							</span>
							<span class="{MONO} px-2 py-1 rounded bg-surface-container-high border border-surface-glass-border text-on-surface-variant shrink-0">{t.tierName}</span>
							<ChevronRight class="w-4 h-4 text-outline-variant shrink-0" />
						</a>
					{:else}
						<p class="text-body-sm text-on-surface-variant py-6 text-center">No upcoming passes — the city is waiting.</p>
					{/each}
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<span class="flex items-center gap-2">
						<CalendarDays class="w-4.5 h-4.5 text-primary" />
						<span class="font-display text-headline-md text-on-surface">{monthLabel}</span>
					</span>
					<span class="{MONO} px-2 py-0.5 rounded bg-primary/20 text-primary">{eventDays.size} Events</span>
				</div>
				<div class="grid grid-cols-7 gap-1 text-center {MONO} text-outline py-2 mt-2">
					{#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as d}<span>{d}</span>{/each}
				</div>
				<div class="grid grid-cols-7 gap-1 text-center text-body-sm text-on-surface-variant">
					{#each Array(firstDay) as _, i (i)}<span class="py-1.5 text-outline/40"></span>{/each}
					{#each Array(daysInMonth) as _, i (i)}
						{@const day = i + 1}
						<span class="py-1.5 rounded {eventDays.has(day) ? 'bg-primary text-on-primary font-bold shadow-sm' : 'bg-surface-container-high/60'}">{day}</span>
					{/each}
				</div>
				<div class="mt-4 pt-3 border-t border-surface-glass-border flex items-center gap-1.5 text-on-surface-variant {MONO}">
					<span class="w-2 h-2 rounded-full bg-primary"></span>
					{#each upcoming.slice(0, 2) as t}
						<span>{fmtDate(t.eventStartsAt)}: {t.eventTitle}</span>
					{:else}
						<span>No events this month</span>
					{/each}
				</div>
			</section>
		</div>

		<div class="flex flex-col gap-6 min-w-0">
			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Vault Readiness</h2>
					<span class="{MONO} text-on-surface-variant">Local_Cache</span>
				</div>
				<div class="flex flex-col gap-2.5 mt-4">
					{#each vaultRows as row (row.label)}
						{@const VIcon = row.icon}
						<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
							<span class="w-8 h-8 rounded-md bg-surface-container-highest flex items-center justify-center shrink-0">
								<VIcon class="w-4 h-4 text-on-surface-variant" />
							</span>
							<span class="flex-1 text-body-sm font-medium text-on-surface">{row.label}</span>
							<span class="{MONO} text-accent-emerald">{row.value}</span>
						</div>
					{/each}
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<div class="flex items-center justify-between gap-3">
					<h2 class="font-display text-headline-md text-on-surface">Identity Links</h2>
					<span class="{MONO} text-on-surface-variant">Public_DNS</span>
				</div>
				<div class="flex flex-col gap-2.5 mt-4">
					<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
						<Globe class="w-4 h-4 text-tertiary shrink-0" />
						<span class="flex-1 min-w-0 {MONO} text-on-surface truncate">owltside.app/@{handle}</span>
						<button class="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors shrink-0" aria-label="Copy profile link" onclick={() => copyText(`https://owltside.app/@${handle}`, 'Profile link')}>
							<Copy class="w-3.5 h-3.5" />
						</button>
					</div>
					<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
						<Link2 class="w-4 h-4 text-on-surface-variant shrink-0" />
						<span class="flex-1 min-w-0 {MONO} text-on-surface truncate">@{handle}</span>
						<button class="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors shrink-0" aria-label="Copy handle" onclick={() => copyText(`@${handle}`, 'Handle')}>
							<Copy class="w-3.5 h-3.5" />
						</button>
					</div>
					<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5">
						<ShieldCheck class="w-4 h-4 text-accent-emerald shrink-0" />
						<span class="flex-1 min-w-0 text-body-sm text-on-surface truncate">{session?.email ?? 'No email (guest)'}</span>
						<span class="{MONO} px-2 py-0.5 rounded text-accent-emerald bg-accent-emerald/10 border border-accent-emerald/20 shrink-0">Verified</span>
					</div>
				</div>
			</section>

			<section class="rounded-xl border border-surface-glass-border bg-surface-container p-6">
				<h2 class="font-display text-headline-md text-on-surface">Quick Routes</h2>
				<div class="flex flex-col gap-2.5 mt-4">
					{#each [
						['/tickets', 'Ticket Wallet & Passes'],
						['/organizer', 'Organizer Console'],
						['/settings', 'Settings & Identity']
					] as [href, label]}
						<a {href} class="flex items-center justify-between gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-2.5 hover:bg-surface-container-high transition-colors">
							<span class="text-body-sm font-medium text-on-surface">{label}</span>
							<ChevronRight class="w-4 h-4 text-outline-variant shrink-0" />
						</a>
					{/each}
				</div>
			</section>
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
	<header class="fixed top-0 inset-x-0 z-50 pt-safe md:left-20">
		<div class="h-16 px-gutter md:max-w-3xl md:mx-auto flex items-center justify-between">
			<span class="font-display text-headline-md text-on-surface">Profile</span>
			<a href="/settings" aria-label="Settings" class="w-9 h-9 rounded-full bg-surface-container-high/80 backdrop-blur-md flex items-center justify-center text-on-surface hover:text-primary transition-all active:scale-95 shadow-lg">
				<Settings2 class="w-4.5 h-4.5" />
			</a>
		</div>
	</header>

	<main class="flex flex-col relative w-full pt-16 pb-28 md:pb-16 bg-surface min-h-dvh">
		<div class="flex flex-col w-full relative md:max-w-3xl md:mx-auto">
			<!-- cover -->
			<div class="relative w-full h-44 overflow-hidden">
				<div class="w-full h-full" style="background: linear-gradient(140deg, #312e81 0%, #1e1b4b 45%, #0b1326 100%);"></div>
				<div class="absolute inset-0 bg-gradient-to-b from-surface/20 via-surface/60 to-surface"></div>
				<div class="absolute top-3 left-4 flex items-center gap-2 bg-surface-container/70 backdrop-blur-md px-3 py-1.5 rounded-full shadow-md">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse"></span>
					<span class="font-code text-label-code text-accent-emerald tracking-wide uppercase">PWA Sync</span>
				</div>
			</div>

			<div class="px-gutter -mt-14 relative z-10 flex flex-col">
				<div class="flex items-end justify-between">
					<div class="relative">
						<div class="w-24 h-24 rounded-full overflow-hidden shadow-2xl p-0.5 bg-gradient-to-tr from-primary to-accent-emerald">
							<div class="w-full h-full rounded-full bg-surface-container flex items-center justify-center">
								<Avatar name={name} size="xl" />
							</div>
						</div>
						{#if session}
							<span class="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-md">
								<BadgeCheck class="w-4 h-4" />
							</span>
						{/if}
					</div>
					<span class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant text-label-badge shadow-sm mb-2">
						<WifiOff class="w-3.5 h-3.5 text-accent-emerald" /> Ticket Vault Ready
					</span>
				</div>

				<div class="mt-3 flex flex-col">
					<div class="flex items-center flex-wrap gap-2">
						<h1 class="font-display text-headline-lg-mobile text-on-surface tracking-tight">{name}</h1>
						{#if session}
							<span class="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary-container text-label-badge">
								<BadgeCheck class="w-3 h-3" /> Verified Member
							</span>
						{:else}
							<span class="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant text-label-badge">Guest</span>
						{/if}
					</div>
					<p class="font-code text-label-code text-outline mt-0.5">@{handle} • Lagos & Global Remote</p>
				</div>

				<p class="text-body-md text-on-surface-variant mt-2.5 leading-relaxed">{editBio}</p>

				<div class="flex items-center gap-4 mt-2.5 flex-wrap">
					<span class="inline-flex items-center gap-1 text-label-badge text-tertiary">
						<Globe class="w-3.5 h-3.5" /> owltside.app/@{handle}
					</span>
					<span class="inline-flex items-center gap-1 text-label-badge text-on-surface-variant">
						<Link2 class="w-3.5 h-3.5" /> @{handle}
					</span>
				</div>

				<!-- stats -->
				<div class="grid grid-cols-3 gap-2 mt-4 bg-surface-container-low rounded-xl p-3 shadow-md">
					<button class="flex flex-col items-center justify-center p-1 rounded-lg hover:bg-surface-container transition-colors group active:scale-95">
						<span class="font-display text-headline-md text-primary font-semibold">{upcoming.length + (data.tickets?.length ?? 0)}</span>
						<span class="text-label-badge text-on-surface-variant tracking-wider uppercase">Tickets</span>
					</button>
					<button class="flex flex-col items-center justify-center p-1 rounded-lg hover:bg-surface-container transition-colors group active:scale-95">
						<span class="font-display text-headline-md text-on-surface font-semibold">{follows.value.length + 86}</span>
						<span class="text-label-badge text-on-surface-variant tracking-wider uppercase">Following</span>
					</button>
					<button class="flex flex-col items-center justify-center p-1 rounded-lg hover:bg-surface-container transition-colors group active:scale-95">
						<span class="font-display text-headline-md text-on-surface font-semibold">342</span>
						<span class="text-label-badge text-on-surface-variant tracking-wider uppercase">Followers</span>
					</button>
				</div>

				<!-- actions -->
				<div class="grid grid-cols-12 gap-2 mt-3.5">
					<button class="col-span-5 h-11 px-3 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-label-badge flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm" onclick={() => (editOpen = true)}>
						<Edit class="w-4 h-4" /><span>Edit Profile</span>
					</button>
					<button class="col-span-4 h-11 px-3 rounded-full bg-primary-container text-on-primary-container text-label-badge flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all" onclick={() => (calendarOpen = !calendarOpen)}>
						<CalendarDays class="w-4 h-4" /><span>Calendar</span>
					</button>
					<button aria-label="Share Profile" class="col-span-3 h-11 px-3 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-label-badge flex items-center justify-center gap-1 transition-all active:scale-95 shadow-sm" onclick={share}>
						<Share2 class="w-4 h-4" />
					</button>
				</div>

				<!-- calendar popover -->
				{#if calendarOpen}
					<div class="mt-3 bg-surface-container-high rounded-2xl p-4 shadow-xl transition-all">
						<div class="flex items-center justify-between pb-3">
							<span class="flex items-center gap-2">
								<CalendarDays class="w-4.5 h-4.5 text-primary" />
								<span class="font-display text-headline-md text-on-surface">{monthLabel}</span>
							</span>
							<span class="font-code text-label-code px-2 py-0.5 rounded bg-primary/20 text-primary">{eventDays.size} Events</span>
						</div>
						<div class="grid grid-cols-7 gap-1 text-center text-label-badge text-outline py-1">
							{#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as d}<span>{d}</span>{/each}
						</div>
						<div class="grid grid-cols-7 gap-1 text-center text-body-sm text-on-surface-variant pt-1">
							{#each Array(firstDay) as _, i (i)}<span class="py-1 text-outline/40"></span>{/each}
							{#each Array(daysInMonth) as _, i (i)}
								{@const day = i + 1}
								<span class="py-1 rounded {eventDays.has(day) ? 'bg-primary text-on-primary font-bold shadow-sm' : 'bg-surface-container'}">{day}</span>
							{/each}
						</div>
						<div class="mt-3 pt-2 flex items-center gap-1.5 text-on-surface-variant text-label-badge">
							<span class="w-2 h-2 rounded-full bg-primary"></span>
							{#each upcoming.slice(0, 2) as t}
								<span>{fmtDate(t.eventStartsAt)}: {t.eventTitle}</span>
							{:else}
								<span>No events this month</span>
							{/each}
						</div>
					</div>
				{/if}

				<!-- upcoming mini list -->
				<div class="mt-6 flex flex-col gap-space-xs pb-6">
					<span class="text-label-badge text-on-surface-variant uppercase tracking-wider">Next up</span>
					{#each upcoming.slice(0, 3) as t (t.id)}
						<a href="/tickets/{t.id}" class="flex items-center justify-between p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors">
							<span class="min-w-0">
								<span class="block text-body-md text-on-surface font-semibold truncate">{t.eventTitle}</span>
								<span class="block text-body-sm text-on-surface-variant">{fmtDate(t.eventStartsAt)} • {t.venue}</span>
							</span>
							<span class="text-label-badge text-tertiary shrink-0">{t.tierName}</span>
						</a>
					{:else}
						<p class="text-body-sm text-on-surface-variant">No upcoming passes — the city is waiting.</p>
					{/each}
				</div>
			</div>
		</div>
	</main>
</div>

<Sheet open={editOpen} title="Edit profile" close={() => (editOpen = false)}>
	{#snippet footer()}
		<button class="w-full h-12 rounded-full bg-primary text-on-primary font-semibold text-body-md" onclick={() => { editOpen = false; toast('Profile updated', 'success'); }}>
			Save changes
		</button>
	{/snippet}
	<div class="flex flex-col gap-space-md">
		<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
			Display name
			<input bind:value={editName} class="h-12 px-4 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" />
		</label>
		<label class="flex flex-col gap-1 text-body-sm text-on-surface-variant">
			Bio
			<textarea bind:value={editBio} rows="3" class="px-4 py-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline"></textarea>
		</label>
	</div>
</Sheet>
