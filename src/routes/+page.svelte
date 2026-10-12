<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Wifi, RefreshCw, Zap, WifiOff } from '@lucide/svelte';

	const session = $derived(page.data.session);

	let pct = $state(0);
	let statusText = $state('Restoring vault from cache');

	$effect(() => {
		const steps: Array<[number, string]> = [
			[18, 'Syncing gate engine'],
			[46, 'Verifying HMAC keys'],
			[74, 'Loading your passes'],
			[100, 'Vault restored']
		];
		let i = 0;
		const iv = setInterval(() => {
			pct = Math.min(100, pct + 4 + Math.round(Math.random() * 6));
			while (i < steps.length && pct >= steps[i][0]) {
				statusText = steps[i][1];
				i++;
			}
			if (pct >= 100) {
				clearInterval(iv);
				setTimeout(() => goto(session ? '/home' : '/auth/login', { replaceState: true }), 350);
			}
		}, 60);
		return () => clearInterval(iv);
	});
</script>

<main class="flex-1 flex flex-col relative w-full bg-surface-base pt-safe pb-safe min-h-dvh">
	<div class="flex flex-col w-full relative overflow-hidden py-10 px-6 justify-between min-h-dvh">
		<div
			class="absolute inset-0 pointer-events-none"
			style="background: radial-gradient(60% 40% at 50% 0%, rgba(99,102,241,0.16) 0, transparent 70%), radial-gradient(50% 35% at 50% 100%, rgba(6,182,212,0.10) 0, transparent 70%);"
		></div>

		<div class="relative z-10 flex items-center justify-between w-full">
			<div class="flex items-center gap-2 bg-[#131b2e] border border-surface-glass-border px-3 py-1.5 rounded-full shadow-sm">
				<span class="inline-block w-2 h-2 rounded-full bg-accent-emerald animate-pulse"></span>
				<span class="text-label-badge text-on-surface tracking-wider uppercase">Gate Engine Synced</span>
			</div>
			<div class="flex items-center gap-1.5 bg-[#131b2e] border border-surface-glass-border px-2.5 py-1.5 rounded-full shadow-sm">
				<Wifi class="w-4 h-4 text-on-surface-variant" />
				<span class="font-code text-label-code text-on-surface-variant">MESH-ID #804</span>
			</div>
		</div>

		<div class="relative z-10 flex flex-col items-center justify-center my-auto w-full text-center">
			<div class="relative flex items-center justify-center mb-6">
				<div class="relative w-40 h-40 rounded-2xl bg-[#131b2e] border border-surface-glass-border p-4 flex items-center justify-center shadow-lg glow-primary">
					<img src="/logo-stacked.png" alt="Owltside" class="w-full h-auto max-h-32 object-contain" />
				</div>
			</div>
			<p class="font-body text-body-md text-on-surface-variant mt-1.5 max-w-xs leading-snug">
				Everything happening around you.
			</p>

			<div class="w-full max-w-xs mt-8 flex flex-col items-center gap-2.5">
				<div class="w-full h-1.5 bg-[#222a3d] border border-surface-glass-border rounded-full overflow-hidden">
					<div class="h-full bg-primary-fixed rounded-full transition-all duration-300" style="width: {pct}%"></div>
				</div>
				<div class="flex items-center justify-between w-full px-1">
					<div class="flex items-center gap-1.5 text-outline">
						<RefreshCw class="w-3.5 h-3.5 animate-spin" />
						<span class="text-body-sm">{statusText}</span>
					</div>
					<span class="font-code text-label-code text-on-surface">{pct}%</span>
				</div>
			</div>
		</div>

		<div class="relative z-10 flex flex-col items-center gap-4 w-full">
			{#if !session}
				<div class="flex items-center gap-3 w-full max-w-xs">
					<a
						href="/auth/login"
						class="flex-1 h-11 rounded-full bg-primary text-on-primary text-body-sm font-semibold flex items-center justify-center glow-primary"
					>
						Sign in
					</a>
					<a
						href="/home"
						class="flex-1 h-11 rounded-full bg-surface-container border border-surface-glass-border text-on-surface text-body-sm font-medium flex items-center justify-center"
					>
						Continue as Guest
					</a>
				</div>
			{/if}
			<div class="flex items-center gap-2 bg-[#131b2e] border border-surface-glass-border px-3.5 py-1 rounded-full shadow-sm">
				<Zap class="w-4 h-4 text-accent-emerald" />
				<span class="text-label-badge text-on-surface tracking-wider">PWA OFFLINE READY</span>
				<span class="text-outline-variant font-code">•</span>
				<span class="font-code text-label-code text-outline">v1.0</span>
			</div>
			<p class="text-body-sm text-outline text-center flex items-center gap-1.5">
				<WifiOff class="w-3.5 h-3.5" /> HMAC Secure Vault • Tamper-Evident Ticket Session
			</p>
		</div>
	</div>
</main>
