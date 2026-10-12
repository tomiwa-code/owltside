<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, AtSign, BadgeCheck, MoonStar, User } from '@lucide/svelte';

	let { form } = $props();
	let email = $state('');
	let name = $state('');
	let terms = $state(false);
	const valid = $derived(/^\S+@\S+\.\S+$/.test(email));
</script>

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
