<script lang="ts">
	import { Search, SlidersHorizontal } from '@lucide/svelte';

	let {
		value,
		oninput,
		onFilter,
		placeholder = 'Search artists, tech summits, venues...'
	}: {
		value: string;
		oninput: (v: string) => void;
		onFilter?: () => void;
		placeholder?: string;
	} = $props();
</script>

<div class="relative w-full">
	<Search class="absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant w-5 h-5 pointer-events-none" />
	<input
		type="search"
		{placeholder}
		{value}
		oninput={(e) => oninput(e.currentTarget.value)}
		class="w-full h-11 pl-10 pr-10 rounded-full bg-surface-container-low text-on-surface placeholder:text-outline-variant text-body-md focus:outline-none focus:bg-surface-container transition-colors"
	/>
	{#if onFilter}
		<button
			aria-label="Filter events"
			onclick={onFilter}
			class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface hover:text-primary"
		>
			<SlidersHorizontal class="w-4 h-4" />
		</button>
	{/if}
</div>
