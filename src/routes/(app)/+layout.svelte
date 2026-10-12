<script lang="ts">
	import BottomNav from '$components/BottomNav.svelte';

	let { children } = $props();
</script>

<div class="md:pl-20">
	{@render children()}
	<BottomNav />
</div>
