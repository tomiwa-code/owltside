<script lang="ts">
	let {
		name,
		color = '#8083ff',
		src = null,
		imageStyle = '',
		size = 'md'
	}: {
		name: string;
		color?: string;
		src?: string | null;
		imageStyle?: string;
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
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
		<img src={src} alt={name} style={imageStyle} class="w-full h-full rounded-full object-cover ring-1 ring-surface-glass-border" />
	{:else}
		<div
			class="w-full h-full rounded-full flex items-center justify-center font-semibold text-on-primary-container ring-1 ring-surface-glass-border"
			style="background: linear-gradient(135deg, {color}, #0b1326 160%); color: #e1e0ff;"
		>
			{initials}
		</div>
	{/if}
</div>
