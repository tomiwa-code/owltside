<script lang="ts">
	import QRCode from 'qrcode';
	import { secondsLeftInWindow, tokenWindow } from '$lib/utils/dates';
	import { signToken } from '$lib/utils/qr';

	/**
	 * Tamper-evident rotating QR pass.
	 * Re-signs every 30 s (HMAC over code + time window); the ring shows the
	 * seconds left in the current window. Intervals are cleaned up on destroy.
	 */
	let {
		code,
		disabled = false,
		disabledLabel = 'Not active'
	}: { code: string; disabled?: boolean; disabledLabel?: string } = $props();

	let dataUrl = $state('');
	let seconds = $state(30);
	let lastWindow = 0;

	async function render() {
		try {
			const payload = await signToken(code);
			dataUrl = await QRCode.toDataURL(payload, {
				margin: 1,
				width: 520,
				color: { dark: '#0b1120', light: '#ffffff' }
			});
		} catch {
			// Ignore canvas errors in headless/test environments without canvas support
		}
	}

	$effect(() => {
		let cancelled = false;
		void (async () => {
			lastWindow = tokenWindow();
			await render();
			if (!cancelled) seconds = secondsLeftInWindow();
		})();
		const iv = setInterval(() => {
			const w = tokenWindow();
			const s = secondsLeftInWindow();
			if (w !== lastWindow && !cancelled) {
				lastWindow = w;
				void render();
			}
			seconds = s;
		}, 1000);
		return () => {
			cancelled = true;
			clearInterval(iv);
		};
	});

	const R = 26;
	const CIRC = 2 * Math.PI * R;
	const dash = $derived(CIRC * (seconds / 30));
</script>

<div class="relative flex items-center justify-center">
	<div
		class="relative bg-white rounded-2xl p-4 {disabled ? 'opacity-40 grayscale' : 'glow-primary'}"
		style="box-shadow: 0 0 24px -4px rgba(99,102,241,0.35);"
	>
		{#if dataUrl}
			<img src={dataUrl} alt="Ticket QR code" class="w-52 h-52 md:w-64 md:h-64" />
		{:else}
			<div class="w-52 h-52 md:w-64 md:h-64 bg-white animate-pulse rounded"></div>
		{/if}
		{#if disabled}
			<div class="absolute inset-0 flex items-center justify-center">
				<span class="px-3 py-1 rounded-full bg-surface-base/90 text-on-surface text-label-badge font-bold uppercase tracking-wider">
					{code === '' ? '' : disabledLabel}
				</span>
			</div>
		{/if}
	</div>
	<div class="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-surface-container border border-surface-glass-border rounded-full px-2.5 py-1.5 flex items-center gap-2">
		<svg width="18" height="18" viewBox="0 0 60 60" class="-rotate-90">
			<circle cx="30" cy="30" r={R} fill="none" stroke="#222a3d" stroke-width="6" />
			<circle
				cx="30"
				cy="30"
				r={R}
				fill="none"
				stroke={seconds <= 5 ? '#ffb4ab' : '#4cd7f6'}
				stroke-width="6"
				stroke-linecap="round"
				stroke-dasharray="{dash} {CIRC}"
			/>
		</svg>
		<span class="font-code text-label-code text-on-surface tabular-nums">{seconds}s</span>
	</div>
</div>
