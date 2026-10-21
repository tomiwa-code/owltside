<script lang="ts">
	import { moneyCompact, shortDate, date as fmtDate, num } from '$admin/utils/format';

	let {
		data,
		primaryLabel = 'Gross revenue',
		secondaryLabel = 'Payouts',
		height = 236,
		accent = '#c6bcff',
		secondaryColor = '#7dd3fc',
		showSecondary = true,
		currency = true
	}: {
		data: { day: string; value: number; secondary?: number }[];
		primaryLabel?: string;
		secondaryLabel?: string;
		height?: number;
		accent?: string;
		secondaryColor?: string;
		showSecondary?: boolean;
		currency?: boolean;
	} = $props();

	const W = 780;
	const H = 250;
	const pad = { top: 22, right: 10, bottom: 28, left: 46 };
	const plotW = W - pad.left - pad.right;
	const plotH = H - pad.top - pad.bottom;

	let hover = $state<number | null>(null);

	const maxPrimary = $derived(Math.max(1, ...data.map((d) => d.value)) * 1.15);
	const maxSecondary = $derived(Math.max(1, ...data.map((d) => d.secondary ?? 0)) * 1.15);
	const slot = $derived(plotW / Math.max(1, data.length));
	const barWidth = $derived(Math.min(20, slot * 0.5));

	const formatValue = (value: number) => (currency ? moneyCompact(value) : num(value));

	const bars = $derived(
		data.map((d, i) => {
			const h = (d.value / maxPrimary) * plotH;
			return {
				x: pad.left + i * slot + slot / 2 - barWidth / 2,
				y: pad.top + plotH - h,
				h: Math.max(1, h),
				mid: pad.left + i * slot + slot / 2
			};
		})
	);

	const linePoints = $derived(
		data.map((d, i) => {
			const x = pad.left + i * slot + slot / 2;
			const y = pad.top + plotH - ((d.secondary ?? 0) / maxSecondary) * plotH;
			return { x, y };
		})
	);

	const linePath = $derived.by(() => {
		if (linePoints.length < 2) return '';
		return linePoints
			.map((point, index) => {
				if (index === 0) return `M ${point.x} ${point.y}`;
				const prev = linePoints[index - 1];
				const cx = (prev.x + point.x) / 2;
				return `C ${cx} ${prev.y}, ${cx} ${point.y}, ${point.x} ${point.y}`;
			})
			.join(' ');
	});

	const xLabels = $derived(
		data
			.map((d, i) => ({ ...d, i }))
			.filter((_, index) => index % Math.max(1, Math.ceil(data.length / 6)) === 0 || index === data.length - 1)
	);

	const yTicks = $derived([0.25, 0.5, 0.75, 1].map((ratio) => ({ ratio, value: maxPrimary * ratio })));

	const active = $derived(hover !== null ? data[hover] : data[data.length - 1]);
	const activeBar = $derived(bars[hover !== null ? hover : data.length - 1]);

	function handleMove(event: MouseEvent) {
		const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
		const relative = ((event.clientX - rect.left) / rect.width) * W;
		const index = Math.floor((relative - pad.left) / slot);
		hover = Math.min(data.length - 1, Math.max(0, index));
	}
</script>

<div class="w-full">
	<div class="mb-1 flex items-center gap-4 px-1">
		<span class="inline-flex items-center gap-1.5 font-code text-[9.5px] uppercase tracking-[0.08em] text-[#8f8f9b]">
			<span class="h-1.5 w-1.5 rounded-sm" style={`background:${accent}`}></span>{primaryLabel}
		</span>
		{#if showSecondary}
			<span class="inline-flex items-center gap-1.5 font-code text-[9.5px] uppercase tracking-[0.08em] text-[#8f8f9b]">
				<span class="h-1.5 w-1.5 rounded-sm" style={`background:${secondaryColor}`}></span>{secondaryLabel}
			</span>
		{/if}
	</div>
	<svg
		viewBox={`0 0 ${W} ${H}`}
		style={`height:${height}px`}
		class="w-full touch-none"
		role="img"
		aria-label={`${primaryLabel} over ${data.length} days`}
		onmousemove={handleMove}
		onmouseleave={() => (hover = null)}
	>
		<defs>
			<linearGradient id="revenue-bar" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color={accent} stop-opacity="0.85" />
				<stop offset="100%" stop-color={accent} stop-opacity="0.12" />
			</linearGradient>
			<linearGradient id="revenue-bar-dim" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="#4b4b58" stop-opacity="0.9" />
				<stop offset="100%" stop-color="#3a3a45" stop-opacity="0.45" />
			</linearGradient>
			<linearGradient id="revenue-area" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color={secondaryColor} stop-opacity="0.16" />
				<stop offset="100%" stop-color={secondaryColor} stop-opacity="0" />
			</linearGradient>
		</defs>

		{#each yTicks as tick}
			<line
				x1={pad.left}
				x2={W - pad.right}
				y1={pad.top + plotH - tick.ratio * plotH}
				y2={pad.top + plotH - tick.ratio * plotH}
				stroke="#2a2a32"
				stroke-width="1"
				stroke-dasharray="3 5"
			/>
			<text
				x={pad.left - 10}
				y={pad.top + plotH - tick.ratio * plotH + 3}
				text-anchor="end"
				fill="#63636f"
				font-family="JetBrains Mono, monospace"
				font-size="8.5"
			>
				{formatValue(tick.value)}
			</text>
		{/each}

		{#each bars as bar, i}
			<rect
				x={bar.x}
				y={bar.y}
				width={barWidth}
				height={bar.h}
				rx="2.5"
				fill={hover === i || (hover === null && i === bars.length - 1) ? 'url(#revenue-bar)' : 'url(#revenue-bar-dim)'}
				opacity={hover === null || hover === i ? 1 : 0.55}
			/>
		{/each}

		{#if showSecondary}
			<path d={linePath} fill="none" stroke={secondaryColor} stroke-width="1.5" stroke-dasharray="4 4" opacity="0.85" />
			{#each linePoints as point, i}
				{#if i === linePoints.length - 1 || i === hover}
					<circle cx={point.x} cy={point.y} r="2.6" fill="#0f0f13" stroke={secondaryColor} stroke-width="1.6" />
				{/if}
			{/each}
		{/if}

		{#each xLabels as label}
			<text
				x={pad.left + label.i * slot + slot / 2}
				y={H - 8}
				text-anchor="middle"
				fill="#63636f"
				font-family="JetBrains Mono, monospace"
				font-size="8.5"
			>
				{shortDate(label.day)}
			</text>
		{/each}

		{#if active && activeBar}
			{@const tooltipWidth = 150}
			{@const tooltipX = Math.min(W - tooltipWidth - 8, Math.max(4, activeBar.mid - tooltipWidth / 2))}
			<g>
				<rect x={tooltipX} y="2" width={tooltipWidth} height="52" rx="6" fill="#232330" stroke="#3c3c48" />
				<text x={tooltipX + 9} y="17" fill="#8f8f9b" font-family="JetBrains Mono, monospace" font-size="8" letter-spacing="0.6">
					{fmtDate(active.day).toUpperCase()}
				</text>
				<text x={tooltipX + 9} y="32" fill="#ececf1" font-family="Inter, sans-serif" font-size="9.5" font-weight="600">
					{formatValue(active.value)}
				</text>
				{#if showSecondary}
					<text x={tooltipX + 9} y="45" fill="#7dd3fc" font-family="JetBrains Mono, monospace" font-size="8">
						{num(active.secondary ?? 0)} {secondaryLabel.toLowerCase()}
					</text>
				{/if}
			</g>
		{/if}
	</svg>
</div>
