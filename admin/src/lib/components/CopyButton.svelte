<script lang="ts">
	import { Check, Copy } from '@lucide/svelte';
	import { toasts } from '$admin/state/toast.svelte';

	let { value, label = 'Copy', compact = false }: { value: string; label?: string; compact?: boolean } = $props();
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			toasts.error('Clipboard unavailable', 'Select the value and copy manually.');
		}
	}
</script>

<button type="button" class="btn btn-sm {compact ? 'btn-ghost !px-1.5' : 'btn-ghost'}" onclick={copy} aria-label={label}>
	{#if copied}
		<Check size={12} class="text-emerald-400" />
	{:else}
		<Copy size={12} />
	{/if}
	{#if !compact}
		<span>{copied ? 'Copied' : label}</span>
	{/if}
</button>
