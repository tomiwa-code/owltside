<script lang="ts">
	import TopBar from '$components/TopBar.svelte';
	import { ExternalLink, ShieldCheck, ScrollText } from '@lucide/svelte';

	const updated = 'October 14, 2026';
</script>

<svelte:head>
	<title>Legal & privacy • Owltside</title>
	<meta name="description" content="Owltside terms, privacy, cookies and third-party licenses." />
</svelte:head>

<div class="min-h-dvh bg-surface-base text-on-surface">
	<header class="hidden md:flex sticky top-0 z-40 h-16 border-b border-surface-glass-border bg-surface-base/90 backdrop-blur-xl items-center px-8">
		<a href="/home" aria-label="Owltside home" class="flex items-center gap-3"><img src="/owl-icon.png" alt="" class="w-8 h-8 object-contain" /><span class="font-display text-headline-md">Legal & privacy</span></a>
	</header>
	<div class="md:hidden"><TopBar back title="Legal & privacy" subtitle="Policies and preferences" /></div>
	<main class="pt-mobile-header md:pt-0 pb-32 md:pb-16 px-margin md:px-6 bg-surface min-h-dvh">
		<div class="mx-auto max-w-4xl py-4 md:py-10 flex flex-col gap-4 md:gap-6">
			{@render LegalContent()}
		</div>
	</main>
</div>

{#snippet LegalContent()}
	<div class="rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-7">
		<div class="flex items-start gap-3">
			<span class="w-11 h-11 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><ScrollText class="w-5 h-5" /></span>
			<div><h1 class="font-display text-headline-lg text-on-surface">Legal information</h1><p class="text-body-sm text-on-surface-variant mt-1">Last updated {updated}. This product summary does not replace the final policies approved for your region.</p></div>
		</div>
	</div>

	<section id="terms" class="scroll-mt-24 rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-7">
		<h2 class="font-display text-headline-md text-on-surface">Terms of Service</h2>
		<div class="mt-3 flex flex-col gap-3 text-body-sm text-on-surface-variant leading-relaxed">
			<p>Owltside helps people discover events, buy and manage entry passes, and communicate with event organizers. By using the service, you agree to provide accurate account details, protect your sign-in codes, and follow venue and organizer rules.</p>
			<p>You must be at least 18 to create an account or purchase a pass. A pass is valid only for the event, date, and ticket tier shown in your order. Transfers, refunds, and event changes are handled under the organizer’s stated policy and applicable consumer law.</p>
			<p>Do not resell passes through unauthorized channels, misuse entry credentials, or interfere with the service. Contact support if you believe an account or pass has been used without permission.</p>
		</div>
	</section>

	<section id="privacy" class="scroll-mt-24 rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-7">
		<div class="flex items-center gap-2"><ShieldCheck class="w-5 h-5 text-primary" /><h2 class="font-display text-headline-md text-on-surface">Privacy Policy</h2></div>
		<div class="mt-3 flex flex-col gap-3 text-body-sm text-on-surface-variant leading-relaxed">
			<p>Owltside processes account and profile details, event and ticket activity, support messages, and device preferences to provide discovery, checkout, entry validation, account security, and customer support.</p>
			<p>Profile visibility, event activity, recommendation, notification, and optional cookie controls are available in Settings. Essential storage is used for sign-in, checkout, and offline ticket access. Payment processing is handled through the configured payment provider.</p>
			<p>To request access, correction, or deletion of account data, email <a class="text-primary underline" href="mailto:privacy@owltside.app">privacy@owltside.app</a>. Some transaction records may need to be retained where required by law.</p>
		</div>
	</section>

	<section id="cookies" class="scroll-mt-24 rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-7">
		<h2 class="font-display text-headline-md text-on-surface">Cookie settings</h2>
		<p class="text-body-sm text-on-surface-variant mt-3 leading-relaxed">Essential cookies and local storage support sessions, security, checkout, and saved offline passes. Optional analytics and personalization preferences can be changed at any time in <a href="/settings" class="text-primary underline">Settings → Help & legal</a>. Turning off optional cookies does not disable essential account functions.</p>
	</section>

	<section id="licenses" class="scroll-mt-24 rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-7">
		<h2 class="font-display text-headline-md text-on-surface">Licenses & attribution</h2>
		<p class="text-body-sm text-on-surface-variant mt-3 leading-relaxed">Owltside uses open-source packages and services under their respective licenses, including Svelte, SvelteKit, Tailwind CSS, Lucide, Supabase, and Embla Carousel. Refer to the project’s dependency manifests and each upstream project for current license terms.</p>
		<a href="https://github.com/tomiwa-code/owltside" target="_blank" rel="noreferrer" class="inline-flex items-center gap-1.5 text-body-sm text-primary hover:underline mt-3">Project repository <ExternalLink class="w-3.5 h-3.5" /></a>
	</section>

	<div class="text-xs text-on-surface-variant">Questions? <a href="mailto:support@owltside.app" class="text-primary underline">Contact Owltside support</a>.</div>
{/snippet}
