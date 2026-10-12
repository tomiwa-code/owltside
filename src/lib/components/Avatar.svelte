<script lang="ts">
	let {
		name,
		color = '#8083ff',
		src = null,
		size = 'md',
		online = false
	}: {
		name: string;
		color?: string;
		src?: string | null;
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
		online?: boolean;
	} = $props();

	const sizes = {
		xs: 'w-7 h-7 text-[10px]',
		sm: 'w-8 h-8 text-xs',
		md: 'w-10 h-10 text-sm',
		lg: 'w-14 h-14 text-lg',
		xl: 'w-20 h-20 text-2xl'
	} as const;

	const initials = $derived(
		name
			.split(/\s+/)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.join('')
	);
</script>

<div class="relative shrink-0 {sizes[size]}">
	{#if src}
		<img src={src} alt={name} class="w-full h-full rounded-full object-cover ring-1 ring-surface-glass-border" />
	{:else}
		<div
			class="w-full h-full rounded-full flex items-center justify-center font-semibold text-on-primary-container ring-1 ring-surface-glass-border"
			style="background: linear-gradient(135deg, {color}, #0b1326 160%); color: #e1e0ff;"
		>
			{initials}
		</div>
	{/if}
	{#if online}
		<span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-accent-emerald ring-2 ring-surface-base"></span>
	{/if}
</div>
