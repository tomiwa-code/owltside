<script lang="ts">
	import { BookmarkCheck, CalendarDays } from '@lucide/svelte';
	import EventRow from '$components/EventRow.svelte';
	import type { EventItem } from '$lib/types';
	import { bookmarks, toggleIn } from '$lib/state/prefs.svelte';
	import { toast } from '$lib/state/toast.svelte';

	let { events }: { events: EventItem[] } = $props();
</script>

<section class="rounded-xl border border-surface-glass-border bg-surface-container p-4 md:p-6">
	<div class="flex items-center justify-between gap-3 pb-4">
		<span class="flex items-center gap-2.5">
			<BookmarkCheck class="w-4.5 h-4.5 text-primary" />
			<span class="font-display text-headline-md text-on-surface">Saved events</span>
		</span>
		<span class="font-code text-label-badge text-on-surface-variant">{events.length} saved</span>
	</div>

	{#if events.length}
		<div class="flex flex-col gap-2.5">
			{#each events as event (event.id)}
				<div class="flex items-center gap-2 min-w-0">
					<div class="flex-1 min-w-0"><EventRow {event} /></div>
					<button
						type="button"
						aria-label="Remove {event.title} from saved events"
						class="w-10 h-10 rounded-lg border border-surface-glass-border bg-surface-container-high text-primary hover:bg-primary/10 flex items-center justify-center shrink-0 transition-colors"
						onclick={() => {
							toggleIn(bookmarks, event.id);
							toast('Removed from saved events', 'info');
						}}
					>
						<BookmarkCheck class="w-4 h-4" />
					</button>
				</div>
			{/each}
		</div>
	{:else}
		<div class="rounded-xl border border-dashed border-outline-variant/50 px-5 py-10 text-center flex flex-col items-center gap-3">
			<span class="w-11 h-11 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center">
				<CalendarDays class="w-5 h-5" />
			</span>
			<p class="font-display text-headline-md text-on-surface">No saved events yet</p>
			<p class="text-body-sm text-on-surface-variant max-w-sm">Bookmark events you want to come back to and they’ll appear here.</p>
			<a href="/explore" class="h-10 px-4 rounded-full bg-primary text-on-primary text-body-sm font-semibold inline-flex items-center">Explore events</a>
		</div>
	{/if}
</section>
