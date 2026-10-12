<script lang="ts">
	let { label, active = false, onclick }: { label: string; active?: boolean; onclick?: () => void } = $props();
</script>

<button
	{onclick}
	aria-pressed={active}
	class="shrink-0 px-4 py-2 rounded-full text-label-badge transition-all flex items-center gap-1.5
		{active
			? 'bg-primary text-on-primary font-semibold shadow-sm'
			: 'bg-surface-container text-on-surface-variant hover:text-on-surface'}"
>
	<span>{label}</span>
</button>
