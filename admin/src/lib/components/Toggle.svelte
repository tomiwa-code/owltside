<script lang="ts">
	let {
		checked = false,
		onchange,
		label,
		disabled = false
	}: { checked?: boolean; onchange?: (value: boolean) => void; label?: string; disabled?: boolean } = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	disabled={disabled}
	class="toggle-track {disabled ? 'cursor-not-allowed opacity-50' : ''}"
	data-on={checked}
	onclick={() => onchange?.(!checked)}
>
	<span class="toggle-thumb"></span>
</button>
