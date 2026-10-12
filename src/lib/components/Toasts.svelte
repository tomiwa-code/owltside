<script lang="ts">
	import { AlertCircle, CheckCircle2, Info } from '@lucide/svelte';
	import { dismissToast, getToasts } from '$lib/state/toast.svelte';

	const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
	const colors = { success: 'text-accent-emerald', error: 'text-error', info: 'text-tertiary' };
</script>

<div class="fixed top-4 inset-x-0 z-[90] flex flex-col items-center gap-2 px-4 pointer-events-none">
	{#each getToasts() as t (t.id)}
		{@const Icon = icons[t.kind]}
		<button
			onclick={() => dismissToast(t.id)}
			class="pointer-events-auto flex items-center gap-2 max-w-sm w-fit px-4 py-2.5 rounded-full glass text-body-md text-on-surface shadow-lg glow-primary"
		>
			<Icon class="w-4 h-4 {colors[t.kind]}" />
			<span class="truncate">{t.text}</span>
		</button>
	{/each}
</div>
