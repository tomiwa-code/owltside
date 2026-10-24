<script lang="ts">
	let {
		values,
		width = 120,
		height = 26,
		stroke = '#c6bcff',
		fill = false
	}: { values: number[]; width?: number; height?: number; stroke?: string; fill?: boolean } = $props();

	const points = $derived.by(() => {
		if (!values.length) return '';
		const max = Math.max(...values);
		const min = Math.min(...values);
		const span = max - min || 1;
		return values
			.map((value, index) => {
				const x = (index / Math.max(1, values.length - 1)) * width;
				const y = height - 2 - ((value - min) / span) * (height - 4);
				return `${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(' ');
	});

	const area = $derived(points ? `${points} ${width},${height} 0,${height}` : '');
	const id = $derived(`spark-${Math.random().toString(36).slice(2, 8)}`);
</script>

<svg viewBox={`0 0 ${width} ${height}`} class="h-full w-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
	<defs>
		<linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" stop-color={stroke} stop-opacity="0.28" />
			<stop offset="100%" stop-color={stroke} stop-opacity="0" />
		</linearGradient>
	</defs>
	{#if fill && area}
		<polygon points={area} fill={`url(#${id})`} />
	{/if}
	<polyline points={points} fill="none" stroke={stroke} stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" />
</svg>
