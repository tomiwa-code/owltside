<script lang="ts">
	import { ArrowUpRight, CornerDownLeft, Loader2, Search } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { shell } from '$admin/state/shell.svelte';
	import type { SearchHit } from '$admin/server/store';

	let query = $state('');
	let results = $state<SearchHit[]>([]);
	let loading = $state(false);
	let activeIndex = $state(0);
	let input: HTMLInputElement | undefined = $state();

	const quickLinks: SearchHit[] = [
		{ kind: 'Case', id: 'q1', title: 'Ticket lookup & gate verification', subtitle: 'Scan, verify and override passes', href: '/tickets' },
		{ kind: 'Event', id: 'q2', title: 'Pending event reviews', subtitle: '3 events awaiting moderation', href: '/events?status=pending' },
		{ kind: 'Organizer', id: 'q3', title: 'KYB verification queue', subtitle: '14 organizers pending', href: '/organizers?status=pending' },
		{ kind: 'Case', id: 'q4', title: 'Moderation reports', subtitle: '8 active incidents', href: '/moderation' }
	];

	onMount(() => {
		const onKey = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault();
				shell.palette ? shell.closePalette() : shell.openPalette();
			}
			if (event.key === 'Escape' && shell.palette) shell.closePalette();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	$effect(() => {
		if (shell.palette) {
			query = '';
			results = [];
			activeIndex = 0;
			setTimeout(() => input?.focus(), 30);
		}
	});

	$effect(() => {
		const q = query.trim();
		if (q.length < 2) {
			results = [];
			loading = false;
			return;
		}
		loading = true;
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
				if (response.ok) {
					const data = (await response.json()) as { results: SearchHit[] };
					results = data.results;
					activeIndex = 0;
				}
			} catch {
				/* aborted */
			} finally {
				loading = false;
			}
		}, 140);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	const visible = $derived(query.trim().length < 2 ? quickLinks : results);

	function select(hit: SearchHit | undefined) {
		if (!hit) return;
		shell.closePalette();
		goto(hit.href);
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			activeIndex = Math.min(visible.length - 1, activeIndex + 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			activeIndex = Math.max(0, activeIndex - 1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			select(visible[activeIndex]);
		}
	}
</script>

{#if shell.palette}
	<div class="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]">
		<button
			type="button"
			class="absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-[3px] animate-fade-in"
			aria-label="Close search"
			onclick={() => shell.closePalette()}
		></button>
		<div
			class="relative w-full max-w-[620px] overflow-hidden rounded-xl border border-[#34343e] bg-[#15151a] shadow-[0_32px_100px_-20px_rgba(0,0,0,0.9)] animate-fade-up"
			role="dialog"
			aria-modal="true"
			aria-label="Global search"
		>
			<div class="flex items-center gap-3 border-b border-[#2a2a32] px-4 py-3">
				<Search size={15} class="shrink-0 text-[#8f8f9b]" />
				<input
					bind:this={input}
					bind:value={query}
					onkeydown={onKeyDown}
					placeholder="Search events, organizers, tickets, orders, users, logs…"
					class="h-6 w-full bg-transparent text-[13px] text-[#ececf1] placeholder:text-[#62626e] focus:outline-none"
					aria-label="Search query"
				/>
				{#if loading}
					<Loader2 size={13} class="animate-spin text-[#8f8f9b]" />
				{:else}
					<span class="kbd">ESC</span>
				{/if}
			</div>

			<div class="max-h-[52vh] overflow-y-auto p-2">
				{#if visible.length === 0}
					<div class="px-4 py-10 text-center">
						<p class="text-[12.5px] text-[#a0a0ab]">No entities matched “{query}”.</p>
						<p class="mt-1 font-code text-[9.5px] uppercase tracking-[0.1em] text-[#62626e]">
							Try an order ref, ticket code, email or organizer name
						</p>
					</div>
				{:else}
					<p class="mono-label px-2 pb-1.5 pt-1">
						{query.trim().length < 2 ? 'Jump to' : `${visible.length} matches`}
					</p>
					{#each visible as hit, index}
						<button
							type="button"
							class="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors {index ===
							activeIndex
								? 'bg-[#26262f]'
								: 'hover:bg-[#202027]'}"
							onclick={() => select(hit)}
							onmouseenter={() => (activeIndex = index)}
						>
							<span class="chip !h-[18px] !text-[8.5px]">{hit.kind}</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[12px] font-medium text-[#e6e6ec]">{hit.title}</span>
								<span class="block truncate text-[10.5px] text-[#7f7f8c]">{hit.subtitle}</span>
							</span>
							{#if index === activeIndex}
								<CornerDownLeft size={12} class="text-[#8f8f9b]" />
							{:else}
								<ArrowUpRight size={11} class="text-[#4f4f5b]" />
							{/if}
						</button>
					{/each}
				{/if}
			</div>

			<div class="flex items-center justify-between border-t border-[#26262e] px-4 py-2 font-code text-[8.5px] uppercase tracking-[0.1em] text-[#5d5d69]">
				<span>Arrow keys to navigate · Enter to open</span>
				<span>Scoped to production cluster</span>
			</div>
		</div>
	</div>
{/if}
