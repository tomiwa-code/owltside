<script lang="ts">
	import '../app.css';
	import Toasts from '$components/Toasts.svelte';
	import { AlertTriangle, RotateCw } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<title>Owltside Admin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!--
	Last line of defence. A render or mount crash inside a page must never leave
	the operator staring at a white screen with no explanation.
-->
<svelte:boundary>
	{@render children()}

	{#snippet failed(error, reset)}
		<main class="flex min-h-dvh items-center justify-center bg-[#0f0f13] px-4 py-10">
			<div class="w-full max-w-[520px]">
				<section class="panel overflow-hidden">
					<div class="flex items-start gap-3 border-b border-[#26262e] bg-[#1d1d24] px-5 py-4">
						<span
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-300"
						>
							<AlertTriangle size={16} />
						</span>
						<div class="min-w-0">
							<p class="font-code text-[8.5px] uppercase tracking-[0.14em] text-[#8f8f9b]">
								Client fault // recovered
							</p>
							<h1 class="mt-1 font-display text-[19px] font-semibold leading-tight text-[#f1f1f6]">
								This screen failed to render
							</h1>
						</div>
					</div>
					<div class="px-5 py-4">
						<p class="text-[12px] leading-relaxed text-[#a0a0ab]">
							The rest of the console is unaffected. Retry this screen, or return to the dashboard. The
							error has been written to the server log for review.
						</p>
						<pre
							class="mt-3 max-h-[120px] overflow-auto rounded-md border border-[#2a2a32] bg-[#121216] p-2.5 font-code text-[9px] leading-relaxed text-[#8f8f9b]">{(error as Error)?.message ?? String(error)}</pre>
					</div>
					<div class="flex flex-wrap items-center gap-2 border-t border-[#26262e] px-5 py-3">
						<button type="button" class="btn btn-sm btn-primary" onclick={() => reset()}>
							<RotateCw size={12} /> Retry this screen
						</button>
						<a href="/dashboard" class="btn btn-sm">Dashboard</a>
					</div>
				</section>
			</div>
		</main>
	{/snippet}
</svelte:boundary>

<Toasts />
