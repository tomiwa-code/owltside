<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		ArrowLeft,
		AtSign,
		BadgeCheck,
		Compass,
		KeyRound,
		Lock,
		MoonStar,
		ShieldCheck,
		User,
		UserPlus
	} from '@lucide/svelte';

	let { form } = $props();
	let email = $state('');
	let name = $state('');
	let terms = $state(false);
	const valid = $derived(/^\S+@\S+\.\S+$/.test(email));

	const MONO = 'font-code text-label-badge tracking-[0.14em] uppercase';
</script>

<!-- ── desktop (md+) composition — mirrors the shipped desktop login auth
     layout, themed with the Evently Pulse tokens (design source unavailable
     this turn — extrapolated); mobile signup below unchanged ── -->
<div class="hidden md:flex flex-col min-h-dvh bg-surface-base text-on-surface">
	<div class="flex-1 grid lg:grid-cols-[minmax(0,46%)_minmax(0,54%)]">
		<!-- brand / protocol panel -->
		<aside class="relative overflow-hidden border-r border-surface-glass-border bg-surface-container-low flex flex-col p-10 xl:p-14 gap-10">
			<div
				class="absolute inset-0 pointer-events-none"
				style="background-image: radial-gradient(circle at 15% 20%, rgba(99,102,241,0.14) 0, transparent 45%), radial-gradient(circle at 85% 80%, rgba(76,215,246,0.08) 0, transparent 40%);"
			></div>
			<div class="relative flex items-center gap-2.5">
				<span class="w-2 h-2 rounded-full bg-primary glow-primary"></span>
				<span class="font-display font-bold tracking-tight text-on-surface text-[17px]">OWLTSIDE</span>
				<span class="{MONO} text-tertiary border border-tertiary/25 bg-tertiary/10 rounded px-1.5 py-0.5">Secure_Node</span>
			</div>
			<div class="relative flex-1 flex flex-col justify-center gap-6">
				<div class="flex items-center gap-2">
					<span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
					<span class="{MONO} text-on-surface-variant">Auth_Protocol // Onboard // NGA-LOS-01</span>
				</div>
				<h1 class="font-display text-display-hero text-on-surface">Join the night side.</h1>
				<p class="text-body-lg text-on-surface-variant max-w-md">
					One account for discovery, instant passes and offline gate entry. Passwordless
					from day one — your mailbox is the only key the door needs.
				</p>
				<div class="rounded-2xl border border-surface-glass-border bg-surface-base p-5 max-w-md">
					<div class="flex items-center gap-2">
						<ShieldCheck class="w-4 h-4 text-primary" />
						<span class="font-display font-bold text-on-surface tracking-wide text-body-md">OWLTSIDE ENGINE</span>
					</div>
					<p class="text-body-sm text-on-surface-variant leading-relaxed pt-3">
						Tamper-evident HMAC tickets minted the moment you join. Dynamic keys rotate at
						sub-minute intervals, signed by venue node hardware — no passwords to leak.
					</p>
					<div class="flex items-center gap-5 pt-4">
						<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
							<span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
							P2P Fraud: 0%
						</span>
						<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
							<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
							Zero Speculation
						</span>
					</div>
				</div>
			</div>
			<div class="relative flex items-center justify-between gap-4 border-t border-surface-glass-border pt-6">
				<span class="flex items-center gap-2 min-w-0">
					<span class="w-2 h-2 rounded-full bg-accent-emerald animate-pulse shrink-0"></span>
					<span class="text-body-sm text-on-surface font-medium truncate">1,148 holders onboarded this week</span>
				</span>
				<span class="{MONO} text-on-surface-variant shrink-0">Lagos • Abuja • PH</span>
			</div>
		</aside>

		<!-- form panel -->
		<section class="flex flex-col items-center justify-center px-8 xl:px-16 py-12">
			<div class="w-full max-w-md flex flex-col gap-6">
				<div class="flex items-end justify-between gap-4">
					<div>
						<span class="{MONO} text-on-surface-variant">Node Access // Sign Up</span>
						<h2 class="font-display text-headline-lg text-on-surface pt-2">Create your account</h2>
					</div>
					<a href="/auth/login" class="{MONO} text-primary hover:underline shrink-0 pb-1">Login</a>
				</div>

				<form method="POST" action="?/create" use:enhance class="rounded-2xl border border-surface-glass-border bg-surface-container p-7 flex flex-col gap-5">
					<div class="flex flex-col gap-1.5">
						<label class="{MONO} text-on-surface-variant" for="name-input-desktop">Full Name</label>
						<div class="relative flex items-center">
							<User class="absolute left-3.5 w-4 h-4 text-outline-variant pointer-events-none" />
							<input
								id="name-input-desktop"
								name="name"
								type="text"
								required
								placeholder="Ada Obi"
								bind:value={name}
								class="w-full h-12 bg-surface-base border border-surface-glass-border text-on-surface text-body-md rounded-lg pl-10 pr-4 placeholder:text-outline-variant focus:outline-none focus:border-primary/50 focus:bg-surface-container-low transition-colors"
							/>
						</div>
					</div>

					<div class="flex flex-col gap-1.5">
						<label class="{MONO} text-on-surface-variant flex items-center justify-between" for="email-input-desktop">
							<span>Email Address</span>
							<span class="text-accent-emerald opacity-0 transition-opacity {valid ? 'opacity-100' : ''}">Valid</span>
						</label>
						<div class="relative flex items-center">
							<AtSign class="absolute left-3.5 w-4 h-4 text-outline-variant pointer-events-none" />
							<input
								id="email-input-desktop"
								name="email"
								type="email"
								required
								inputmode="email"
								placeholder="you@owltside.io"
								bind:value={email}
								class="w-full h-12 bg-surface-base border border-surface-glass-border text-on-surface text-body-md rounded-lg pl-10 pr-10 placeholder:text-outline-variant focus:outline-none focus:border-primary/50 focus:bg-surface-container-low transition-colors"
							/>
							{#if valid}
								<span class="absolute right-3.5 flex items-center justify-center text-accent-emerald">
									<BadgeCheck class="w-[18px] h-[18px]" />
								</span>
							{/if}
						</div>
					</div>

					<label class="flex items-start gap-2.5 cursor-pointer select-none">
						<input type="checkbox" bind:checked={terms} required class="mt-0.5 w-4 h-4 rounded accent-[#c0c1ff]" />
						<span class="text-body-sm text-on-surface-variant">
							I agree to the <span class="text-primary font-medium">Terms</span> and
							<span class="text-primary font-medium">Privacy Policy</span>, and I'm 18 or older.
						</span>
					</label>

					{#if form?.error}
						<p class="text-body-sm text-error">{form.error}</p>
					{/if}

					<div class="flex items-center gap-2 bg-surface-base border border-surface-glass-border px-3 py-2.5 rounded-lg">
						<Lock class="w-4 h-4 text-accent-emerald shrink-0" />
						<span class="text-body-sm text-on-surface-variant truncate">Passwordless — a 6-digit code completes setup</span>
					</div>

					<button
						class="w-full h-12 rounded-lg bg-primary text-on-primary text-body-md font-semibold flex items-center justify-center gap-2 transition-colors hover:bg-primary-container glow-primary disabled:opacity-40"
						disabled={!terms}
						type="submit"
					>
						<UserPlus class="w-4 h-4" />
						<span>Create Account</span>
					</button>
				</form>

				<div class="relative flex items-center justify-center">
					<div class="w-full h-[1px] bg-surface-glass-border"></div>
					<span class="absolute bg-surface-base px-3 {MONO} text-on-surface-variant">Or Continue With</span>
				</div>

				<div class="grid grid-cols-3 gap-3">
					<button class="h-12 bg-surface-container border border-surface-glass-border hover:border-primary/40 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors text-on-surface" type="button" aria-label="Sign up with Google">
						<svg class="w-5 h-5" viewBox="0 0 24 24">
							<path d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.3 8.9 5 12 5z" fill="#EA4335"></path>
							<path d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5.1 3.7-8.8z" fill="#4285F4"></path>
							<path d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.4s.2-1.7.4-2.4L1.6 7c-.8 1.6-1.3 3.4-1.3 5.3s.5 3.7 1.3 5.3l3.7-2.9z" fill="#FBBC05"></path>
							<path d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.3-6.7-5.3L1.6 16C3.5 19.8 7.4 23 12 23z" fill="#34A853"></path>
						</svg>
						<span class="text-label-badge text-on-surface-variant">Google</span>
					</button>
					<button class="h-12 bg-surface-container border border-surface-glass-border hover:border-primary/40 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors text-on-surface" type="button" aria-label="Sign up with Apple">
						<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24">
							<path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.32-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.68 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.88c.61-.74 1.02-1.77.91-2.8-.88.04-1.95.59-2.58 1.33-.56.64-1.04 1.69-.91 2.7.99.08 1.98-.5 2.58-1.23z"></path>
						</svg>
						<span class="text-label-badge text-on-surface-variant">Apple</span>
					</button>
					<button class="h-12 bg-surface-container border border-surface-glass-border hover:border-primary/40 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors text-on-surface" type="button" aria-label="Sign up with Passkey">
						<KeyRound class="w-5 h-5" />
						<span class="text-label-badge text-on-surface-variant">Passkey</span>
					</button>
				</div>

				<a href="/home" class="w-full h-12 rounded-lg bg-surface-container border border-surface-glass-border hover:border-primary/40 transition-colors text-on-surface-variant flex items-center justify-between px-4">
					<span class="flex items-center gap-2">
						<Compass class="w-4 h-4 text-on-surface-variant" />
						<span class="text-body-md font-medium text-on-surface">Continue as Guest</span>
					</span>
					<span class="{MONO} bg-surface-container-high border border-surface-glass-border px-2 py-0.5 rounded text-on-surface-variant">Browse Only</span>
				</a>

				<div class="flex flex-col items-center justify-center gap-1 text-center">
					<p class="text-body-md text-on-surface-variant">
						Already have an account?
						<a class="text-primary font-semibold hover:underline underline-offset-4" href="/auth/login">Login</a>
					</p>
					<p class="{MONO} text-on-surface-variant">Instant gate QR issuance upon zero-friction signup</p>
				</div>
			</div>
		</section>
	</div>

	<footer class="border-t border-surface-glass-border">
		<div class="mx-auto w-full max-w-[1400px] px-6 xl:px-10 py-6 flex flex-col lg:flex-row items-center justify-between gap-3">
			<div class="flex items-center gap-3">
				<span class="font-display font-bold text-on-surface tracking-tight">OWLTSIDE</span>
				<span class="w-px h-4 bg-outline-variant/40"></span>
				<span class="{MONO} text-on-surface-variant">Event Ticketing Architecture</span>
			</div>
			<div class="flex items-center gap-5">
				<span class="flex items-center gap-1.5 {MONO} text-on-surface-variant">
					<span class="w-1.5 h-1.5 rounded-full bg-accent-emerald"></span>
					System Status: 99.98% Optimal
				</span>
				<span class="{MONO} text-on-surface-variant">© {new Date().getFullYear()} Owltside Protocol</span>
			</div>
		</div>
	</footer>
</div>

<div class="md:hidden">

<header class="fixed top-0 inset-x-0 z-50 bg-surface/90 backdrop-blur-xl border-b border-surface-glass-border pt-safe">
	<div class="h-16 px-space-md md:max-w-lg md:mx-auto flex items-center justify-between">
		<div class="flex items-center gap-space-xs">
			<a href="/auth/login" aria-label="Back" class="w-11 h-11 -ml-2 flex items-center justify-center text-on-surface rounded-full hover:bg-surface-container transition-colors">
				<ArrowLeft class="w-5 h-5" />
			</a>
			<h1 class="font-display text-headline-md font-semibold text-on-surface truncate">Create account</h1>
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
				</div>
				<p class="font-display text-headline-lg-mobile text-on-surface font-semibold">Join the night side</p>
				<p class="text-body-sm text-outline max-w-[280px] mt-0.5">
					One account for discovery, instant passes and offline gate entry.
				</p>
			</div>
		</div>

		<form method="POST" action="?/create" use:enhance class="bg-surface-container border border-surface-glass-border rounded-xl p-space-md flex flex-col gap-space-md">
			<div class="flex flex-col gap-1.5">
				<label class="text-label-badge uppercase tracking-wider text-outline" for="name-input">Full Name</label>
				<div class="relative flex items-center">
					<User class="absolute left-3.5 w-5 h-5 text-outline pointer-events-none" />
					<input
						id="name-input"
						name="name"
						type="text"
						required
						placeholder="Ada Obi"
						bind:value={name}
						class="w-full h-12 bg-surface-base border border-surface-glass-border text-on-surface text-body-md rounded-lg pl-11 pr-4 focus:outline-none focus:border-outline transition-colors"
					/>
				</div>
			</div>

			<div class="flex flex-col gap-1.5">
				<label class="text-label-badge uppercase tracking-wider text-outline flex items-center justify-between" for="email-input">
					<span>Email Address</span>
					<span class="text-label-badge text-on-surface transition-opacity {valid ? 'opacity-100' : 'opacity-0'}">Valid</span>
				</label>
				<div class="relative flex items-center">
					<AtSign class="absolute left-3.5 w-5 h-5 text-outline pointer-events-none" />
					<input
						id="email-input"
						name="email"
						type="email"
						required
						inputmode="email"
						placeholder="you@owltside.io"
						bind:value={email}
						class="w-full h-12 bg-surface-base border border-surface-glass-border text-on-surface text-body-md rounded-lg pl-11 pr-10 focus:outline-none focus:border-outline transition-colors"
					/>
					{#if valid}
						<span class="absolute right-3.5 text-accent-emerald"><BadgeCheck class="w-[18px] h-[18px]" /></span>
					{/if}
				</div>
			</div>

			<label class="flex items-start gap-2.5 cursor-pointer select-none">
				<input type="checkbox" bind:checked={terms} required class="mt-0.5 w-4 h-4 rounded accent-[#c0c1ff]" />
				<span class="text-body-sm text-on-surface-variant">
					I agree to the <span class="text-primary font-medium">Terms</span> and
					<span class="text-primary font-medium">Privacy Policy</span>, and I'm 18 or older.
				</span>
			</label>

			{#if form?.error}
				<p class="text-body-sm text-error">{form.error}</p>
			{/if}

			<button
				disabled={!terms}
				class="relative w-full h-12 rounded-lg bg-primary-fixed text-surface-base text-body-lg font-semibold flex items-center justify-center gap-space-xs transition-all active:scale-[0.98] hover:bg-white disabled:opacity-40"
				type="submit"
			>
				<span>Create Account</span>
			</button>
		</form>

		<div class="flex flex-col items-center justify-center gap-1 text-center pt-space-md">
			<p class="text-body-md text-on-surface-variant">
				Already have an account?
				<a class="text-primary font-semibold hover:underline underline-offset-4" href="/auth/login">Login</a>
			</p>
		</div>
	</div>
</main>

</div>
