<script lang="ts">
	let {
		value,
		size = 44,
		stroke = 4,
		label,
		tone = '#c6bcff'
	}: { value: number; size?: number; stroke?: number; label?: string; tone?: string } = $props();

	const radius = $derived((size - stroke) / 2);
	const circumference = $derived(2 * Math.PI * radius);
	const offset = $derived(circumference * (1 - Math.min(100, Math.max(0, value)) / 100));
</script>

<div class="relative inline-flex items-center justify-center" style={`width:${size}px;height:${size}px`} aria-label={`${Math.round(value)} percent`}>
	<svg width={size} height={size} class="-rotate-90">
		<circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#2c2c34" stroke-width={stroke} />
		<circle
			cx={size / 2}
			cy={size / 2}
			r={radius}
			fill="none"
			stroke={tone}
			stroke-width={stroke}
			stroke-linecap="round"
			stroke-dasharray={circumference}
			stroke-dashoffset={offset}
		/>
	</svg>
	<span class="absolute font-code text-[9px] font-medium text-[#c9c9d4]">{label ?? `${Math.round(value)}%`}</span>
</div>
