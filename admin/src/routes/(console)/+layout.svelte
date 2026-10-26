<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import Sidebar from '$components/Sidebar.svelte';
	import TopBar from '$components/TopBar.svelte';
	import CommandPalette from '$components/CommandPalette.svelte';
	import type { AdminSession } from '$admin/types';

	let { children, data }: { children: Snippet; data: { admin: AdminSession | null; mode: 'live' | 'demo'; counts: { pendingEvents: number; refunds: number; moderation: number }; serverTime: string; publicAppUrl: string } } =
		$props();

	onMount(() => {
		// Reaching the console means the session cookie stuck — clear the marker the
		// login screen uses to detect an embedded-preview cookie block.
		sessionStorage.removeItem('owl-admin-login-attempt');
	});
</script>

{#if data.admin}
	<Sidebar admin={data.admin} counts={data.counts} publicAppUrl={data.publicAppUrl} />
	<div class="flex min-h-dvh flex-col lg:pl-[252px]">
		<TopBar admin={data.admin} serverTime={data.serverTime} alerts={data.counts.moderation + data.counts.refunds} />
		{#if data.mode === 'demo'}
			<div class="border-b border-amber-400/25 bg-amber-400/[0.06] px-4 py-2 font-code text-[9px] uppercase tracking-[0.08em] text-amber-200 sm:px-6">
				Demo seed data active · Supabase URL and server service key were not found in the repository-root or admin .env files.
			</div>
		{/if}
		<main class="mx-auto w-full max-w-[1580px] flex-1 px-3.5 pb-10 pt-4 sm:px-5 lg:px-7 lg:pb-14 lg:pt-5">
			{@render children()}
		</main>
		<footer
			class="mx-auto flex w-full max-w-[1580px] flex-col gap-1.5 border-t border-[#22222a] px-4 py-4 font-code text-[8.5px] uppercase tracking-[0.12em] text-[#54545f] sm:flex-row sm:items-center sm:justify-between sm:px-7"
		>
			<span>Owltside control plane · FIDO2 enforced · SOC-2 Type II</span>
			<span class="flex items-center gap-2">
				<span>TLS 1.3</span><span class="text-[#33333d]">•</span>
				<span>Build 4.18.2-prod</span><span class="text-[#33333d]">•</span>
				<span>US-WEST-LAGOS-01</span>
			</span>
		</footer>
	</div>
	<CommandPalette />
{/if}
