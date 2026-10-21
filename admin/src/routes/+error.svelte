<script lang="ts">
	import { page } from '$app/state';
	import Logo from '$components/Logo.svelte';
	import { ArrowLeft, ShieldAlert } from '@lucide/svelte';

	const status = $derived(page.status);
	const title = $derived(
		status === 404
			? 'Record not found'
			: status === 403
				? 'Insufficient clearance'
				: status === 401
					? 'Session required'
					: status >= 500
						? 'Control plane fault'
						: 'Request rejected'
	);
	const message = $derived(
		page.error?.message && page.error.message !== 'Not Found'
			? page.error.message
			: status === 404
				? 'That dossier, ledger entry or ticket is not in this control plane. It may have been archived or the reference is mistyped.'
				: 'The gateway declined this request. Retry, or escalate to the on-call platform engineer with the trace below.'
	);
	const requestId = $derived(`req_${Math.abs(status * 7919).toString(36)}-${status}`);
</script>

<svelte:head>
	<title>{status} · {title} · Owltside Admin</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-[#0f0f13] px-4 py-10">
	<div class="w-full max-w-[520px]">
		<div class="mb-6 flex items-center justify-between">
			<Logo href="/dashboard" />
			<span class="font-code text-[8.5px] uppercase tracking-[0.14em] text-[#6f6f7b]">Node WAT-01</span>
		</div>

		<section class="panel overflow-hidden">
			<div class="flex items-start gap-3 border-b border-[#26262e] bg-[#1d1d24] px-5 py-4">
				<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-300">
					<ShieldAlert size={16} />
				</span>
				<div class="min-w-0">
					<p class="font-code text-[8.5px] uppercase tracking-[0.14em] text-[#8f8f9b]">HTTP {status} // gateway response</p>
					<h1 class="mt-1 font-display text-[21px] font-semibold leading-tight text-[#f1f1f6]">{title}</h1>
				</div>
			</div>

			<div class="px-5 py-4">
				<p class="text-[12.5px] leading-relaxed text-[#a0a0ab]">{message}</p>

				<dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[#26262e] pt-3 font-code text-[9px] uppercase tracking-[0.08em]">
					<div>
						<dt class="text-[#6f6f7b]">Request signature</dt>
						<dd class="mt-0.5 normal-case tracking-normal text-[#c9c9d4]">{requestId}</dd>
					</div>
					<div>
						<dt class="text-[#6f6f7b]">Path</dt>
						<dd class="mt-0.5 truncate normal-case tracking-normal text-[#c9c9d4]">{page.url.pathname}</dd>
					</div>
				</dl>
			</div>

			<div class="flex flex-wrap items-center justify-between gap-2 border-t border-[#26262e] px-5 py-3">
				<a href="/dashboard" class="btn btn-sm btn-primary"><ArrowLeft size={12} /> Return to dashboard</a>
				<a href="/search" class="font-code text-[8.5px] uppercase tracking-[0.1em] text-[#c6bcff] hover:underline">Search HUD ↗</a>
			</div>
		</section>

		<p class="mt-4 text-center font-code text-[8px] uppercase tracking-[0.14em] text-[#54545f]">
			Every request is signed and appended to the immutable audit ledger · SOC-2 Type II
		</p>
	</div>
</main>
