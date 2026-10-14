<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	let { label, icon, active = false, onclick }: { label: string; icon?: LucideIcon; active?: boolean; onclick?: () => void } = $props();
</script>

<button
	{onclick}
	aria-pressed={active}
	class="shrink-0 px-4 py-2 rounded-full text-label-badge transition-all flex items-center gap-1.5
		{active
			? 'bg-primary text-on-primary font-semibold shadow-sm'
			: 'bg-surface-container text-on-surface-variant hover:text-on-surface'}"
>
	{#if icon}
		{@const Icon = icon}
		<Icon class="w-4 h-4 shrink-0" />
	{/if}
	<span>{label}</span>
</button>
