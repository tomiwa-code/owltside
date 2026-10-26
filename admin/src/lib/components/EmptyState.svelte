<script lang="ts">
	import { Inbox } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let {
		title = 'Nothing here yet',
		message,
		action
	}: { title?: string; message?: string; action?: Snippet } = $props();
</script>

<div class="flex flex-col items-center justify-center px-6 py-14 text-center">
	<div class="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-[#33333d] bg-[#1e1e25] text-[#7a7a87]">
		<Inbox size={18} />
	</div>
	<p class="font-display text-[14px] font-medium text-[#dcdce4]">{title}</p>
	{#if message}
		<p class="mt-1 max-w-sm text-[11.5px] leading-relaxed text-[#7c7c89]">{message}</p>
	{/if}
	{#if action}
		<div class="mt-4">{@render action()}</div>
	{/if}
</div>
