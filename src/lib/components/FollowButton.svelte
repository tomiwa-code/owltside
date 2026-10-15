<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/state/toast.svelte';
	let { profileId, class: cls = '' }: { profileId: string; class?: string } = $props();
	let busy = $state(false);
	const following = $derived((page.data.followingIds ?? []).includes(profileId));
	async function toggle() {
		if (busy) return;
		if (!page.data.session) { toast('Sign in to follow people.', 'info'); return; }
		busy = true;
		try {
			const res = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/follow`, {
				method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ following: !following })
			});
			const result = await res.json();
			if (!res.ok) throw new Error(result.error ?? 'Could not update follow status.');
			await invalidateAll();
		} catch (error) { toast(error instanceof Error ? error.message : 'Could not update follow status.', 'error'); }
		finally { busy = false; }
	}
</script>

{#if profileId !== page.data.session?.userId}
	<button type="button" class="h-9 px-4 rounded-full border border-primary/30 bg-primary/10 text-primary text-body-sm font-semibold disabled:opacity-60 {cls}" aria-pressed={following} aria-busy={busy} disabled={busy || page.data.followLoadError} title={page.data.followLoadError ? 'Follow status unavailable. Refresh to retry.' : undefined} onclick={toggle}>
		{busy ? 'Saving…' : following ? 'Following' : 'Follow'}
	</button>
{/if}
