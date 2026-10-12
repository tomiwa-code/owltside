<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		BadgeCheck,
		Bell,
		Megaphone,
		LogOut,
		Mail,
		ShieldCheck,
		ArrowLeftRight,
		Ticket,
		User,
		UserRound,
		WifiOff
	} from '@lucide/svelte';
	import TopBar from '$components/TopBar.svelte';
	import Avatar from '$components/Avatar.svelte';
	import CurrencyPill from '$components/CurrencyPill.svelte';
	import { page } from '$app/state';
	import { toast } from '$lib/state/toast.svelte';

	let { data } = $props();
	const session = $derived(page.data.session);

	let role = $state<'attendee' | 'guest' | 'organizer'>('attendee');
	let pushEnabled = $state(true);
	let offlineWallet = $state(true);

	const roles = [
		{ id: 'attendee', label: 'Attendee', icon: Ticket },
		{ id: 'guest', label: 'Guest', icon: UserRound },
		{ id: 'organizer', label: 'Organizer', icon: Megaphone }
	] as const;
</script>

<svelte:head><title>Settings • Owltside</title></svelte:head>

<TopBar back title="Settings" subtitle="Identity, preferences & security" />

<main class="flex-1 flex flex-col relative w-full pt-16 pb-28 md:pb-16 bg-surface min-h-dvh">
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
						<r.icon class="w-4.5 h-4.5" />
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
				<input type="checkbox" bind:checked={pushEnabled} class="w-5 h-5 accent-[#c0c1ff]" />
			</label>
			<label class="flex items-center justify-between bg-surface-container rounded-xl p-4 cursor-pointer">
				<div>
					<p class="text-body-md text-on-surface font-medium flex items-center gap-1.5"><WifiOff class="w-4 h-4 text-accent-emerald" /> Offline wallet cache</p>
					<p class="text-body-sm text-on-surface-variant">Keep HMAC passes on-device</p>
				</div>
				<input type="checkbox" bind:checked={offlineWallet} class="w-5 h-5 accent-[#c0c1ff]" />
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
		</section>
	</div>
</main>
