<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		AtSign,
		ArrowLeft,
		BadgeCheck,
		Compass,
		KeyRound,
		Lock,
		Mail,
		MoonStar,
		Send
	} from '@lucide/svelte';

	let { form } = $props();
	let email = $state('');
	const valid = $derived(/^\S+@\S+\.\S+$/.test(email));
</script>

<header class="fixed top-0 inset-x-0 z-50 bg-surface/90 backdrop-blur-xl border-b border-surface-glass-border pt-safe">
	<div class="h-16 px-space-md md:max-w-lg md:mx-auto flex items-center justify-between">
		<div class="flex items-center gap-space-xs">
			<a href="/" aria-label="Back" class="w-11 h-11 -ml-2 flex items-center justify-center text-on-surface rounded-full hover:bg-surface-container transition-colors">
				<ArrowLeft class="w-5 h-5" />
			</a>
			<h1 class="font-display text-headline-md font-semibold text-on-surface truncate">Login</h1>
		</div>
		<img src="/logo.png" alt="Owltside" class="h-6 w-auto object-contain opacity-90" />
	</div>
</header>

<main class="flex-1 flex flex-col relative w-full pt-16 pb-safe bg-surface min-h-dvh">
	<div class="flex flex-col w-full px-gutter md:max-w-lg md:mx-auto pb-space-xl">
		<div class="relative w-full rounded-xl bg-surface-container border border-surface-glass-border p-space-lg mt-space-sm mb-space-md">
			<div class="flex flex-col items-center text-center">
				<div class="relative flex items-center justify-center w-14 h-14 rounded-full bg-[#222a3d] border border-surface-glass-border mb-space-sm">
					<MoonStar class="w-7 h-7 text-on-surface" />
					<span class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-accent-emerald flex items-center justify-center">
						<span class="w-1.5 h-1.5 rounded-full bg-surface-base rounded-full"></span>
					</span>
				</div>
				<div class="flex items-center gap-space-xs mb-1">
					<span class="font-display text-headline-md tracking-wider text-on-surface uppercase font-bold">Owltside</span>
					<span class="text-label-badge bg-[#222a3d] text-on-surface-variant border border-surface-glass-border px-2 py-0.5 rounded-full">LIVE PASS</span>
				</div>
				<p class="font-display text-headline-lg-mobile text-on-surface font-semibold">Welcome back</p>
				<p class="text-body-sm text-outline max-w-[280px] mt-0.5">
					Your instant radar for tonight's music arenas, secret sets, and gate tickets.
				</p>
			</div>
		</div>

		<form method="POST" action="?/sendCode" use:enhance class="bg-surface-container border border-surface-glass-border rounded-xl p-space-md flex flex-col gap-space-md">
			<div class="flex flex-col gap-1.5">
				<label class="text-label-badge uppercase tracking-wider text-outline flex items-center justify-between" for="email-input">
					<span>Email Address</span>
					<span class="text-label-badge text-on-surface opacity-0 transition-opacity {valid ? 'opacity-100' : ''}">Valid</span>
				</label>
				<div class="relative flex items-center">
					<AtSign class="absolute left-3.5 w-5 h-5 text-outline pointer-events-none" />
					<input
						id="email-input"
						name="email"
						type="email"
						inputmode="email"
						required
						placeholder="rave.patron@owltside.io"
						bind:value={email}
						class="w-full h-12 bg-surface-base border border-surface-glass-border text-on-surface text-body-md rounded-lg pl-11 pr-10 focus:outline-none focus:border-outline transition-colors"
					/>
					{#if valid}
						<span class="absolute right-3.5 flex items-center justify-center text-accent-emerald">
							<BadgeCheck class="w-[18px] h-[18px]" />
						</span>
					{/if}
				</div>
				{#if form?.error}
					<p class="text-body-sm text-error">{form.error}</p>
				{/if}
				<p class="text-body-sm text-outline flex items-center gap-1.5 mt-0.5">
					<Mail class="w-4 h-4 text-on-surface" /> We'll send a 6-digit login verification code to your email.
				</p>
			</div>

			<div class="flex items-center gap-space-xs bg-surface-base border border-surface-glass-border px-3 py-2 rounded-lg">
				<Lock class="w-4 h-4 text-accent-emerald" />
				<span class="text-body-sm text-on-surface-variant truncate">Passwordless & Instant Passcode Authentication</span>
			</div>

			<button class="relative w-full h-12 rounded-lg bg-primary-fixed text-surface-base text-body-lg font-semibold flex items-center justify-center gap-space-xs transition-all active:scale-[0.98] hover:bg-white" type="submit">
				<Send class="w-5 h-5" />
				<span>Send Login Code</span>
			</button>
		</form>

		<div class="relative flex items-center justify-center my-space-md">
			<div class="w-full h-[1px] bg-[#272831]"></div>
			<span class="absolute bg-surface px-space-sm text-label-badge uppercase tracking-wider text-outline">or continue with</span>
		</div>

		<div class="grid grid-cols-3 gap-space-sm mb-space-sm">
			<button class="h-12 bg-surface-container border border-surface-glass-border hover:border-outline rounded-lg flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all text-on-surface" type="button" aria-label="Sign in with Google">
				<svg class="w-5 h-5" viewBox="0 0 24 24">
					<path d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.3 8.9 5 12 5z" fill="#EA4335"></path>
					<path d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5.1 3.7-8.8z" fill="#4285F4"></path>
					<path d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.4s.2-1.7.4-2.4L1.6 7c-.8 1.6-1.3 3.4-1.3 5.3s.5 3.7 1.3 5.3l3.7-2.9z" fill="#FBBC05"></path>
					<path d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.3-6.7-5.3L1.6 16C3.5 19.8 7.4 23 12 23z" fill="#34A853"></path>
				</svg>
				<span class="text-label-badge text-outline">Google</span>
			</button>
			<button class="h-12 bg-surface-container border border-surface-glass-border hover:border-outline rounded-lg flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all text-on-surface" type="button" aria-label="Sign in with Apple">
				<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24">
					<path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.68 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.88c.61-.74 1.02-1.77.91-2.8-.88.04-1.95.59-2.58 1.33-.56.64-1.04 1.69-.91 2.7.99.08 1.98-.5 2.58-1.23z"></path>
				</svg>
				<span class="text-label-badge text-outline">Apple</span>
			</button>
			<button class="h-12 bg-surface-container border border-surface-glass-border hover:border-outline rounded-lg flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-all text-on-surface" type="button" aria-label="Sign in with Passkey">
				<KeyRound class="w-5 h-5" />
				<span class="text-label-badge text-outline">Passkey</span>
			</button>
		</div>

		<a href="/home" class="w-full h-11 rounded-lg bg-surface-container border border-surface-glass-border hover:border-outline transition-colors text-on-surface-variant flex items-center justify-between px-space-md mb-space-sm">
			<span class="flex items-center gap-space-xs">
				<Compass class="w-5 h-5 text-outline" />
				<span class="text-body-md font-medium text-on-surface">Continue as Guest</span>
			</span>
			<span class="text-label-badge bg-[#222a3d] border border-surface-glass-border px-2 py-0.5 rounded text-outline">Browse Only</span>
		</a>

		<div class="bg-surface-container border border-surface-glass-border rounded-lg p-space-sm flex items-center justify-between mb-space-md">
			<div class="flex items-center gap-space-xs">
				<span class="w-2 h-2 rounded-full bg-accent-emerald animate-pulse"></span>
				<span class="text-body-sm text-on-surface font-medium">Underground Warehouse 04</span>
			</div>
			<span class="font-code text-label-code text-on-surface-variant">38 PASSES LEFT</span>
		</div>

		<div class="flex flex-col items-center justify-center gap-1 text-center pt-space-xs">
			<p class="text-body-md text-on-surface-variant">
				Don't have an account?
				<a class="text-primary font-semibold hover:underline underline-offset-4" href="/auth/signup">Sign Up</a>
			</p>
			<p class="text-body-sm text-outline">Instant gate QR issuance upon zero-friction signup</p>
		</div>
	</div>
</main>
