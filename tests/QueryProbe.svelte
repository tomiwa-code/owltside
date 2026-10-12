<script lang="ts">
	import { useQuery } from '$lib/state/query.svelte';

	let { fetcher, staleTime }: { fetcher: () => Promise<string>; staleTime?: number } = $props();
	const result = useQuery('probe:key', fetcher, { staleTime: staleTime ?? 1_000 });
</script>

<span data-testid="status">{result.status}</span>
<span data-testid="data">{result.data ?? ''}</span>
