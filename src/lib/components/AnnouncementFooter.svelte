<script lang="ts">
	import SocialLinks from './SocialLinks.svelte';
</script>

<!-- Kept as the final child of every announcement card in the Activity Hub. -->
<footer
	aria-label="Follow for updates"
	class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-surface-glass-border pt-3"
>
	<p class="text-label-badge font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Follow for updates</p>
	<SocialLinks compact />
</footer>
