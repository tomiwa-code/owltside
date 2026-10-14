<script lang="ts">
	import { onMount } from 'svelte';
	import { RefreshCw } from '@lucide/svelte';

	const threshold = 54;
	const maxPull = 112;
	let pullDistance = $state(0);
	let refreshing = $state(false);
	let start: { x: number; y: number } | null = null;
	let scrollTarget: HTMLElement | null = null;
	let reloadTimer: ReturnType<typeof setTimeout> | undefined;

	function findScrollTarget(target: Element): HTMLElement {
		let current: Element | null = target;
		while (current && current !== document.body && current !== document.documentElement) {
			if (current instanceof HTMLElement) {
				const overflowY = getComputedStyle(current).overflowY;
				if (
					(overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
					current.scrollHeight > current.clientHeight + 2
				) {
					return current;
				}
			}
			current = current.parentElement;
		}
		return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
	}

	function isAtTop(element: HTMLElement): boolean {
		const top = element === document.scrollingElement ? Math.max(element.scrollTop, window.scrollY) : element.scrollTop;
		return top <= 1;
	}

	onMount(() => {
		const isMobile = () => window.matchMedia('(max-width: 767px)').matches;

		function onTouchStart(event: TouchEvent) {
			if (!isMobile() || refreshing || event.touches.length !== 1 || !(event.target instanceof Element)) return;
			if (event.target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="slider"]')) return;

			const target = findScrollTarget(event.target);
			if (!isAtTop(target)) return;
			scrollTarget = target;
			start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
		}

		function onTouchMove(event: TouchEvent) {
			if (!start || !scrollTarget || refreshing || event.touches.length !== 1) return;
			const touch = event.touches[0];
			const dx = touch.clientX - start.x;
			const dy = touch.clientY - start.y;

			// Leave horizontal carousels/swipes alone.
			if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
				start = null;
				scrollTarget = null;
				pullDistance = 0;
				return;
			}
			if (dy <= 0) {
				pullDistance = 0;
				return;
			}
			if (!isAtTop(scrollTarget)) {
				start = null;
				scrollTarget = null;
				pullDistance = 0;
				return;
			}
			if (dy > 6) event.preventDefault();
			pullDistance = Math.min(maxPull, dy * 0.58);
		}

		function finishPull() {
			if (!start) return;
			start = null;
			scrollTarget = null;
			if (pullDistance >= threshold) {
				refreshing = true;
				pullDistance = threshold;
				reloadTimer = setTimeout(() => window.location.reload(), 180);
			} else {
				pullDistance = 0;
			}
		}

		function cancelPull() {
			start = null;
			scrollTarget = null;
			if (!refreshing) pullDistance = 0;
		}

		window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
		window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
		window.addEventListener('touchend', finishPull, { capture: true, passive: true });
		window.addEventListener('touchcancel', cancelPull, { capture: true, passive: true });

		return () => {
			window.removeEventListener('touchstart', onTouchStart, true);
			window.removeEventListener('touchmove', onTouchMove, true);
			window.removeEventListener('touchend', finishPull, true);
			window.removeEventListener('touchcancel', cancelPull, true);
			if (reloadTimer) clearTimeout(reloadTimer);
		};
	});
</script>

{#if pullDistance > 0 || refreshing}
	<div
		class="pointer-events-none fixed left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-1 rounded-full border border-surface-glass-border bg-surface-container px-3 py-2 text-label-badge text-on-surface shadow-xl md:hidden"
		style={`top: calc(env(safe-area-inset-top) + 0.5rem); transform: translate(-50%, ${Math.min(pullDistance * 0.55, 62)}px);`}
		aria-live="polite"
		role="status"
	>
		<RefreshCw class={`h-4 w-4 text-primary ${refreshing ? 'animate-spin' : ''}`} />
		<span>{refreshing ? 'Reloading…' : pullDistance >= threshold ? 'Release to reload' : 'Pull down to refresh'}</span>
	</div>
{/if}
