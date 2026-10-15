<script lang="ts">
	import Sheet from './Sheet.svelte';
	import Avatar from './Avatar.svelte';
	import FollowButton from './FollowButton.svelte';
	import type { Profile } from '$lib/types';
	let { open, profileId, kind, close }: { open: boolean; profileId: string; kind: 'followers' | 'following'; close: () => void } = $props();
	let users = $state<Profile[]>([]);
	let loading = $state(false);
	let error = $state('');
	let retry = $state(0);
	$effect(() => {
		if (!open || !profileId) return;
		const controller = new AbortController();
		const id = profileId; const list = kind; retry;
		loading = true; error = ''; users = [];
		fetch(`/api/profiles/${encodeURIComponent(id)}/connections?kind=${list}`, { signal: controller.signal })
			.then(async (res) => { if (!res.ok) throw new Error('Could not load this list. Please try again.'); return res.json(); })
			.then((data) => { users = data; })
			.catch((err) => { if (!controller.signal.aborted) error = err.message; })
			.finally(() => { if (!controller.signal.aborted) loading = false; });
		return () => controller.abort();
	});
</script>
<Sheet {open} title={kind === 'followers' ? 'Followers' : 'Following'} {close}>
	<div class="flex flex-col gap-3" aria-live="polite" aria-busy={loading}>
		{#if loading}<p class="p-6 text-on-surface-variant">Loading people…</p>
		{:else if error}<p role="alert" class="text-error">{error}</p><button type="button" class="text-primary" onclick={() => retry++}>Try again</button>
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
