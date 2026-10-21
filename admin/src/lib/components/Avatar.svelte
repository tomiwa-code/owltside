<script lang="ts">
	import { initials as toInitials } from '$admin/utils/format';

	let {
		name,
		size = 'md',
		accent = false,
		square = false
	}: { name: string; size?: 'xs' | 'sm' | 'md' | 'lg'; accent?: boolean; square?: boolean } = $props();

	const sizes = {
		xs: 'h-6 w-6 text-[9px]',
		sm: 'h-7 w-7 text-[10px]',
		md: 'h-9 w-9 text-[12px]',
		lg: 'h-12 w-12 text-[15px]'
	} as const;

	const initials = $derived(toInitials(name));
	const hue = $derived([...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4);
	const backgrounds = [
		'bg-[#2c2c36] text-[#c9c9d4]',
		'bg-[#2b2b3b] text-[#c6bcff]',
		'bg-[#26302f] text-[#9ed8c8]',
		'bg-[#332a27] text-[#e8b99a]'
	];
</script>

<span
	class="inline-flex shrink-0 items-center justify-center border border-white/10 font-code font-medium uppercase tracking-wider {sizes[
		size
	]} {square ? 'rounded-md' : 'rounded-full'} {accent ? backgrounds[1] : backgrounds[hue]}"
	aria-hidden="true"
>
	{initials}
</span>
