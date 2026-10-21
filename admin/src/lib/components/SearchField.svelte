<script lang="ts">
	import { Search, X } from '@lucide/svelte';

	let {
		value = '',
		name = 'q',
		placeholder = 'Search…',
		class: className = '',
		onclear
	}: {
		value?: string;
		name?: string;
		placeholder?: string;
		class?: string;
		onclear?: () => void;
	} = $props();
</script>

<label class="relative flex h-[34px] min-w-0 items-center gap-2 rounded-lg border border-[#3a3a44] bg-[#15151a] px-2.5 focus-within:border-[#c6bcff]/50 focus-within:ring-2 focus-within:ring-[#c6bcff]/10 {className}">
	<Search size={13} class="shrink-0 text-[#6f6f7b]" />
	<input
		{name}
		{placeholder}
		{value}
		autocomplete="off"
		class="h-full w-full min-w-0 bg-transparent text-[12px] text-[#ececf1] placeholder:text-[#5d5d69] focus:outline-none"
	/>
	{#if value}
		<button
			type="button"
			class="rounded p-0.5 text-[#6f6f7b] hover:text-white"
			aria-label="Clear search"
			onclick={() => {
				onclear?.();
			}}
		>
			<X size={12} />
		</button>
	{/if}
</label>
