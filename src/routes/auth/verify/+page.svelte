<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, ShieldCheck } from '@lucide/svelte';

	let { data, form } = $props();

	const digits = $state<string[]>(['', '', '', '', '', '']);
	let inputs: Array<HTMLInputElement | null> = [];
	const code = $derived(digits.join(''));
	const complete = $derived(code.length === 6);

	function onInput(i: number, e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const v = el.value.replace(/\D/g, '');
		if (!v) {
			digits[i] = '';
			return;
		}
		// paste support: spread across boxes
		const chars = v.slice(0, 6 - i).split('');
		chars.forEach((c, k) => (digits[i + k] = c));
		const next = Math.min(5, i + chars.length);
		inputs[next]?.focus();
	}

	function onKey(i: number, e: KeyboardEvent) {
		if (e.key === 'Backspace' && !digits[i] && i > 0) inputs[i - 1]?.focus();
	}
</script>

<header class="fixed top-0 inset-x-0 z-50 bg-surface/90 backdrop-blur-xl border-b border-surface-glass-border pt-safe">
	<div class="h-16 px-space-md md:max-w-lg md:mx-auto flex items-center">
		<a href="/auth/login" aria-label="Back" class="w-11 h-11 -ml-2 flex items-center justify-center text-on-surface rounded-full hover:bg-surface-container transition-colors">
			<ArrowLeft class="w-5 h-5" />
		</a>
		<h1 class="font-display text-headline-md font-semibold text-on-surface truncate">Verify it's you</h1>
	</div>
</header>

<main class="flex-1 flex flex-col relative w-full pt-16 pb-safe bg-surface min-h-dvh">
	<div class="flex flex-col w-full px-gutter md:max-w-lg md:mx-auto pb-space-xl">
		<div class="flex flex-col items-center text-center mt-space-lg mb-space-md">
			<div class="w-14 h-14 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center mb-space-sm glow-primary">
				<ShieldCheck class="w-7 h-7" />
			</div>
			<p class="font-display text-headline-lg-mobile text-on-surface font-semibold">
				{data.isNew ? 'Confirm your email' : 'Enter login code'}
			</p>
			<p class="text-body-sm text-outline max-w-[300px] mt-1">
				We sent a 6-digit code to <span class="text-on-surface font-medium">{data.email || 'your email'}</span>.
				{#if !data.email}
					<span class="block mt-1">No email set — demo mode accepts any code.</span>
				{/if}
			</p>
			<p class="mt-2 font-code text-label-code text-tertiary bg-tertiary/10 border border-tertiary/20 px-2.5 py-1 rounded-full">
				DEMO HINT: ANY 6 DIGITS WORK, E.G. 000000
			</p>
		</div>

		<form method="POST" action="?/verify" use:enhance class="flex flex-col gap-space-md">
			<input type="hidden" name="email" value={data.email} />
			<input type="hidden" name="code" value={code} />
			<div class="flex items-center justify-center gap-2">
				{#each digits as d, i (i)}
					<input
						bind:this={inputs[i]}
						value={d}
						oninput={(e) => onInput(i, e)}
						onkeydown={(e) => onKey(i, e)}
						inputmode="numeric"
						maxlength="6"
						aria-label="Digit {i + 1}"
						class="w-11 h-14 md:w-12 text-center bg-surface-base border border-surface-glass-border rounded-lg font-code text-headline-md text-on-surface focus:outline-none focus:border-primary transition-colors"
					/>
				{/each}
			</div>
			{#if form?.error}
				<p class="text-body-sm text-error text-center">{form.error}</p>
			{/if}
			<button
				disabled={!complete}
				class="w-full h-12 rounded-full bg-primary text-on-primary font-semibold text-body-md flex items-center justify-center transition-all active:scale-[0.98] disabled:opacity-40 glow-primary"
				type="submit"
			>
				Verify & Enter
			</button>
			<button class="text-body-sm text-on-surface-variant hover:text-on-surface mx-auto" type="button">
				Resend code
			</button>
		</form>
	</div>
</main>
