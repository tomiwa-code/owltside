<script lang="ts">
	let { href = '/dashboard', compact = false }: { href?: string; compact?: boolean } = $props();
</script>

<a {href} class="group flex items-center gap-2.5" aria-label="Owltside Admin home">
	<img src="/logo.png" alt="Owltside" class="h-[15px] w-auto opacity-95" />
	{#if !compact}
		<span class="chip ml-0.5 border-[#3a3a44] bg-[#26262e] text-[9px] text-[#b9b9c4]">Admin</span>
	{/if}
</a>
