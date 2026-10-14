<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	const session = $derived(page.data.session);
	let pct = $state(0);

	$effect(() => {
		let redirectTimer: ReturnType<typeof setTimeout> | undefined;
		const interval = setInterval(() => {
			pct = Math.min(100, pct + 4 + Math.round(Math.random() * 6));
			if (pct >= 100) {
				clearInterval(interval);
				redirectTimer = setTimeout(
					() => goto(session ? '/home' : '/auth/login', { replaceState: true }),
					350
				);
			}
		}, 60);
		return () => {
			clearInterval(interval);
			if (redirectTimer) clearTimeout(redirectTimer);
		};
	});
</script>

<svelte:head><title>Owltside</title></svelte:head>

<main class="min-h-dvh w-full flex items-center justify-center bg-surface-base px-gutter pt-safe pb-safe">
	<div class="w-full max-w-[13rem] flex flex-col items-center text-center">
		<img src="/logo-stacked.png" alt="Owltside" class="w-28 max-h-28 object-contain" />
		<p class="font-body text-body-sm text-on-surface-variant mt-3 max-w-[12rem] leading-snug">
			Everything happening around you.
		</p>
		<div
			role="progressbar"
			aria-label="Loading Owltside"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={pct}
			class="w-3/4 mt-5 flex flex-col items-center gap-1.5"
		>
			<div class="w-full h-1 bg-surface-container-high border border-surface-glass-border rounded-full overflow-hidden">
				<div class="h-full bg-primary-fixed rounded-full transition-all duration-300" style="width: {pct}%"></div>
			</div>
			<span class="self-end font-code text-label-badge text-on-surface">{pct}%</span>
		</div>
	</div>
</main>
