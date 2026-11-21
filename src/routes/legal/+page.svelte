<script lang="ts">
	import { ExternalLink, ShieldCheck, ScrollText } from '@lucide/svelte';

	const updated = 'November 21, 2026';
</script>

<svelte:head>
	<title>Terms, privacy & cookies • Owltside</title>
	<meta name="description" content="Read Owltside's terms and conditions, privacy policy and information about cookies and local storage." />
</svelte:head>

<div class="min-h-dvh bg-surface-base text-on-surface">
	<header class="sticky top-0 z-40 h-16 border-b border-surface-glass-border bg-surface-base/90 backdrop-blur-xl flex items-center px-margin md:px-8">
		<a href="/home" aria-label="Owltside home" class="flex items-center gap-3"><img src="/owl-icon.png" alt="" class="w-8 h-8 object-contain" /><span class="font-display text-headline-md">Owltside</span></a>
	</header>
	<main class="pb-20 px-margin md:px-6 bg-surface min-h-dvh">
		<div class="mx-auto max-w-4xl py-6 md:py-10 flex flex-col gap-4 md:gap-6">
			<div class="rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-7">
				<div class="flex items-start gap-3">
					<span class="w-11 h-11 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><ScrollText class="w-5 h-5" /></span>
					<div><h1 class="font-display text-headline-lg text-on-surface">Legal &amp; privacy</h1><p class="text-body-sm text-on-surface-variant mt-2 leading-relaxed">A guide to using Owltside, buying and managing passes, and how information is handled.</p><p class="text-xs text-on-surface-variant mt-2">Last updated {updated}</p></div>
				</div>
				<p class="mt-5 rounded-lg border border-surface-glass-border bg-surface-container-high/50 p-3 text-body-sm text-on-surface-variant leading-relaxed"><strong class="text-on-surface">Policy draft:</strong> These documents require review and approval by Owltside and qualified legal counsel before publication as final policies. They do not replace rights provided by applicable law.</p>
				<nav aria-label="Legal sections" class="mt-5 flex flex-wrap gap-2 text-body-sm">
					<a href="#terms" class="rounded-full border border-surface-glass-border px-4 py-2 text-primary hover:bg-surface-container-high">Terms &amp; conditions</a>
					<a href="#privacy" class="rounded-full border border-surface-glass-border px-4 py-2 text-primary hover:bg-surface-container-high">Privacy policy</a>
					<a href="#cookies" class="rounded-full border border-surface-glass-border px-4 py-2 text-primary hover:bg-surface-container-high">Cookies &amp; storage</a>
					<a href="#licenses" class="rounded-full border border-surface-glass-border px-4 py-2 text-primary hover:bg-surface-container-high">Licenses</a>
				</nav>
			</div>

			<section id="terms" class="scroll-mt-24 rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-7">
				<h2 class="font-display text-headline-md text-on-surface">Terms &amp; conditions</h2>
				<p class="mt-2 text-body-sm text-on-surface-variant">Please read these terms before creating an account, purchasing a pass or using organizer tools.</p>
				<div class="policy-copy">
					<h3>1. About the service and these terms</h3>
					<p>Owltside is an event discovery and ticketing platform that may also provide profiles, messaging, notifications, organizer tools and entry verification. These terms apply to visitors, attendees, organizers and others who use the service. By using the service, you agree to these terms; if you do not agree, do not use it. Our <a href="#privacy">Privacy Policy</a> explains how information is handled.</p>
					<p>An event organizer, venue, payment provider or other third party may have additional terms. Review the event listing and checkout details before purchasing. Those terms do not remove any rights you have under applicable law.</p>
					<h3>2. Eligibility and accounts</h3>
					<p>You must be at least 18 years old to create an account or purchase a pass. You must provide accurate, current information and have authority to act for any organization you represent. You are responsible for activities on your account, keeping your email and devices secure, and protecting sign-in codes. Do not share codes or allow unauthorized access. Contact <a href="mailto:support@owltside.app">support@owltside.app</a> promptly if you suspect misuse.</p>
					<h3>3. Our role and event listings</h3>
					<p>Organizers are responsible for their events, including descriptions, pricing, availability, age restrictions, accessibility, venue rules, safety and any required permits. Owltside facilitates listings and transactions; an event listing or review is not a guarantee of an organizer, venue, event quality or safety. Details may change. Check the listing and communications from the organizer before travelling or attending.</p>
					<h3>4. Orders, prices and payment</h3>
					<p>Review your event, ticket tier, quantity, price, applicable service or payment fees, discounts and total at checkout. Fees and taxes, where applicable, are shown as part of the transaction. Prices and availability may change before an order is completed. A submitted order is not a confirmed pass until payment is verified and a pass is issued. Payment may be declined or an order cancelled where verification fails, inventory is unavailable, fraud is suspected or applicable law requires it.</p>
					<p>Payments are processed by configured third-party providers, including Paystack when enabled. Their terms and privacy practices may apply. You must be authorized to use the payment method and must not initiate fraudulent payments or chargebacks. Contact support about an unfamiliar or disputed charge.</p>
					<h3>5. Passes, transfers and entry</h3>
					<p>A pass is for the event, date and ticket tier shown on it and may be subject to organizer and venue conditions. Keep its QR code and account credentials private: a copied or shared code may be used by someone else. Entry is subject to validation, capacity, applicable restrictions and venue rules; possession of a pass does not override lawful admission requirements. A pass may be marked used after check-in.</p>
					<p>Where transfer is available, follow the in-app process and verify the recipient before confirming. Transfers may be restricted by pass status, event conditions or law. Do not duplicate, tamper with or sell passes through unauthorized channels. Owltside cannot guarantee entry for invalid, previously used or fraudulently obtained passes.</p>
					<h3>6. Cancellations, changes and refunds</h3>
					<p>Events may be cancelled, postponed, rescheduled or changed by the organizer. Check the event listing and organizer communications for the applicable conditions and contact support if you need help. Any refund eligibility, amount, fee treatment and timing depend on the event's stated policy, the circumstances, payment processing and applicable consumer law; nothing here limits a mandatory legal remedy.</p>
					<p>Where available, submit a refund request from the relevant pass. A request is subject to review and is not a guarantee of approval or payment. A pass remains valid until a refund is approved; once refunded, it may no longer be used. Do not assume that submitting a request cancels your pass or reverses a payment.</p>
					<h3>7. Organizer responsibilities and payouts</h3>
					<p>Organizers must provide accurate event and payout information, honor their advertised terms and applicable law, protect attendee information, handle customer enquiries, and keep their event details current. You must have the necessary rights, permissions, licenses and insurance for your event and content. You are responsible for your staff, venues, taxes, refunds and obligations to attendees.</p>
					<p>Listings may be reviewed before publication and may be rejected, suspended or removed. Payouts can be subject to verification, review, applicable fees, refunds, disputes, reversals, processing delays and legal requirements. A payout request does not itself guarantee approval or immediate settlement. Protect scanner credentials and give access only to authorized staff.</p>
					<h3>8. Community conduct and content</h3>
					<p>Do not impersonate others; harass, threaten or discriminate; post unlawful, deceptive or infringing content; send spam; manipulate listings; scrape or disrupt the service; attempt unauthorized access; or misuse reports, payment systems, QR codes or other users' information. Use messaging and attendee information only for appropriate, authorized purposes.</p>
					<p>You retain rights in content you submit, but grant Owltside permission to host, process, display and distribute it as needed to operate and promote the service and the relevant event. You represent that you have the necessary rights to provide it. Public profiles and listings can be viewed by others. You can report a listing or profile using the available reporting tools; reports are reviewed and do not automatically result in action.</p>
					<h3>9. Intellectual property and third-party services</h3>
					<p>Owltside and its licensors retain rights in the service, branding, software and materials, except for content owned by users or other parties. You may use the service for its intended purpose but may not copy, reverse engineer or exploit it beyond what the law permits. Third-party links and services are governed by their own terms; Owltside does not control them.</p>
					<h3>10. Suspension, deletion and availability</h3>
					<p>We may restrict or suspend access, remove content or investigate activity where necessary to protect users or the service, address suspected violations or comply with law. You may request account deletion through Settings or contact support. Deletion may affect access to passes, messages and organizer tools; some records may be retained for legitimate operational, dispute-resolution or legal reasons as described in the Privacy Policy.</p>
					<p>Features may change or be unavailable because of maintenance, outages or circumstances outside our control. Keep a record of important event and purchase details and allow time for entry verification.</p>
					<h3>11. Disclaimers, liability and disputes</h3>
					<p>To the extent permitted by law, the service is provided on an “as available” basis without guarantees that it will be uninterrupted, error-free or that an event will take place as advertised. Nothing in these terms excludes liability or consumer rights that cannot lawfully be excluded or limited.</p>
					<p>If a problem arises, contact <a href="mailto:support@owltside.app">support@owltside.app</a> with your order or event details so it can be reviewed. You may also pursue any remedies available under applicable law. These terms do not prevent you from contacting a competent regulator or court.</p>
					<h3>12. Changes and contact</h3>
					<p>These terms may be updated as the service or legal requirements change. The date above identifies the latest revision; where required, notice or renewed consent will be provided. For questions about these terms, contact <a href="mailto:support@owltside.app">support@owltside.app</a>.</p>
				</div>
			</section>

			<section id="privacy" class="scroll-mt-24 rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-7">
				<div class="flex items-center gap-2"><ShieldCheck class="w-5 h-5 text-primary" /><h2 class="font-display text-headline-md text-on-surface">Privacy policy</h2></div>
				<p class="mt-2 text-body-sm text-on-surface-variant">How information is collected and used when you interact with Owltside.</p>
				<div class="policy-copy">
					<h3>1. Information we handle</h3>
					<p>Depending on how you use the service, information may include your email, name, username, profile image, bio and other profile details; sign-in and account information; event listings and organizer details; orders, ticket ownership, transfers, QR validation and check-in records; messages, follows, notifications, reports and support requests; and verification or payout information you submit. Payment providers handle payment information and may provide transaction references and status to Owltside.</p>
					<p>Technical information may include IP address, browser and device details, security and diagnostic information, cookies and local storage, and push subscription details if you enable notifications. Information may come directly from you, from your use of the service, or from providers such as authentication and payment services. Avoid including sensitive personal information in public content or messages unless necessary.</p>
					<h3>2. How information is used</h3>
					<p>Information is used to create and secure accounts; display profiles and events; process orders and verify payments; issue, transfer and validate passes; support organizers and attendees; deliver messages and notifications; review reports, verification, refunds and payouts; prevent fraud and abuse; maintain and improve the service; and meet legal obligations. Where relevant law requires a legal basis, processing may rely on performance of a contract, legitimate interests, legal obligations or your consent, depending on the purpose and circumstances.</p>
					<h3>3. Sharing and visibility</h3>
					<p>Public profile and event information can be seen by other users and visitors. Organizers and authorized gate staff may receive or access information needed to manage an event, communicate with attendees and validate passes. Other users can see content and messages you choose to share with them. Organizers are responsible for their own use of information they receive.</p>
					<p>Service providers may process information to support hosting, authentication, databases, payments, bot protection and notifications. Depending on deployment and features enabled, these may include Supabase, Paystack, Cloudflare and an authentication provider. Information may also be disclosed where required by law, to protect rights and safety, or in connection with a business transaction, subject to applicable law.</p>
					<h3>4. Retention, security and international processing</h3>
					<p>Information is kept for as long as needed for the purposes above, including maintaining accounts, fulfilling transactions, resolving disputes, preventing abuse and satisfying legal or accounting obligations. Retention varies by record and circumstance; deletion of an account does not necessarily erase every transaction, backup or record immediately.</p>
					<p>We use security measures appropriate to the service, but no system is completely secure. Protect your account and report suspected unauthorized access. Providers may process or store information outside your country; where applicable, transfers are subject to legal requirements and appropriate safeguards.</p>
					<h3>5. Your choices and rights</h3>
					<p>You can edit certain profile information and preferences in Settings, manage browser notification permissions, and request account deletion. Some preferences are stored on your device and may not carry over to another browser or device. Essential service messages and records may still be necessary even when optional notifications are disabled.</p>
					<p>Subject to applicable law, you may have rights to request access, correction, deletion or portability of your information, object to or restrict certain processing, and withdraw consent where processing relies on it. Withdrawing consent does not affect prior lawful processing. We may need to verify your identity and may retain or decline to remove information where permitted or required by law. You may also complain to the relevant data protection authority.</p>
					<h3>6. Children and contact</h3>
					<p>Accounts and pass purchases are intended for people aged 18 or older. If you believe a child has provided personal information through an account, contact us so the matter can be reviewed.</p>
					<p>For privacy questions or requests, email <a href="mailto:privacy@owltside.app">privacy@owltside.app</a>. Include enough detail to identify your request, but do not email payment card details or sign-in codes. This policy may change; the date above reflects the latest revision.</p>
				</div>
			</section>

			<section id="cookies" class="scroll-mt-24 rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-7">
				<h2 class="font-display text-headline-md text-on-surface">Cookies &amp; local storage</h2>
				<div class="policy-copy">
					<p>Cookies are small pieces of data stored by your browser. Owltside also uses browser storage and service-worker caches. These technologies can support sign-in sessions, security, app preferences, cached content and offline functionality. Clearing them may sign you out, reset preferences or remove locally cached information.</p>
					<p>Settings includes choices for analytics and personalization preferences. These choices are saved on your device; they are not a browser-wide or cross-device consent signal. Your browser can also block or clear cookies and site data, although essential features may stop working. Third-party services used for authentication, payments or security may use their own technologies under their respective policies.</p>
					<p>Review your choices in <a href="/settings">Settings → Help &amp; Legal</a>. For questions, contact <a href="mailto:privacy@owltside.app">privacy@owltside.app</a>.</p>
				</div>
			</section>

			<section id="licenses" class="scroll-mt-24 rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-7">
				<h2 class="font-display text-headline-md text-on-surface">Licenses &amp; attribution</h2>
				<p class="text-body-sm text-on-surface-variant mt-3 leading-relaxed">Owltside uses open-source packages and services under their respective licenses, including Svelte, SvelteKit, Tailwind CSS, Lucide, Supabase, and Embla Carousel. Refer to the project’s dependency manifests and each upstream project for current license terms.</p>
				<a href="https://github.com/tomiwa-code/owltside" target="_blank" rel="noreferrer" class="inline-flex items-center gap-1.5 text-body-sm text-primary hover:underline mt-3">Project repository <ExternalLink class="w-3.5 h-3.5" /></a>
			</section>
			<p class="text-xs text-on-surface-variant">Questions? <a href="mailto:support@owltside.app" class="text-primary underline">Contact Owltside support</a>.</p>
		</div>
	</main>
</div>

<style>
	.policy-copy { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1.25rem; line-height: 1.7; }
	.policy-copy :global(h3) { margin-top: 0.75rem; font-weight: 700; color: var(--color-on-surface); }
	.policy-copy :global(p) { font-size: 0.875rem; color: var(--color-on-surface-variant); }
	.policy-copy :global(a) { color: var(--color-primary); text-decoration: underline; }
</style>
