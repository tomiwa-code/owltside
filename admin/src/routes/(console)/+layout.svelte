<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import Sidebar from '$components/Sidebar.svelte';
	import TopBar from '$components/TopBar.svelte';
	import CommandPalette from '$components/CommandPalette.svelte';
	import { ShieldAlert } from '@lucide/svelte';
	import type { AdminNotificationItem, AdminSession } from '$admin/types';

	let {
		children,
		data
	}: {
		children: Snippet;
		data: {
			admin: AdminSession | null;
			mode: 'live';
			notifications: AdminNotificationItem[];
			counts: {
				pendingEvents: number;
				refunds: number;
				approvals: number;
				reports: number;
				moderation: number;
				notifications: number;
			};
			serverTime: string;
			publicAppUrl: string;
		};
	} = $props();

	onMount(() => {
		// Reaching the console means the session cookie stuck — clear the marker the
		// login screen uses to detect an embedded-preview cookie block.
		// A sandboxed frame throws on any storage access, so never let cleanup
		// take the whole console down with it.
		try {
			sessionStorage.removeItem('owl-admin-login-attempt');
		} catch {
			/* storage unavailable in this context — nothing to clean up */
		}
	});
</script>

{#if data.admin}
	<Sidebar admin={data.admin} counts={data.counts} publicAppUrl={data.publicAppUrl} />
	<div class="flex min-h-dvh flex-col lg:pl-[252px]">
		<TopBar
			admin={data.admin}
			serverTime={data.serverTime}
			alerts={data.counts.notifications}
			initialNotifications={data.notifications}
		/>
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
{:else}
	<!--
		No session on this render. Previously this branch did not exist and the
		layout produced an empty document: a blank screen with no error, no
		redirect and nothing to click. Always render something actionable.
	-->
	<main class="flex min-h-dvh items-center justify-center bg-[#0f0f13] px-4 py-10">
		<div class="w-full max-w-[460px]">
			<section class="panel overflow-hidden">
				<div class="flex items-start gap-3 border-b border-[#26262e] bg-[#1d1d24] px-5 py-4">
					<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-400/30 bg-amber-400/10 text-amber-300">
						<ShieldAlert size={16} />
					</span>
					<div class="min-w-0">
						<p class="font-code text-[8.5px] uppercase tracking-[0.14em] text-[#8f8f9b]">Session not available</p>
						<h1 class="mt-1 font-display text-[19px] font-semibold leading-tight text-[#f1f1f6]">
							The console could not read your session
						</h1>
					</div>
				</div>
				<div class="px-5 py-4">
					<p class="text-[12px] leading-relaxed text-[#a0a0ab]">
						This usually means the session cookie was not sent with the request — common inside an
						embedded preview frame, where browsers treat the cookie as third-party and drop it. Sign in
						again from a top-level tab and the console will load normally.
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-2 border-t border-[#26262e] px-5 py-3">
					<a href="/login" class="btn btn-sm btn-primary">Go to sign in</a>
					<button type="button" class="btn btn-sm" onclick={() => window.location.reload()}>Reload</button>
				</div>
			</section>
		</div>
	</main>
{/if}
