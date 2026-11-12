<script lang="ts">
	import { createAppQuery } from '$lib/query/create-query.svelte';

	let {
		fetcher,
		staleTime,
		initialData
	}: { fetcher: () => Promise<string>; staleTime?: number; initialData?: string } = $props();
	const result = createAppQuery(() => ({
		queryKey: ['probe:key'],
		queryFn: fetcher,
		staleTime: staleTime ?? 1_000,
		initialData
	}));
</script>

<span data-testid="status">{result.status}</span>
<span data-testid="data">{result.data ?? ''}</span>
<span data-testid="fetching">{String(result.isFetching)}</span>
