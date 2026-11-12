<script lang="ts">
	import { browser } from '$app/environment';
	import { createAppQuery } from '$lib/query/create-query.svelte';
	import Sheet from './Sheet.svelte';
	import Avatar from './Avatar.svelte';
	import FollowButton from './FollowButton.svelte';
	import { connectionsQueryOptions } from '$lib/query/options';
	let { open, profileId, kind, close }: { open: boolean; profileId: string; kind: 'followers' | 'following'; close: () => void } = $props();
	// Only fetch while the sheet is open; TanStack keeps the list for a minute so
	// reopening it (or switching back and forth) does not hit the network again.
	const usersQuery = createAppQuery(() => ({
		...connectionsQueryOptions(profileId, kind),
		enabled: browser && open && !!profileId
	}));
	const users = $derived(usersQuery.data ?? []);
	const loading = $derived(open && usersQuery.isPending);
	const error = $derived(usersQuery.error ? 'Could not load this list. Please try again.' : '');
</script>
<Sheet {open} title={kind === 'followers' ? 'Followers' : 'Following'} {close}>
	<div class="flex flex-col gap-3" aria-live="polite" aria-busy={loading}>
		{#if loading}<p class="p-6 text-on-surface-variant">Loading people…</p>
		{:else if error}<p role="alert" class="text-error">{error}</p><button type="button" class="text-primary" onclick={() => void usersQuery.refetch()}>Try again</button>
		{:else}
			{#each users as user (user.id)}
				<div class="flex items-center gap-3 rounded-xl border border-surface-glass-border p-3">
					<a href="/users/{user.handle}" onclick={close} class="flex flex-1 min-w-0 items-center gap-3">
						<Avatar name={user.name} src={user.avatarUrl} color={user.avatarColor} />
						<span class="min-w-0"><span class="block truncate font-semibold">{user.name}</span><span class="text-on-surface-variant text-body-sm">@{user.handle}</span></span>
					</a>
					<FollowButton profileId={user.id} />
				</div>
			{:else}<p class="p-6 text-center text-on-surface-variant">{kind === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</p>{/each}
		{/if}
	</div>
</Sheet>
