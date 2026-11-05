<script lang="ts">
	import { Mail, Phone } from '@lucide/svelte';
	import SocialLinks from './SocialLinks.svelte';
</script>

<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
	<section aria-label="Contact us" class="min-w-0 rounded-xl border border-surface-glass-border bg-surface-container p-5 md:p-6">
		<h2 class="font-display text-headline-md text-on-surface">Contact us</h2>
		<div class="mt-3 space-y-1">
			<a
				href="mailto:owltside.app@gmail.com"
				class="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 text-body-sm text-on-surface transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
			>
				<Mail class="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
				<span class="min-w-0 break-all">owltside.app@gmail.com</span>
			</a>
			<a
				href="tel:+2349071401036"
				class="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 text-body-sm text-on-surface transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
			>
				<Phone class="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
				<span>+2349071401036</span>
			</a>
		</div>
	</section>

	<section aria-label="Follow for updates" class="min-w-0 rounded-xl border border-surface-glass-border bg-surface-container p-5 md:p-6">
		<h2 class="font-display text-headline-md text-on-surface">Follow for updates</h2>
		<SocialLinks />
	</section>
</div>
