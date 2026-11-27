<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ArrowLeft,
		Database,
		ExternalLink,
		Landmark,
		Mail,
		MapPin,
		Phone,
		ScrollText,
		ShieldCheck,
		Ticket,
		Undo2
	} from '@lucide/svelte';
	import SocialLinks from '$components/SocialLinks.svelte';
	import ThemeToggle from '$components/ThemeToggle.svelte';

	const updated = '27 November, 2026';

	const sections = [
		{ id: 'refunds', label: 'Refund Policy', shortLabel: 'Refunds', icon: Undo2 },
		{ id: 'terms', label: 'Terms of Use', shortLabel: 'Terms of Use', icon: ScrollText },
		{ id: 'privacy', label: 'Privacy Policy', shortLabel: 'Privacy Policy', icon: ShieldCheck },
		{ id: 'tsa', label: 'Ticket Services Agreement', shortLabel: 'Organizer TSA', icon: Ticket },
		{ id: 'cookies', label: 'Cookies & Local Storage', shortLabel: 'Cookies & Storage', icon: Database },
		{ id: 'licenses', label: 'Licenses & Attribution', shortLabel: 'Licenses', icon: Landmark }
	] as const;

	let activeSection = $state<string>('refunds');

	onMount(() => {
		const syncHash = () => {
			const hash = window.location.hash.replace(/^#/, '');
			if (sections.some((section) => section.id === hash)) {
				activeSection = hash;
			}
		};
		syncHash();
		window.addEventListener('hashchange', syncHash);

		if (typeof IntersectionObserver !== 'undefined') {
			const observer = new IntersectionObserver(
				(entries) => {
					const visible = entries
						.filter((entry) => entry.isIntersecting)
						.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
					if (visible[0]?.target.id) {
						activeSection = visible[0].target.id;
					}
				},
				{ rootMargin: '-96px 0px -65% 0px', threshold: 0 }
			);
			for (const section of sections) {
				const el = document.getElementById(section.id);
				if (el) observer.observe(el);
			}
			return () => {
				window.removeEventListener('hashchange', syncHash);
				observer.disconnect();
			};
		}

		return () => window.removeEventListener('hashchange', syncHash);
	});
</script>

<svelte:head>
	<title>Legal, Terms, Privacy &amp; Refund Policies • Owltside</title>
	<meta
		name="description"
		content="Read Owltside's Refund Policy, Terms of Use, Privacy Policy, Ticket Services Agreement, and Cookie Policy for operations in Nigeria."
	/>
</svelte:head>

<div class="min-h-dvh bg-surface-base text-on-surface">
	<header class="sticky top-0 z-40 h-16 border-b border-surface-glass-border bg-surface-base/90 backdrop-blur-xl">
		<div class="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-margin md:px-8">
			<div class="flex items-center gap-3">
				<a
					href="/home"
					aria-label="Back to Owltside home"
					class="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
				>
					<ArrowLeft class="h-4 w-4" />
				</a>
				<a href="/home" aria-label="Owltside home" class="flex items-center gap-2.5">
					<img src="/owl-icon.png" alt="" class="h-8 w-8 object-contain" />
					<span class="font-display text-headline-md font-bold tracking-tight">Owltside</span>
				</a>
			</div>
			<div class="flex items-center gap-3">
				<span class="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-surface-glass-border bg-surface-container px-3 py-1 font-code text-[11px] tracking-[0.1em] uppercase text-on-surface-variant">
					<span aria-hidden="true">🇳🇬</span> Nigeria Only · NGN
				</span>
				<ThemeToggle />
			</div>
		</div>
	</header>

	<main class="bg-surface px-margin pb-24 md:px-8 min-h-dvh">
		<div class="mx-auto max-w-6xl py-6 md:py-10">
			<!-- Hero / Jurisdiction Banner -->
			<div class="rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-8">
				<div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
					<div class="flex items-start gap-3.5 max-w-3xl">
						<span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
							<ScrollText class="h-6 w-6" />
						</span>
						<div>
							<div class="flex flex-wrap items-center gap-2">
								<h1 class="font-display text-headline-lg text-on-surface">Legal &amp; Policies</h1>
								<span class="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-code text-[11px] tracking-[0.1em] uppercase text-primary">
									🇳🇬 Nigeria
								</span>
							</div>
							<p class="mt-2 text-body-sm leading-relaxed text-on-surface-variant">
								These legal agreements and policies govern your access to and use of Owltside — including event discovery, digital gate passes, 1-to-1 pass transfers, community profiles, messaging, organizer tools, and settlements.
							</p>
							<p class="mt-2 font-code text-[11px] tracking-[0.1em] uppercase text-on-surface-variant">
								Last Updated: {updated}
							</p>
						</div>
					</div>

					<div class="rounded-xl border border-surface-glass-border bg-surface-container-high/60 p-4 lg:w-72 shrink-0">
						<p class="font-code text-[11px] tracking-[0.12em] uppercase text-on-surface-variant">Official Contact</p>
						<div class="mt-2.5 flex flex-col gap-2 text-body-sm">
							<a href="mailto:owltside.app@gmail.com" class="inline-flex items-center gap-2 text-primary hover:underline break-all">
								<Mail class="h-4 w-4 shrink-0" />
								<span>owltside.app@gmail.com</span>
							</a>
							<a href="tel:+2349071401036" class="inline-flex items-center gap-2 text-on-surface hover:text-primary">
								<Phone class="h-4 w-4 shrink-0 text-primary" />
								<span>+234 907 140 1036</span>
							</a>
							<span class="inline-flex items-center gap-2 text-xs text-on-surface-variant">
								<MapPin class="h-4 w-4 shrink-0 text-primary" />
								<span>Lagos, Federal Republic of Nigeria</span>
							</span>
						</div>
					</div>
				</div>

				<div class="mt-5 rounded-xl border border-surface-glass-border bg-surface-container-high/50 p-3.5 text-body-sm leading-relaxed text-on-surface-variant">
					<strong class="text-on-surface">Territorial Scope (Nigeria Only):</strong> Owltside currently operates exclusively within the Federal Republic of Nigeria. All ticket prices, service fees, refunds, and organizer payouts are denominated and settled strictly in Nigerian Naira (<span class="font-code text-on-surface">NGN / ₦</span>). Nothing in these policies removes mandatory statutory rights guaranteed under applicable Nigerian law.
				</div>

				<nav aria-label="Legal sections" class="mt-5 flex flex-wrap gap-2 text-body-sm">
					{#each sections as section (section.id)}
						<a
							href="#{section.id}"
							onclick={() => (activeSection = section.id)}
							class="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 font-medium transition-colors {activeSection === section.id
								? 'border-primary bg-primary/15 text-primary'
								: 'border-surface-glass-border text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}"
						>
							<section.icon class="h-3.5 w-3.5 shrink-0" />
							<span>{section.label}</span>
						</a>
					{/each}
				</nav>
			</div>

			<div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
				<!-- Sticky Desktop Sidebar TOC -->
				<aside aria-label="Document index" class="hidden lg:flex flex-col gap-3 sticky top-24 rounded-2xl border border-surface-glass-border bg-surface-container p-4">
					<span class="px-2 font-code text-[11px] tracking-[0.12em] uppercase text-on-surface-variant">Documents</span>
					<div class="flex flex-col gap-1">
						{#each sections as section (section.id)}
							<a
								href="#{section.id}"
								onclick={() => (activeSection = section.id)}
								class="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-body-sm transition-colors {activeSection === section.id
									? 'bg-primary/15 text-primary font-semibold'
									: 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}"
							>
								<section.icon class="h-4 w-4 shrink-0" />
								<span class="truncate">{section.shortLabel}</span>
							</a>
						{/each}
					</div>
					<div class="mt-2 border-t border-surface-glass-border pt-3 px-2">
						<p class="text-xs text-on-surface-variant">Follow Owltside</p>
						<div class="mt-2">
							<SocialLinks compact />
						</div>
					</div>
				</aside>

				<!-- Policy Documents Column -->
				<div class="flex flex-col gap-6 min-w-0">
					<!-- ================================================================ -->
					<!-- 1. REFUND POLICY                                                 -->
					<!-- ================================================================ -->
					<section id="refunds" class="scroll-mt-24 rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-8">
						<div class="flex flex-wrap items-center justify-between gap-2 border-b border-surface-glass-border pb-4">
							<div class="flex items-center gap-2.5">
								<Undo2 class="h-5 w-5 text-primary shrink-0" />
								<h2 class="font-display text-headline-md text-on-surface">Refund Policy 🇳🇬</h2>
							</div>
							<span class="font-code text-[11px] tracking-[0.1em] uppercase text-on-surface-variant">Last Updated: {updated}</span>
						</div>

						<div class="policy-copy">
							<h3>Introduction</h3>
							<p>
								This Refund Policy (the “Policy”) informs you (the “Event Attendee”) about your rights and the applicable procedures for requesting and receiving a refund for digital tickets and gate passes (“Tickets” or “Passes”) purchased on the Owltside (“Owltside”, “We”, “Us”, or “Our”) web application or Progressive Web App (collectively, “the Platform”) within the Federal Republic of Nigeria.
							</p>
							<p>
								By creating an account, purchasing a Ticket, or accepting this Policy on the Platform, you confirm that you have read this Policy carefully and understand your rights and obligations as set out below.
							</p>

							<h3>Terms Governing Ticket Refunds</h3>
							<p>You acknowledge and agree as follows:</p>
							<ul>
								<li>
									<strong>Owltside’s Marketplace Role:</strong> Owltside operates an event discovery, ticketing, and gate-verification Platform in Nigeria that enables event creators, venue operators, and promoters (“Event Organisers”) to list events and sell Tickets directly to their intended audience. Although Owltside moderates event submissions before publication for platform compliance, Owltside is not the creator, host, or producer of these events and is not directly involved in the physical organisation, execution, safety, or quality of any event. Event Organisers are responsible for their own event conditions and for attendee enquiries. Save as required by mandatory Nigerian law, We are not responsible for any loss or damage occurring as a result of the cancellation, postponement, rescheduling, or mishap experienced at any event paid for via our Platform.
								</li>
								<li>
									<strong>Non-Refundable Owltside Fees:</strong> Owltside reserves the right to charge a tiered platform service fee (“Platform Fee”) and a payment gateway processing fee (“Payment Processing Fee”, and together with the Platform Fee, the “Owltside Fees”) in Nigerian Naira (NGN) on paid Tickets purchased via the Platform, as disclosed at checkout (unless absorbed by the Event Organiser). <strong>All Owltside Fees are one-time and strictly non-refundable</strong> once a transaction is completed, except where mandatory Nigerian law requires otherwise.
								</li>
								<li>
									<strong>Refundable Amount (Ticket Face Value Only):</strong> Where a refund request is approved — whether due to an eligible timely cancellation by you, an Event Organiser’s policy, or an event cancellation — you are entitled solely to a refund of the Ticket face value actually paid for that Pass (net of any promotional code discount redeemed at checkout). Owltside Fees shall not form part of any refund granted to you.
								</li>
								<li>
									<strong>In-App Refund Requests &amp; 72-Hour Policy Window:</strong> Event Attendees may submit a refund request directly on the Platform by opening <strong>Tickets → Gate Pass → Refund</strong>, selecting a cancellation reason (<em>Schedule Conflict</em>, <em>Emergency</em>, <em>Duplicate Order</em>, or <em>Other Reason</em>), and confirming Pass cancellation:
									<ul>
										<li><strong>72+ Hours Before Event Start:</strong> Valid, unscanned Passes for which a refund request is submitted at least seventy-two (72) hours before the scheduled event start time (West Africa Time, WAT) qualify for standard full Ticket-price refund review, subject to the Event Organiser’s stated terms and Owltside’s review verification.</li>
										<li><strong>Within 72 Hours of Event Start:</strong> Requests submitted less than seventy-two (72) hours prior to the scheduled event start time are subject to stricter Event Organiser policy review and may be declined unless the event is cancelled or materially rescheduled.</li>
										<li><strong>Pending Review &amp; Immediate Voiding Upon Approval:</strong> Submitting a refund request places it in <em>Pending Approval</em> status with the Owltside review team and does not automatically cancel your Pass or reverse payment. Your Pass remains valid until a decision is made. Once approved, the Pass is immediately and irreversibly voided (<em>Refunded</em>), its rotating QR code and manual gate code will no longer scan at the gate, and the approved Ticket amount is returned in NGN to your original payment method via Paystack (estimated 3–5 Business Days after approval, subject to your bank’s settlement timelines).</li>
									</ul>
								</li>
								<li>
									<strong>Checked-In &amp; Transferred Passes Are Ineligible:</strong> Once a Gate Pass has been scanned and verified at the event entrance (<em>Verified</em>), refund actions are permanently disabled and no refund will be issued. Likewise, if you transfer a Pass 1-to-1 to another Owltside user (<code>@handle</code>), your copy is immediately invalidated and you can no longer request a refund on that Pass.
								</li>
								<li>
									<strong>No Liability for Event Experience Damages:</strong> In the event that you are dissatisfied with the cancellation, postponement, or quality of an event, Owltside will not be liable for any damages — whether direct, indirect, incidental, consequential, special, punitive, or exemplary — arising out of or in any way connected with your experience at an event paid for via our Platform.
								</li>
								<li>
									<strong>OWLTSIDE WILL NOT REFUND THE COST OF TICKETS PURCHASED VIA THE PLATFORM IN THE EVENT THAT YOU ARE DISSATISFIED WITH THE QUALITY, LINEUP, SOUND, VENUE, OR EXPERIENCE OF AN EVENT.</strong>
								</li>
								<li>
									<strong>Force Majeure, Event Cancellation &amp; Inability to Attend:</strong> If, after payment has been verified through our Platform, an event gets cancelled or postponed, or you are unable to attend an event for any reason — including but not limited to severe or extraordinary weather (including flood, storm, earthquake, or other act of God), fire, war, pandemic, epidemic, insurrection, terrorist act, riot, civil unrest, accident, emergency, or action of government in Nigeria — the Event Organiser remains primarily responsible for honouring refunds. Where net ticket proceeds for an open (unclosed) event remain held in Owltside’s settlement ledger prior to post-event payout, Owltside may process approved Ticket-price refunds (excluding Owltside Fees) from those held proceeds; where event proceeds have already been settled to the Event Organiser or are otherwise unavailable, Owltside will only assist with facilitating a refund request with the Event Organiser and shall not be held financially liable for such refund.
								</li>
								<li>
									<strong>Statutory Consumer Rights:</strong> Nothing in this Policy excludes or limits any mandatory consumer remedies that cannot lawfully be waived under the Federal Competition and Consumer Protection Act, 2018 (FCCPA) or other applicable laws of the Federal Republic of Nigeria.
								</li>
							</ul>

							<div class="callout">
								<p>
									<strong>How to Request a Refund or Help:</strong> If you experience any of the circumstances above, please submit a refund request directly from your Gate Pass under <a href="/tickets">Tickets</a>, reach out to the Event Organiser via their Owltside profile/event page, or contact Owltside Support at <a href="mailto:owltside.app@gmail.com">owltside.app@gmail.com</a> or <a href="tel:+2349071401036">+234 907 140 1036</a>.
								</p>
							</div>
						</div>
					</section>

					<!-- ================================================================ -->
					<!-- 2. TERMS OF USE                                                  -->
					<!-- ================================================================ -->
					<section id="terms" class="scroll-mt-24 rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-8">
						<div class="flex flex-wrap items-center justify-between gap-2 border-b border-surface-glass-border pb-4">
							<div class="flex items-center gap-2.5">
								<ScrollText class="h-5 w-5 text-primary shrink-0" />
								<h2 class="font-display text-headline-md text-on-surface">Terms of Use 🇳🇬</h2>
							</div>
							<span class="font-code text-[11px] tracking-[0.1em] uppercase text-on-surface-variant">Last Updated: {updated}</span>
						</div>

						<div class="policy-copy">
							<h3>1. Introduction</h3>
							<p>
								1.1 Before signing up on, browsing, purchasing Passes through, or listing events on Owltside, you should carefully read, understand, and accept these Terms of Use (“T&amp;C”) as they govern your use of and access to our Services (as defined below). Your use of and access to the Services are strictly subject to these terms; if you do not agree to all of these terms, you may not use or access the Services in any manner.
							</p>
							<p>
								1.2 This T&amp;C represents a legally binding agreement between <strong>YOU</strong> and <strong>OWLTSIDE</strong> (hereinafter referred to as “Owltside”, “We”, “Us”, or “Our”, which expression shall, where the context so admits, include its operators, legal representatives, successors, and permitted assigns).
							</p>
							<p>
								1.3 This T&amp;C sets out the terms governing your use of and access to the Owltside web application, Progressive Web App (PWA), and all affiliated digital properties owned and operated by Us (collectively, the “Platform”) and our Services within the Federal Republic of Nigeria. “You” and “your” mean any visitor, Event Attendee, Event Organiser, invitee, gate staff member, or other person who uses or accesses the Services.
							</p>

							<h3>2. Who We Are &amp; Definitions</h3>
							<p>
								2.1 The Platform is operated by Owltside in Lagos, Federal Republic of Nigeria. Owltside currently operates exclusively in Nigeria, and all financial transactions on the Platform are conducted in Nigerian Naira (NGN). Our official phone number is <a href="tel:+2349071401036">+234 907 140 1036</a> and our official email address is <a href="mailto:owltside.app@gmail.com">owltside.app@gmail.com</a>.
							</p>
							<p>
								We may revise these Platform Terms of Use at any time by updating this page. You should check the Platform from time to time to review the current T&amp;C, as they are binding on you. In this T&amp;C, save where the context otherwise requires, references to an individual include his/her personal representatives, the singular includes the plural and vice versa, and any gender includes any other gender.
							</p>
							<p>2.2 In these Terms of Use, save where the context requires otherwise, the following words and expressions bear the meanings set out below:</p>
							<ul>
								<li><strong>“Event Attendee”</strong> means any User who discovers events, purchases, receives, or holds a Ticket / Gate Pass for an event listed on the Platform;</li>
								<li><strong>“Event Organiser”</strong> means the creator, venue operator, host, and/or promoter of a particular event (or an authorized representative acting with their express written permission) using Owltside’s organizer tools;</li>
								<li><strong>“Gate Pass”</strong> or <strong>“Ticket”</strong> means an electronic pass issued via the Platform (carrying a dynamic HMAC-signed rotating QR code and manual gate code) entitling the verified holder to admission to a specified event tier, subject to event and venue rules;</li>
								<li><strong>“Operating Identity”</strong> means the active workspace mode selected by a User on the Platform (<em>Attendee</em>, <em>Organizer</em>, or <em>Guest</em>);</li>
								<li><strong>“Services”</strong> means event discovery, digital ticketing, 1-to-1 Pass transfers, gate check-in scanning, user profiles, follows, realtime messaging, notifications, moderation, and settlement workflows collectively offered by Owltside;</li>
								<li><strong>“T&amp;C”</strong> means these Terms of Use;</li>
								<li><strong>“User”</strong> refers to any person who accesses or makes use of the Platform provided by Owltside; and</li>
								<li><strong>“User Profile”</strong> refers to the account and public or private profile (<code>@handle</code>) created and maintained by a registered User on the Platform.</li>
							</ul>

							<h3>3. Purpose, Eligibility, Acceptance and Use</h3>
							<p>
								<strong>3.1 Purpose &amp; Age Eligibility:</strong> This T&amp;C — together with our <a href="#privacy">Privacy Policy</a>, <a href="#refunds">Refund Policy</a>, and, where you act as an Event Organiser, our <a href="#tsa">Ticket Services Agreement</a> — constitutes a binding contract between you and Owltside taking effect upon publication or express notice to you, whichever is earlier. <strong>The Platform is intended solely for individuals who are 18 years of age or older</strong> and located in or transacting for events within Nigeria. Any registration, Ticket purchase, or event submission by anyone under 18 years of age is unauthorized, unlicensed, and a violation of this T&amp;C. By accessing or using the Platform, you represent and warrant that you are at least 18 years old.
							</p>
							<p>
								<strong>3.2 Acceptance:</strong> By accessing, browsing, registering on, or using the Platform — including ticking the agreement and age-confirmation checkboxes during account creation or continuing with Google sign-in — you acknowledge that you have read, understood, and agreed to be legally bound by this T&amp;C, our <a href="#privacy">Privacy Policy</a>, and our <a href="#refunds">Refund Policy</a>. If you do not agree, do not access or use the Platform.
							</p>
							<p>
								<strong>3.3 Electronic Delivery &amp; Amendments:</strong> Your use of the Platform is governed by the version of the T&amp;C in effect on the date you access the Platform. We reserve the right to amend, vary, or update this T&amp;C at any time. Continued use after updated terms are published constitutes acceptance of the revised T&amp;C. Owltside provides the Platform electronically via our web app and PWA; queries and complaints should be directed to <a href="mailto:owltside.app@gmail.com">owltside.app@gmail.com</a>.
							</p>

							<h3>4. Unified Accounts, Passwordless Authentication &amp; Operating Identities</h3>
							<p>
								4.1 Owltside provides a single unified account architecture. Visitors may browse public Nigerian event feeds in <em>Guest</em> mode, while signed-in Users may switch their <strong>Operating Identity</strong> between <em>Attendee</em>, <em>Organizer</em>, and <em>Guest</em> via Profile or Settings without creating separate accounts or losing existing Passes.
							</p>
							<p>
								4.2 To create a User Profile, we require your full name, a unique username (<code>@handle</code>, 3–24 letters, numbers, or underscores; subject to a 30-day cooldown between username changes), and a valid email address, and may request your phone number, Nigerian city/state, legal identity details, or bank payout details (“Personal Information”) depending on the features you use. You agree to provide true, accurate, current, and complete information, authorize Us to verify your information from independent sources, and promptly keep your details up to date.
							</p>
							<p>
								4.3 <strong>Passwordless Sign-In &amp; Account Security:</strong> Owltside uses passwordless authentication via <strong>6-digit Email One-Time Passcodes (OTP)</strong> and <strong>Google OAuth</strong> (PKCE flow), protected by automated bot-mitigation checks (Cloudflare Turnstile). Biometric/passkey sign-in is currently disabled. You are solely responsible for maintaining the security of your email inbox, connected Google account, active browser sessions, and 6-digit OTP verification codes. Never share sign-in codes, callback links, or session access with anyone. While Owltside maintains technical, cryptographic, and procedural safeguards, you accept responsibility for any unauthorized access, misuse, or compromise arising from your carelessness, shared devices, or failure to secure your email or OTP codes. Notify <a href="mailto:owltside.app@gmail.com">owltside.app@gmail.com</a> immediately if you suspect unauthorized access.
							</p>
							<p>
								4.4 We reserve the right to request additional verification information (including phone, government ID details, or Nigerian NUBAN payout verification in <em>Settings → Verification</em>) at any time, and to decline, suspend, or revoke access at our discretion where required information is not provided or compliance concerns arise. You acknowledge that Services are provided electronically and you are not entitled to demand in-person counter services at any office of Owltside.
							</p>

							<h3>5. Ticket Orders, Dynamic QR Passes, Transfers &amp; Gate Entry</h3>
							<p>
								5.1 <strong>Orders &amp; NGN Payments:</strong> Checkout orders are priced exclusively in Nigerian Naira (NGN) and display the applicable Ticket tier price, promotional code discount (if valid), tiered Platform Fee, and Payment Processing Fee before payment. Submitting checkout reserves inventory temporarily (up to 10 minutes) and hands off payment to <strong>Paystack</strong> (supporting Card, Bank Transfer, and USSD). An order does not create a valid Gate Pass until server-side payment verification succeeds. Orders may be declined or cancelled where payment verification fails, capacity has sold out, promo limits are exceeded, or fraud is suspected.
							</p>
							<p>
								5.2 <strong>Rotating HMAC QR Security &amp; Entry:</strong> Issued Gate Passes use dynamic cryptographic QR signatures (<code>owltside://t/&lt;code&gt;?s=&lt;hmac&gt;</code>) that rotate every 30 seconds so static screenshots expire and cannot be used for gate entry. Keep your live Pass and manual gate code private. Entry to an event remains subject to QR/code scan validation, venue capacity, age verification (18+), and lawful venue/organizer rules. Once verified at the gate, a Pass is permanently marked <em>Verified</em> (checked in) and cannot be scanned again, transferred, or refunded.
							</p>
							<p>
								5.3 <strong>1-to-1 Pass Transfers:</strong> Where eligible (prior to gate check-in or event closure), you may transfer a valid Pass 1-to-1 to another registered Owltside <code>@handle</code> using the in-app transfer sheet. Confirming a transfer re-mints the cryptographic QR code under the recipient’s account and immediately voids your copy. Always verify the recipient’s <code>@handle</code> before confirming. Reselling Passes through unauthorized scalping channels, duplicating codes, or tampering with QR signatures is strictly prohibited.
							</p>

							<h3>6. Event Organiser Access, Moderation &amp; Attendee Relationship</h3>
							<p>
								6.1 You may list events and sell Tickets in <em>Organizer</em> mode only if you are the legitimate Event Organiser or hold express written authorization from the Event Organiser, and your use of organizer services is additionally governed by our <a href="#tsa">Ticket Services Agreement</a>. Owltside provides technology infrastructure and has no direct event-delivery contract with Event Attendees; Tickets sold through Owltside create a contractual relationship solely between the Event Organiser and the Event Attendee. As an Event Organiser, you agree:
							</p>
							<ul>
								<li>to provide clear event descriptions, Nigerian state/city, venue locations, schedules, pricing, and lawful admission restrictions, together with original JPEG/PNG/WebP poster artwork;</li>
								<li>that all new or edited event submissions enter Owltside’s moderation queue (<em>Pending Approval</em>) and may not be self-published or accept Ticket sales until reviewed and approved by an Owltside administrator;</li>
								<li>to handle attendee enquiries promptly and respond to Event Attendee questions or message requests within <strong>three (3) days</strong>;</li>
								<li>to accept full legal and financial responsibility for the contractual relationship between you and your Event Attendees, including event delivery, venue safety, permits, taxes, and refunds;</li>
								<li>to notify Ticket holders immediately (using Owltside’s <em>Broadcast Announcement</em> tool) and notify Owltside if your event is cancelled, postponed, or undergoes any material change; and</li>
								<li>to safeguard expiring Gate Staff Scanner PINs and issue scanner access strictly to authorized door personnel.</li>
							</ul>
							<p>
								We retain the right to reject, unpublish, or suspend event listings, withhold settlements, or terminate Organizer access if you breach these obligations.
							</p>

							<h3>7. Community Features, Messaging &amp; Prohibited Uses</h3>
							<p>7.1 Whether acting as a visitor, Event Attendee, speaker/performer invitee, or Event Organiser, you agree that you shall <strong>not</strong>:</p>
							<ul>
								<li>use the Platform in any manner that could damage, disable, scrape, rate-abuse, or overburden Owltside’s servers, realtime channels, or connected networks;</li>
								<li>use the Platform for any illegal, unlawful, deceptive, or malicious activity under the laws of the Federal Republic of Nigeria — including fraud, fake event listings, ticket scalping scams, cybercrime, money laundering, financing of terrorism, or racketeering;</li>
								<li>impersonate any person, artist, speaker, promoter, or entity, create accounts if you are under 18, or submit false identity or bank verification records;</li>
								<li>upload or transmit posters, profile avatars/banners, messages, or broadcasts for which you lack required intellectual property rights or approvals, or that contain hateful, harassing, explicit, or unlawful material;</li>
								<li>abuse Realtime Inbox messaging, first-contact Organizer Message Requests, Speaker/Lineup invitations, Event Broadcast notifications, or Promo Codes to send spam, unsolicited promotions, or harassment;</li>
								<li>initiate fraudulent payments or bad-faith bank chargebacks, or submit knowingly false flags through Owltside’s <em>Report</em> tool; or</li>
								<li>access or attempt to access another User’s profile, email OTP, session cookies, or Gate Staff Scanner PIN without authorization.</li>
							</ul>
							<p>
								7.2 Users may report suspected listing or profile violations confidentially using the flag button on any event or profile page. If We suspect you have engaged in any prohibited conduct above, We may immediately suspend or terminate your account, remove listings, void fraudulently obtained Passes, freeze payouts, and pursue civil or criminal remedies under Nigerian law without liability to you.
							</p>

							<h3>8. Electronic Communication &amp; Notifications</h3>
							<p>
								You consent to Owltside sending all sign-in codes, order receipts, refund/payout/verification updates, organizer broadcasts, platform announcements, notices, and disclosures to you electronically (“Correspondence and Communication”) via email, the in-app Activity Hub, and (where enabled on your device) Web Push notifications. You are responsible for any data or carrier charges incurred in receiving electronic communications.
							</p>

							<h3>9. Personal Data Protection</h3>
							<p>
								9.1 Your use of the Platform involves the processing and transmission of Personal Information (including to trusted payment, authentication, and cloud database providers as needed to deliver the Services). By using the Platform, you acknowledge and consent to such processing in accordance with our <a href="#privacy">Privacy Policy</a>.
							</p>
							<p>
								9.2 All collection, transmission, storage, and analysis of personal data by Owltside is conducted in accordance with the <strong>Nigeria Data Protection Act, 2023 (NDPA)</strong>, applicable directives of the Nigeria Data Protection Commission (NDPC), and any other data protection law in force in Nigeria.
							</p>

							<h3>10. Usage Monitoring</h3>
							<p>
								We reserve the right to access, log, rate-limit, archive, or monitor usage of the Platform in accordance with the laws of the Federal Republic of Nigeria to maintain service quality, moderate listings and reports, verify gate check-ins and fee quotes, safeguard security, and enforce this T&amp;C. Such monitoring does not create any cause of action against Owltside, and Owltside shall not be liable for any loss arising from lawful compliance monitoring or enforcement.
							</p>

							<h3>11. Copyright, Trademarks &amp; User Content</h3>
							<p>
								11.1 The Platform — including Owltside’s name, owl emblem, “Evently Pulse” interface design, software code, dynamic QR signing architecture, text, and graphics — is protected by applicable Nigerian and international copyright, trademark, trade secret, and intellectual property laws. You may not copy, scrape, modify, reverse-engineer, distribute, or commercially exploit any part of the Platform without our prior written authorization.
							</p>
							<p>
								11.2 You retain ownership of original content you upload (such as profile photos, bios, and event posters), but grant Owltside a worldwide, royalty-free, non-exclusive licence to host, resize/crop, strip metadata from, cache, display, and distribute such content for the purpose of operating, securing, and promoting the Platform and your listed events.
							</p>

							<h3>12. Connectivity, PWA &amp; Offline Features</h3>
							<p>
								You are solely responsible for the device, camera hardware, browser, Internet connection, and Nigerian telecommunications carrier used to access Owltside. While Owltside’s PWA offers optional local caching, offline ticket viewing, and offline gate scan queuing, live sign-in, checkout, transfers, and live HMAC signature verification require network connectivity and a compatible secure browser context. Owltside is not liable for device failures, carrier outages, or any virus, malware, or harmful material affecting your device outside our reasonable control.
							</p>

							<h3>13. Indemnification</h3>
							<p>
								You acknowledge that Internet transmissions carry inherent risks. To the fullest extent permitted by Nigerian law, you agree to indemnify, defend, and hold harmless Owltside — together with its founders, directors, officers, employees, partners, successors, and assigns — from and against all claims, actions, proceedings, demands, damages, liabilities, chargebacks, penalties, and reasonable legal costs arising out of or related to your use or misuse of the Platform, your breach of this T&amp;C, any content or event you submit, or your violation of any law or third-party right.
							</p>

							<h3>14. Availability of the Platform and Services</h3>
							<p>
								14.1 While We invest continuously in testing and operating Owltside, temporary glitches, slowdowns, maintenance windows, or third-party outages may occur. We do not guarantee uninterrupted 24/7 availability of the Platform. Keep accessible copies of key event details and arrive early at venues to allow time for gate verification.
							</p>
							<p>
								14.2 We are constantly improving Owltside and reserve the right to add, modify, disable, or discontinue features (such as retiring legacy authentication methods or updating fee tiers) temporarily or permanently, with or without prior notice where permitted by law.
							</p>

							<h3>15. Termination, Suspension and Account Deletion</h3>
							<p>
								<strong>15.1 Termination by Owltside:</strong> We may restrict, suspend, or terminate your access to all or any part of the Platform at any time, with or without prior notice, including for suspected breach of this T&amp;C, fraudulent transactions, underage use, or risk to other Users. We will cooperate fully with Nigerian law enforcement authorities, regulators, or court orders requiring disclosure of records associated with suspected unlawful conduct. Provisions relating to intellectual property, settlements, chargebacks, indemnification, limitation of liability, and dispute resolution survive any suspension or termination.
							</p>
							<p>
								<strong>15.2 Account Deletion / Withdrawal by You:</strong> You have the right to stop using Owltside and delete your account at any time via <strong>Settings → Delete Account</strong> or by emailing <a href="mailto:owltside.app@gmail.com">owltside.app@gmail.com</a>. Deleting your account removes your public profile and sign-in access and may forfeit access to active Passes, chats, and organizer tools; certain anonymized or statutory transaction, audit, and settlement records are retained as required by law and described in our <a href="#privacy">Privacy Policy</a>.
							</p>

							<h3>16. Representations and Warranties</h3>
							<p>By using the Platform, you represent and warrant that:</p>
							<ol>
								<li>you have read, understood, and accepted this T&amp;C;</li>
								<li>you are at least <strong>18 (eighteen) years of age</strong>;</li>
								<li>all Personal Information, event listings, and verification/payout details submitted to Us are true, accurate, authentic, current, and complete;</li>
								<li>you grant Us the right to process your Personal Information in accordance with this T&amp;C and our <a href="#privacy">Privacy Policy</a>;</li>
								<li>you will comply with this T&amp;C without prejudice to any other rights Owltside holds under the laws of the Federal Republic of Nigeria;</li>
								<li>you shall not assign or transfer your account or rights under this T&amp;C (save for permitted in-app 1-to-1 Pass transfers) without our prior written consent;</li>
								<li>your use of the Platform does not violate any applicable Nigerian law or any contract binding on you; and</li>
								<li>where you accept this T&amp;C on behalf of a company, promoter collective, or legal entity, you have full corporate authority to bind that entity.</li>
							</ol>

							<h3>17. Limitation of Liability</h3>
							<p class="legal-caps">
								OWLTSIDE IS NOT A PARTY TO ANY EVENT ATTENDANCE CONTRACT, VENUE ARRANGEMENT, OR DISPUTE BETWEEN EVENT ORGANISERS AND EVENT ATTENDEES, NOR DO WE GUARANTEE THE CONDUCT OF USERS OR EVENT ATTENDEES. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE NIGERIAN LAW, WE EXCLUDE ALL LIABILITY ARISING FROM ENFORCEMENT OR MODERATION ACTIONS TAKEN TO PROTECT THE PLATFORM. YOUR SOLE REMEDY FOR DISSATISFACTION WITH THE PLATFORM IS TO STOP USING THE PLATFORM. UNDER NO CIRCUMSTANCES SHALL OWLTSIDE BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, PUNITIVE, OR EXEMPLARY DAMAGES (COLLECTIVELY, “EXCLUDED DAMAGES”) ARISING OUT OF OR IN ANY WAY CONNECTED WITH YOUR USE OF OR INABILITY TO USE THE PLATFORM — INCLUDING LOSS OF ANTICIPATED PROFITS, TICKET SALES, BUSINESS, REVENUE, GOODWILL, REPUTATION, OR DATA; DENIAL OF SERVICE, INTERRUPTIONS, GATEWAY DELAYS, OR OPERATOR ERRORS; FAILURE OF TELECOMMUNICATIONS OR INTERNET NETWORKS; FORCE MAJEURE EVENTS (FLOOD, STORM, FIRE, EPIDEMIC, WAR, INSURRECTION, TERRORIST ACT, RIOT, LABOUR DISPUTE, EMERGENCY, OR GOVERNMENT ACTION); OR UNAUTHORIZED THIRD-PARTY ACCESS TO YOUR DEVICE, EMAIL, OR QR PASS — SAVE ONLY WHERE LIABILITY CANNOT LAWFULLY BE EXCLUDED UNDER NIGERIAN LAW.
							</p>

							<h3>18. Disclaimer of Warranties</h3>
							<p class="legal-caps">
								YOU ACKNOWLEDGE AND AGREE THAT THE PLATFORM AND SERVICES ARE PROVIDED ON AN “AS IS” AND “AS AVAILABLE” BASIS. NEITHER OWLTSIDE NOR ITS FOUNDERS, OFFICERS, EMPLOYEES, OR AGENTS GUARANTEE THE ACCURACY, RELIABILITY, COMPLETENESS, SAFETY, OR QUALITY OF ANY USER-SUBMITTED EVENT LISTING OR PROFILE ON THE PLATFORM, NOR DO WE WARRANT THAT THE PLATFORM WILL ALWAYS BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
							</p>

							<h3>19. Third-Party Service Providers &amp; Disclaimer</h3>
							<p>
								To deliver a seamless experience in Nigeria, Owltside integrates third-party service providers — including <strong>Paystack</strong> (NGN payment processing), <strong>Supabase</strong> (authentication, database, and realtime infrastructure), <strong>Google</strong> (optional OAuth sign-in), and <strong>Cloudflare</strong> (Turnstile bot protection and security), as well as external map and social links. Owltside does not control these independent providers and is not responsible for their separate terms of service, uptime, or privacy practices. If you do not accept the applicable terms of required payment or authentication providers, do not transact on the Platform. Any dispute strictly concerning a third-party payment instrument or external service shall be governed by the terms of that provider, and you hold Owltside harmless from losses caused solely by third-party provider failures.
							</p>

							<h3>20. Governing Law and Dispute Resolution</h3>
							<p>
								20.1 This T&amp;C shall be governed by and construed in accordance with the <strong>Laws of the Federal Republic of Nigeria</strong>.
							</p>
							<p>
								20.2 Any claim, controversy, complaint, or dispute arising out of or in connection with your use of the Platform (“Dispute”) shall first be addressed through good-faith mutual consultation between you and Owltside (initiated by written notice to <a href="mailto:owltside.app@gmail.com">owltside.app@gmail.com</a>). Any Dispute that cannot be resolved amicably within <strong>30 (thirty) days</strong> of formal written notice shall be referred to and finally resolved by arbitration in accordance with the <strong>Arbitration and Mediation Act, 2023</strong>. The parties shall jointly appoint a sole arbitrator. Where the parties are unable to agree on a sole arbitrator within <strong>14 (fourteen) days</strong> of a request to refer the Dispute to arbitration, either party may apply to the Chairman of the Chartered Institute of Arbitrators, UK (Nigeria Branch) to appoint the arbitrator. The seat and place of arbitration shall be <strong>Lagos State, Nigeria</strong>, and proceedings shall be conducted in the English language. The arbitral award shall be final and binding, and judgment upon the award may be entered in any court of competent jurisdiction. Notwithstanding the foregoing, Owltside reserves the right, at its option, to institute legal proceedings or seek urgent injunctive relief regarding any Dispute before any Nigerian court of competent jurisdiction.
							</p>

							<h3>21. Severability and Miscellaneous Provisions</h3>
							<p>
								21.1 If any provision of this T&amp;C is held unlawful, void, or unenforceable, the remaining provisions shall remain in full force and effect. Failure by Owltside to enforce any right or provision shall not constitute a waiver of such right or provision.
							</p>
							<p>
								21.2 You shall comply with all applicable federal, state, and local laws and regulations in Nigeria governing your use of the Platform. Owltside may assign its rights and obligations under this T&amp;C without your prior consent. Nothing in this T&amp;C creates a partnership, joint venture, agency, or employment relationship between you and Owltside.
							</p>
						</div>
					</section>

					<!-- ================================================================ -->
					<!-- 3. PRIVACY POLICY                                                -->
					<!-- ================================================================ -->
					<section id="privacy" class="scroll-mt-24 rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-8">
						<div class="flex flex-wrap items-center justify-between gap-2 border-b border-surface-glass-border pb-4">
							<div class="flex items-center gap-2.5">
								<ShieldCheck class="h-5 w-5 text-primary shrink-0" />
								<h2 class="font-display text-headline-md text-on-surface">Privacy Policy 🇳🇬</h2>
							</div>
							<span class="font-code text-[11px] tracking-[0.1em] uppercase text-on-surface-variant">Last Updated: {updated}</span>
						</div>

						<div class="policy-copy">
							<p>
								<strong>OWLTSIDE (“Owltside”, “We”, “Us”, or “Our”)</strong> respects the privacy of our users across Nigeria. This Privacy Policy explains how We collect, use, disclose, store, and safeguard your personal data when you visit or use our web application, Progressive Web App (PWA), and related services (collectively, the “Site” or “Platform”) in accordance with the <strong>Nigeria Data Protection Act, 2023 (NDPA)</strong> and regulations issued by the <strong>Nigeria Data Protection Commission (NDPC)</strong>.
							</p>
							<p>
								We reserve the right to update this Privacy Policy at any time. We will alert you to changes by updating the “Last Updated” date at the top of this policy and, where material, via an in-app announcement or notification on the Site. Changes take effect upon posting. You are required to ensure that the personal information you provide to Us is complete, accurate, and up to date.
							</p>

							<h3>1. Collection of Your Information</h3>
							<p>
								We collect information through account registration, profile and event forms, checkout orders, verification submissions, messaging, cookies, browser storage, and security tokens. Depending on how you use Owltside, the categories of data We handle include:
							</p>
							<ul>
								<li>
									<strong>Personal &amp; Profile Data:</strong> Personally identifiable details you voluntarily provide — such as your full name, username (<code>@handle</code>), email address, phone number, Nigerian city/state, bio, event interests, profile avatar, profile banner, and chosen Operating Identity (<em>Attendee</em>, <em>Organizer</em>, or <em>Guest</em>). Refusing to provide required account details may prevent you from purchasing Passes, messaging, or hosting events.
								</li>
								<li>
									<strong>Passwordless Sign-In &amp; OAuth Data:</strong> Email OTP verification status and, if you choose <em>Continue with Google</em>, basic account details returned by Google OAuth (your verified email address, display name, and profile photo URL where your Owltside profile field is empty). Biometric/passkey authentication is currently disabled, and legacy local biometric browser markers are automatically cleared.
								</li>
								<li>
									<strong>Verification &amp; Payout Data (KYC / KYB):</strong> When you verify your identity or link a payout account in <em>Settings → Verification</em>, We collect your legal name and date of birth (as shown on your government ID), phone number, and Nigerian bank name plus 10-digit NUBAN account number (displayed back masked to the last four digits) together with admin review history.
								</li>
								<li>
									<strong>Ticketing, Transfers &amp; Gate Check-In Data:</strong> Order reservations, ticket tiers, NGN fee quote audit logs, promo code redemptions, Pass ownership and 1-to-1 <code>@handle</code> transfer logs, dynamic HMAC QR verification records, and gate check-in timestamps (including gate name and authorized staff scanner activity).
								</li>
								<li>
									<strong>Financial Data:</strong> <strong>Owltside does not store your payment card numbers, CVVs, card PINs, or online banking credentials.</strong> All NGN payments (Card, Bank Transfer, and USSD) are processed directly by our licensed payment processor, <strong>Paystack</strong>, which stores payment instrument data under its own PCI-DSS security controls and privacy policy. Owltside receives only transaction references, payment status, and settlement metadata.
								</li>
								<li>
									<strong>Community, Messaging &amp; Moderation Data:</strong> Follower/following relationships, Organizer first-contact Message Requests, Realtime Inbox direct messages and participant read states, Speaker/Lineup invitations and responses, Event Broadcast announcements, and confidential Content Reports submitted on listings or profiles.
								</li>
								<li>
									<strong>Derivative, Device &amp; PWA Data:</strong> Technical metadata automatically collected when you access the Site — such as IP address (used for security logging and privacy-preserving rate limiting), browser and OS type, access timestamps, Cloudflare Turnstile bot-challenge tokens, and optional Web Push subscription keys. When an Event Organiser or gate staff member uses the in-app camera QR scanner, video frames are decoded locally on the device in real time and are <strong>never recorded or uploaded</strong> to Owltside servers.
								</li>
							</ul>

							<h3>2. Use of Your Information</h3>
							<p>Having accurate information permits Us to deliver a secure, fast, and tailored Nigerian event experience. Specifically, We use personal data collected via the Site to:</p>
							<ul>
								<li>create, authenticate, and protect passwordless User Profiles across Attendee, Organizer, and Admin roles;</li>
								<li>publish moderated Nigerian event listings, schedules, speaker lineups, and venue discovery maps;</li>
								<li>compute NGN tiered fee quotes, validate private promo codes, reserve inventory, and verify payments via Paystack;</li>
								<li>mint tamper-evident rotating HMAC QR Gate Passes, execute 1-to-1 Pass transfers, and validate live/offline gate check-ins;</li>
								<li>review and decide identity/phone/NUBAN verifications, Ticket refund requests, event moderation submissions, and post-event organizer payouts;</li>
								<li>deliver Realtime Inbox messages, Message Requests, Speaker/Lineup invites, Organizer Broadcasts, and platform announcements;</li>
								<li>tailor event discovery recommendations when you enable <em>Personalized recommendations</em> in Settings;</li>
								<li>compile aggregated, non-identifying operational analytics to maintain performance and control data-transfer budgets;</li>
								<li>detect and prevent ticket scalping, duplicate QR scans, brute-force abuse, spam, fake listings, and financial fraud;</li>
								<li>investigate Content Reports, resolve disputes, troubleshoot support enquiries, and comply with Nigerian legal, tax, and regulatory obligations.</li>
							</ul>

							<h3>3. Legal Bases for Processing Your Personal Data</h3>
							<p>
								Under the <strong>Nigeria Data Protection Act, 2023 (NDPA)</strong>, We process personal data on one or more lawful grounds depending on the specific activity. Contact <a href="mailto:owltside.app@gmail.com">owltside.app@gmail.com</a> if you require clarity on the specific legal ground relied upon for any processing activity.
							</p>
							<h4>Consent and Access Rights</h4>
							<ul>
								<li>We obtain your consent for specific activities via signup tick-boxes or in-app toggles (such as optional Web Push notifications, analytics cookies, and personalized discovery). Where processing relies on consent, you may withdraw your consent at any time via Settings or in writing to <a href="mailto:owltside.app@gmail.com">owltside.app@gmail.com</a>, without affecting the lawfulness of prior processing.</li>
								<li>If We intend to process your personal data for a new purpose incompatible with the original purpose of collection, We will seek your prior consent where required by law.</li>
								<li>In the event of any merger, acquisition, corporate reorganization, or transfer of all or part of Owltside’s business or assets, your personal data held with Owltside may be transferred or assigned to the successor controller/processor, and Owltside will ensure you are notified of such transfer as required by applicable law.</li>
								<li>No consent shall be sought, given, or accepted in any circumstance that may engender direct or indirect propagation of atrocities, hate, child rights violations, criminal acts, or anti-social conduct.</li>
								<li>You may request access to, or modification/rectification of, your personal data held by Us by emailing <a href="mailto:owltside.app@gmail.com">owltside.app@gmail.com</a> (or updating fields directly in Settings). To protect your account, We require reasonable verification of your identity before fulfilling access, modification, or erasure requests, and may decline manifestly unfounded or unlawful requests as permitted by the NDPA.</li>
							</ul>

							<h4>Other Lawful Bases</h4>
							<ul>
								<li><strong>Performance of a Contract:</strong> Processing necessary to fulfil our agreement with you — including issuing Passes, executing transfers, moderating events, and settling verified payouts — or taking pre-contractual steps at your request.</li>
								<li><strong>Legitimate Interests:</strong> Securing the Platform against fraud and QR forgery, moderating community safety reports, rate-limiting abuse, and improving core service reliability.</li>
								<li><strong>Legal Obligation:</strong> Complying with Nigerian tax, anti-fraud, financial record-keeping, law-enforcement, and data-protection obligations.</li>
								<li><strong>Vital or Public Interest:</strong> Protecting the vital safety of attendees or another natural person at an event, or performing tasks in the public interest where mandated by law.</li>
							</ul>

							<h3>4. Your Data Protection Rights</h3>
							<p>Under the NDPA 2023, you have rights regarding how We handle your personal data, including the right:</p>
							<ol>
								<li>where our legal basis is consent, to withdraw that consent at any time;</li>
								<li>to request confirmation of and access to the personal data We hold about you;</li>
								<li>to object to or opt out of optional promotional or personalized discovery processing;</li>
								<li>to object to processing of your personal data in specific circumstances;</li>
								<li>to request erasure of your personal data without undue delay where: (a) it is no longer necessary for the purposes collected; (b) consent has been withdrawn and no other legal basis applies; (c) you validly object to legitimate-interest processing with no overriding grounds; or (d) processing is unlawful;</li>
								<li>to rectify inaccurate personal data or complete incomplete data;</li>
								<li>to request restriction of processing in specific circumstances (for example, while accuracy is contested);</li>
								<li>not to be subject to a decision based solely on automated processing, including profiling, that produces legal or similarly significant effects — noting that Owltside’s event publishing, KYC verification, refunds, and payouts involve human administrator review;</li>
								<li>to prevent processing likely to cause unwarranted substantial damage or distress;</li>
								<li>to data portability in a structured, commonly used, machine-readable format where applicable;</li>
								<li>to be notified of a personal data breach likely to result in a high risk to your rights and freedoms;</li>
								<li>to lodge a complaint with the <strong>Nigeria Data Protection Commission (NDPC)</strong> or other competent regulatory authority; and</li>
								<li>in applicable circumstances, to ask for eligible personal data to be transmitted directly to another controller where technically feasible.</li>
							</ol>

							<h3>5. Disclosure of Your Information</h3>
							<p>Owltside <strong>does not sell your personal data</strong> to third-party data brokers or ad networks. We share information only in the following transparent situations:</p>
							<ul>
								<li><strong>Event Organisers &amp; Authorized Gate Staff:</strong> When you purchase or hold a Pass, accept a Speaker/Lineup invite, or message an Event Organiser, the relevant Event Organiser (and their authorized gate staff strictly for entry validation) receives necessary attendee manifest details (holder name, <code>@handle</code>, tier, Pass code, and check-in status). Organisers are contractually bound to use this data solely for managing the event in compliance with the NDPA.</li>
								<li><strong>Other Users &amp; Public Visibility:</strong> Public profiles (name, <code>@handle</code>, avatar, banner, bio, city, follower counts) and published events are visible to visitors and Users. You can enable <em>Private profile</em> or disable <em>Show attended events</em> in <em>Settings → Privacy</em>. Direct messages and 1-to-1 Pass transfers are visible to the counterparty. Reports filed via the <em>Report</em> sheet remain confidential — the reported organizer or profile is never told who submitted the report.</li>
								<li><strong>Trusted Third-Party Service Providers:</strong> We share necessary data with infrastructure providers acting on our behalf — including <strong>Paystack</strong> (NGN payments and settlements), <strong>Supabase</strong> (PostgreSQL database, OTP/OAuth authentication, and realtime messaging), <strong>Google</strong> (when you choose Google sign-in), and <strong>Cloudflare</strong> (Turnstile bot protection and network security), plus transactional email delivery services.</li>
								<li><strong>By Law or to Protect Rights &amp; Safety:</strong> Where reasonably necessary to comply with Nigerian law, legal process, or enforceable governmental requests, investigate policy violations, detect or prevent ticket fraud, or protect the safety, rights, and property of Owltside, attendees, venues, or the public.</li>
								<li><strong>Affiliates &amp; Business Transfers:</strong> With corporate affiliates bound by this Privacy Policy, or in connection with a reorganization, merger, investment, or asset sale subject to NDPA safeguards.</li>
							</ul>

							<h3>6. Tracking Technologies, Cookies &amp; Local Storage</h3>
							<p>
								We use HTTP-only authentication cookies, security tokens, browser <code>localStorage</code>, and Service Worker caches to keep you signed in, remember your theme and accessibility settings, cache offline passes, hold local event-wizard drafts, and queue offline gate scans. We do not use third-party behavioral ad-network trackers. You can manage optional <em>Analytics</em> and <em>Personalization</em> cookie preferences at any time in <a href="/settings">Settings → Help &amp; Legal</a>, and read full technical details in our <a href="#cookies">Cookies &amp; Local Storage</a> policy below.
							</p>

							<h3>7. Third-Party Websites &amp; Links</h3>
							<p>
								Event pages, venue directions, and profiles may link to external websites or apps (such as Google Maps, Paystack checkout, Instagram, X, or TikTok). Once you leave Owltside, any data you provide to third parties is governed by their own privacy policies, and Owltside is not responsible for the content, security, or privacy practices of external sites.
							</p>

							<h3>8. Security &amp; Personal Data Protection Principles</h3>
							<p>
								We implement administrative, technical, and cryptographic safeguards — including TLS encryption, database Row-Level Security (RLS), server-side service-role isolation, hash-only staff scanner PINs, and 30-second rotating HMAC QR signatures. However, no online platform or electronic storage method is 100% impenetrable; please keep your email account secure and never send payment card details or 6-digit OTP codes by email or chat.
							</p>
							<p>In processing your personal data, Owltside adheres to the core data protection principles requiring that personal data be:</p>
							<ul>
								<li>processed lawfully, fairly, transparently, and with respect for human dignity;</li>
								<li>collected only for specified, explicit, and legitimate purposes and not further processed incompatibly;</li>
								<li>adequate, relevant, and limited to what is necessary for those purposes;</li>
								<li>accurate and, where necessary, kept up to date;</li>
								<li>retained in identifiable form for no longer than necessary for the purposes processed; and</li>
								<li>processed securely using appropriate technical and organisational measures against unauthorized processing, accidental loss, destruction, or damage.</li>
							</ul>

							<h3>9. Policy for Children (Strictly 18+)</h3>
							<p>
								Owltside does not knowingly solicit data from, market to, or allow accounts for anyone under the age of <strong>18</strong>. If you believe an account belongs to someone under 18, please flag the profile using the in-app <em>Report</em> button (<em>Person appears to be under 18</em>) or email <a href="mailto:owltside.app@gmail.com">owltside.app@gmail.com</a> so We can promptly investigate and remove unauthorized data.
							</p>

							<h3>10. International Transfer of Personal Data</h3>
							<p>
								While Owltside serves Nigeria exclusively, cloud infrastructure providers we rely upon (such as Supabase, Cloudflare, and Google) may process or store encrypted data on servers located outside Nigeria. Whenever personal data is transferred outside Nigeria, We ensure appropriate safeguards required under Part VI of the <strong>Nigeria Data Protection Act, 2023</strong> — such as adequacy determinations, standard contractual clauses, or other lawful transfer mechanisms. Contact Us if you want further details on applicable transfer safeguards.
							</p>

							<h3>11. Account Management, Communications &amp; Data Retention</h3>
							<ul>
								<li><strong>Review, Edit &amp; Self-Service Account Deletion:</strong> You can update your profile, privacy toggles, and notification preferences in <a href="/settings">Settings</a>, or permanently delete your account via <strong>Settings → Delete Account</strong> (or by contacting Us below). Upon deletion, your active profile and login credentials are removed, while necessary anonymized or statutory ledger records are retained solely to prevent fraud, resolve pending disputes/chargebacks, enforce our Terms, and satisfy legal obligations.</li>
								<li><strong>Communications Preferences:</strong> You can adjust optional push and in-app notification preferences in Settings. Transactional emails and critical security/ticket notices remain active while you hold an account or active Passes.</li>
								<li><strong>Data Retention Period:</strong> Owltside retains personal data only for as long as necessary to provide the Services and manage your relationship with Owltside, and for a maximum of <strong>ten (10) years</strong> following termination or completion of relevant transactions where required to comply with Nigerian tax, accounting, audit, financial-integrity, and regulatory obligations.</li>
							</ul>

							<h3>12. Contact Us</h3>
							<p>
								If you have questions, comments, or data-rights requests regarding this Privacy Policy, please contact Owltside at <a href="mailto:owltside.app@gmail.com">owltside.app@gmail.com</a> or call <a href="tel:+2349071401036">+234 907 140 1036</a>.
							</p>
						</div>
					</section>

					<!-- ================================================================ -->
					<!-- 4. TICKET SERVICES AGREEMENT (ORGANIZERS)                        -->
					<!-- ================================================================ -->
					<section id="tsa" class="scroll-mt-24 rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-8">
						<div class="flex flex-wrap items-center justify-between gap-2 border-b border-surface-glass-border pb-4">
							<div class="flex items-center gap-2.5">
								<Ticket class="h-5 w-5 text-primary shrink-0" />
								<h2 class="font-display text-headline-md text-on-surface">Ticket Services Agreement 🇳🇬</h2>
							</div>
							<span class="font-code text-[11px] tracking-[0.1em] uppercase text-on-surface-variant">Last Updated: {updated}</span>
						</div>

						<div class="policy-copy">
							<p>
								This Ticket Services Agreement (“Agreement” or “TSA”) is a legally binding agreement between <strong>Owltside</strong> (“Owltside”, “We”, or “Us”) and <strong>you</strong> (“you”, “the Client”, or “Event Organiser”). It governs the conditions under which you engage Owltside to provide event listing, moderation, inventory management, digital Ticket sales, gate check-in scanning, and NGN settlement services within the Federal Republic of Nigeria.
							</p>
							<p class="legal-caps">
								YOU EXPRESSLY CONSENT THAT YOUR ACCESS TO AND USE OF OWLTSIDE ORGANIZER SERVICES SHALL BE GOVERNED BY THIS AGREEMENT, INCLUDING OUR <a href="#terms">TERMS OF USE</a>, <a href="#refunds">REFUND POLICY</a>, AND <a href="#privacy">PRIVACY POLICY</a>. THESE POLICIES FORM AN INTEGRAL PART OF THIS AGREEMENT AND ARE HEREBY INCORPORATED BY REFERENCE.
							</p>

							<h3>1. Definitions &amp; Interpretation</h3>
							<ul>
								<li><strong>“Agreement”</strong> means this Ticket Services Agreement;</li>
								<li><strong>“Business Days”</strong> means any day (other than a Saturday, Sunday, or public holiday declared by the Federal Government of Nigeria) on which commercial banks in Lagos, Nigeria are open for ordinary banking business;</li>
								<li><strong>“Chargeback”</strong> means the reversal of a transaction or demand for repayment in respect of a previously settled or verified Ticket transaction initiated by an Issuing Bank, Payment Scheme, Paystack, or other financial institution;</li>
								<li><strong>“Client”</strong> means the Event Organiser (individual or legal entity) creating, managing, or receiving proceeds for an Event on the Platform;</li>
								<li><strong>“Customer”</strong> means an Event Attendee or person who purchases or holds a Ticket to an Event organised by the Client;</li>
								<li><strong>“Event”</strong> means any live experience, show, conference, party, or activity located in Nigeria organised and hosted by the Client and submitted to the Platform;</li>
								<li><strong>“Fee Bearer”</strong> means the Client’s configured election per Event specifying whether the Platform Fee is added to the Customer’s checkout total (<code>PASS</code>) or deducted from the Client’s gross Ticket price (<code>ABSORB</code>);</li>
								<li><strong>“Held Balance”</strong> means net Ticket revenue on active, unclosed Events retained in Owltside’s settlement ledger until the Event concludes;</li>
								<li><strong>“Issuing Bank”</strong> means a financial institution that issues payment cards or operates bank accounts under the relevant Payment Scheme;</li>
								<li><strong>“NUBAN”</strong> means a 10-digit Nigerian Uniform Bank Account Number maintained with a licensed Nigerian commercial bank or microfinance/payment bank;</li>
								<li><strong>“Owltside Fees”</strong> means the tiered Platform Fee and the Payment Processing Fee applicable to Ticket orders on the Platform;</li>
								<li><strong>“Payable Balance”</strong> means net Ticket revenue on closed Events (less absorbed Owltside Fees, approved Refunds, Chargebacks, and any applicable reserve) eligible for payout request;</li>
								<li><strong>“Payment Scheme”</strong> means Verve, Mastercard, Visa, Nigerian instant bank transfer (NIP), USSD, and any affiliated payment network supported via Paystack in Nigeria;</li>
								<li><strong>“Platform”</strong> means the Owltside web application and Progressive Web App;</li>
								<li><strong>“Services”</strong> means the organizer, ticketing, gate-scanning, and settlement services described in Clause 2 of this Agreement; and</li>
								<li><strong>“Ticket”</strong> or <strong>“Gate Pass”</strong> means an electronic voucher issued via Owltside entitling the verified holder to admission to an Event.</li>
							</ul>
							<p>
								<strong>Interpretation:</strong> Headings are for convenience only; singular includes plural and vice versa; references to clauses or parties refer to clauses of and parties to this Agreement (including permitted successors and assigns); references to “it” import any gender; and “Person” includes any individual, firm, company, partnership, association, or body corporate.
							</p>

							<h3>2. Services Provided by Owltside &amp; Fee Structure</h3>
							<p>Subject to compliance with this Agreement, Owltside agrees to provide the following Services in Nigeria:</p>
							<ul>
								<li><strong>2.1 Moderated Event Listing:</strong> The Client submits Event details — including title, Nigerian state/city, venue, start/end dates (WAT), schedule, lineup, Ticket tiers, capacities, restrictions, and original poster artwork (JPEG, PNG, or WebP) — via the Organizer Event Wizard. Every submitted or edited Event enters <em>Pending Approval</em> and is listed publicly on Owltside Home, Explore, and Search once approved by an Owltside administrator.</li>
								<li><strong>2.2 NGN Ticket Order Processing:</strong> Owltside processes Ticket orders on behalf of the Client exclusively in <strong>Nigerian Naira (NGN)</strong> via Paystack (Card, Bank Transfer, and USSD) using server-authoritative inventory reservation and payment verification, and issues dynamic rotating HMAC-signed QR Gate Passes to Customers.</li>
								<li><strong>2.3 Gate Check-In &amp; Staff Scanner Operations:</strong> Owltside provides browser-based camera QR and manual gate-code verification (<code>/organizer/scan</code>), configurable venue gates, expiring hash-only Gate Staff PINs for door personnel, and offline check-in queuing.</li>
								<li><strong>2.4 Sales Records, Promo Codes &amp; Broadcasts:</strong> Owltside provides real-time sales and check-in telemetry, downloadable CSV attendee manifests, configurable private percentage Promo Codes with maximum redemption caps, Speaker/Lineup profile invitations, and Broadcast Announcements delivered to Ticket holders’ notification hubs.</li>
								<li><strong>2.5 Customer Data Access:</strong> The Client receives access to relevant Customer manifest data strictly for managing Ticket fulfilment, gate entry, and essential Event communications, provided the Client complies fully with the <strong>Nigeria Data Protection Act, 2023 (NDPA)</strong> and this Agreement.</li>
								<li><strong>2.6 Support Services:</strong> Owltside provides platform support for both Clients and Customers regarding order verification, Pass issuance, and gate-scanner operation.</li>
								<li><strong>2.7 Tiered Platform Fees &amp; Payment Processing Fees:</strong> Owltside charges a tiered <strong>Platform Fee</strong> and a <strong>Payment Processing Fee</strong> in NGN (computed in integer kobo on the server) per paid Ticket sold. Free (<code>₦0</code>) Tickets carry zero Platform Fee (and zero Processing Fee under default platform policy). Live fee breakdowns per tier are displayed in the Organizer Wizard’s Fee Preview and at Customer checkout. Depending on the Event’s configured <strong>Fee Bearer</strong> (<code>PASS</code> or <code>ABSORB</code>) and platform processing policy, Owltside Fees are collected at checkout and/or automatically deducted before calculating the Client’s net revenue.</li>
								<li><strong>2.8 Changes to Fee Structure:</strong> Owltside reserves the right to adjust active fee tiers, fixed kobo components, or caps. Owltside will provide at least <strong>five (5) Business Days’</strong> prior notice of material fee changes (via the Organizer Console, email, or Platform notice), and updated rules apply only to subsequent quotes and orders. Continued use of Organizer Services after the notice period constitutes acceptance of the updated fees.</li>
								<li><strong>2.9 No Fee Refunds:</strong> Owltside will <strong>not</strong> refund any Platform Fee or Payment Processing Fee charged on an original transaction if that Ticket is subsequently refunded, cancelled, or subjected to a Chargeback or Dispute.</li>
							</ul>

							<h3>3. Event Accuracy, Moderation &amp; Restrictions</h3>
							<p>
								<strong>3.1 Accurate Event Information:</strong> The Client must submit complete, truthful, and current Event details and authentic poster artwork when creating or editing an Event. Unpublished drafts and Events in <em>Pending Approval</em>, <em>Rejected</em>, or <em>Suspended</em> status cannot sell Tickets.
							</p>
							<p>
								<strong>3.2 Disclosure of Restrictions:</strong> The Client is solely responsible for clearly stating all admission conditions at the time of submission — including 18+ age verification, dress codes, gate closing times, capacity limits, or accessibility conditions.
							</p>
							<p>
								<strong>3.3 Compliance with Nigerian Laws:</strong> The Client shall ensure that the Event, its venue, permits, security arrangements, noise/safety clearances, tax obligations, and admission rules comply in full with all applicable federal, state, and local laws and regulations in Nigeria.
							</p>

							<h3>4. Verification, Post-Event Settlements &amp; Chargebacks</h3>
							<p>
								<strong>4.1 Mandatory Verification (KYC &amp; NUBAN):</strong> Before requesting or receiving any payout, the Client must submit and hold active administrator approval in <strong>Settings → Verification</strong> for: (a) Phone verification; (b) Legal Identity verification matching official ID; and (c) a valid 10-digit Nigerian <strong>NUBAN</strong> payout account in an accepted Nigerian bank. Owltside administrators may require re-verification if account details change or compliance concerns arise, during which payouts remain paused until fresh details are approved.
							</p>
							<p>
								<strong>4.2 Post-Event Settlement Lifecycle:</strong> Net Ticket proceeds on active Events remain in the Client’s <strong>Held Balance</strong> while the Event is open to protect Customers against cancellations and facilitate eligible refunds. Once the Event has officially ended (<em>Closed</em>), eligible net proceeds transition to the Client’s <strong>Payable Balance</strong>, enabling the Client to submit a <strong>Payout Request</strong> from the Organizer Console for administrator review and NGN transfer to the Client’s verified NUBAN account.
							</p>
							<p>
								<strong>4.3 Responsibility for Chargebacks:</strong> Issuing Banks or Payment Schemes may impose Chargebacks on disputed or fraudulent transactions. Owltside is entitled to debit or deduct the full value of any Chargeback (plus any gateway dispute fee) from the Client’s Held or Payable Balance, or offset it against future Events.
							</p>
							<p>
								<strong>4.4 Client’s Obligation to Reimburse:</strong> If a Chargeback or payment reversal occurs after Event proceeds have already been settled to the Client, the Client must reimburse the amount due to Owltside within <strong>thirty (30) days</strong> of receiving written notice/invoice. Failure to pay may result in immediate account suspension, termination of this Agreement, and debt recovery proceedings.
							</p>
							<p>
								<strong>4.5 No Obligation to Contest &amp; Rolling Reserve:</strong> Owltside is not obligated to contest the validity of Chargebacks imposed by an Issuing Bank or Payment Scheme. Owltside reserves the right to withhold a rolling reserve of up to <strong>five percent (5%)</strong> of gross Event sales for up to <strong>ninety (90) days</strong> after the completion of an Event (or hold disputed balances) to cover potential Chargebacks, fraud investigations, or unresolved Refund Requests.
							</p>

							<h3>5. Refunds, Postponements &amp; Cancellations</h3>
							<p>
								<strong>5.1 Client Responsibility &amp; In-App Refund Workflow:</strong> The Client bears ultimate financial responsibility for Ticket refunds, including refunds arising from Event cancellation, postponement, or material alteration. Where a Customer submits an eligible in-app Refund Request (including within Owltside’s 72-hour pre-event policy window or following an Event cancellation) and the refund is approved while funds remain in the Event’s Held Balance, the refunded Ticket amount is automatically deducted from the Event’s gross ledger so the Client’s net balance reconciles accurately. Where payouts have already been disbursed, the Client must promptly fund all owed Customer refunds directly or reimburse Owltside upon demand.
							</p>
							<p>
								<strong>5.2 Mandatory Cancellation Notification:</strong> The Client must notify Owltside (<a href="mailto:owltside.app@gmail.com">owltside.app@gmail.com</a>) and all Ticket holders (via Organizer Broadcast Announcement) of any planned Event cancellation or postponement at least <strong>five (5) Business Days</strong> prior to the scheduled Event start date (or immediately in the case of a sudden emergency/force majeure). Failure to provide timely notice may result in account suspension, forfeiture of organizer privileges, and administrative penalties.
							</p>

							<h3>6. Client Indemnification</h3>
							<p>
								<strong>6.1 Indemnity:</strong> The Client agrees to indemnify, defend, and hold Owltside harmless from and against all claims, demands, damages, Customer refunds, Chargebacks, losses, regulatory fines, judgments, and legal fees arising out of or relating to:
							</p>
							<ul>
								<li>the Client’s breach of any representation, warranty, or obligation in this Agreement;</li>
								<li>the negligent, reckless, or intentional acts or omissions of the Client, its venue operators, performers, gate staff, employees, or contractors;</li>
								<li>any inaccurate, misleading, infringing, or unlawful Event listing, poster artwork, promo configuration, or broadcast provided by the Client (save to the extent caused directly by Owltside’s gross negligence);</li>
								<li>any misuse, unauthorized disclosure, or breach of Customer personal data accessed by the Client or its staff; or</li>
								<li>the cancellation, postponement, overcrowding, injury, property damage, or safety incident at any Event.</li>
							</ul>

							<h3>7. Limitation of Liability</h3>
							<p>
								<strong>7.1 Exclusion of Liability:</strong> Owltside is not a party to the underlying attendance contract or disputes between the Client and its Customers. Owltside excludes liability for fraudulent Customer payments, bank/gateway settlement delays, telecom outages, or external factors beyond our reasonable control.
							</p>
							<p>
								<strong>7.2 Excluded Damages &amp; Sole Remedy:</strong> Under no circumstances shall Owltside be liable to the Client for any direct, indirect, incidental, consequential, special, or exemplary damages — including loss of anticipated profits, Ticket revenue, sponsorship, goodwill, or data; business interruption; or third-party unauthorized access to Client devices or shared staff PINs. The Client’s sole remedy for dissatisfaction with the Platform is to discontinue use of Organizer Services, subject to settlement of undisputed closed-event balances net of Chargebacks, refunds, and fees.
							</p>

							<h3>8. Platform Use and Disclaimer of Warranties</h3>
							<p>
								<strong>8.1 Acceptable Platform Use:</strong> The Client agrees to use Owltside solely for bona fide Nigerian Event management and Ticket sales, and never for fictitious events, wash transactions, cash-advance schemes, or unlawful activities.
							</p>
							<p>
								<strong>8.2 Disclaimer:</strong> Owltside provides the Platform, Gate Scanner, and Services on an “as-is” and “as-available” basis without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, or uninterrupted uptime.
							</p>

							<h3>9. Confidentiality, Attendee Data &amp; Non-Disclosure</h3>
							<p>
								<strong>9.1 Confidentiality &amp; NDPA Compliance:</strong> In the course of providing the Services, Owltside makes confidential information available to the Client — including Customer manifests, check-in records, fee configurations, and operational workflows (“Confidential Information”). The Client agrees not to sell, rent, publish, or disclose Confidential Information or Customer personal data to third parties without Owltside’s prior written consent and any required Customer consent under the NDPA 2023.
							</p>
							<p>
								<strong>9.2 Permitted Disclosures &amp; Survival:</strong> Confidential Information may only be disclosed to professional legal/tax advisers under confidentiality duties or as mandated by Nigerian authorities, provided the Client gives Owltside prior written notice where lawful. These confidentiality and data-protection obligations survive termination of this Agreement indefinitely.
							</p>

							<h3>10. Client Representations and Warranties</h3>
							<p>The Client represents and warrants on a continuing basis that:</p>
							<ul>
								<li><strong>10.1 Legal Authority:</strong> The Client is at least 18 years old and has full legal capacity and corporate authority to enter into this Agreement and to organize, promote, and stage the Events listed;</li>
								<li><strong>10.2 Event Ownership:</strong> The Client is the legitimate owner, producer, or duly authorized representative of every Event submitted under its account and holds the right to offer, sell, and honour all Tickets sold;</li>
								<li><strong>10.3 Legal &amp; Tax Compliance:</strong> All Events, venues, and Ticket sales comply with applicable Nigerian federal, state, and local laws, including event safety rules, consumer-protection laws, and entertainment/value-added tax obligations;</li>
								<li><strong>10.4 Content Standards:</strong> All Event titles, descriptions, schedules, speaker listings, and uploaded poster images are original or properly licensed, accurate, and do not infringe third-party intellectual property, publicity, or privacy rights; and</li>
								<li><strong>10.5 Lawful Use:</strong> The Client will use Owltside strictly for legitimate Event management and gate entry operations.</li>
							</ul>

							<h3>11. Termination and Remedies</h3>
							<p>
								<strong>11.1 Immediate Suspension or Termination:</strong> Owltside reserves the right to immediately reject or suspend an Event listing, revoke scanner PINs, freeze Held/Payable Balances pending investigation, or terminate Organizer access if the Client engages in suspected fraud, lists scam or prohibited events, breaches NDPA/confidentiality obligations, incurs excessive Chargebacks, or violates Nigerian law.
							</p>
							<p>
								<strong>11.2 Legal Remedies:</strong> Owltside reserves the right to pursue all civil and criminal remedies for losses caused by the Client’s breach, including enforcing indemnification, offsetting balances, and reporting unlawful conduct to Nigerian law-enforcement authorities.
							</p>

							<h3>12. Miscellaneous Provisions</h3>
							<ul>
								<li><strong>12.1 Entire Agreement:</strong> This Agreement (together with the incorporated Terms of Use, Refund Policy, and Privacy Policy) constitutes the entire agreement between Owltside and the Client concerning Organizer Services and supersedes prior understandings.</li>
								<li><strong>12.2 Amendments:</strong> Owltside may amend or supplement this Agreement from time to time and will provide notice via the Organizer Console, on the Platform, or by email.</li>
								<li><strong>12.3 No Waiver &amp; Severability:</strong> No delay or failure by Owltside to exercise any right operates as a waiver; rights and remedies are cumulative. If any clause is held invalid or unenforceable, the remainder stays in full force and effect.</li>
								<li><strong>12.4 No Assignment by Client:</strong> The Client may not assign, transfer, subcontract, or encumber any of its rights, duties, or settlement proceeds under this Agreement without Owltside’s prior written consent.</li>
								<li><strong>12.5 Notices:</strong> Formal notices under this Agreement may be delivered electronically to the Client’s registered account email and to Owltside at <a href="mailto:owltside.app@gmail.com">owltside.app@gmail.com</a>.</li>
								<li><strong>12.6 Independent Contractor &amp; Brand Use:</strong> Owltside acts strictly as an independent technology contractor and not as a partner, joint venturer, employer, or agent of the Client. The Client shall not use Owltside’s logos or branding in external sponsorships or press materials in a manner that implies Owltside is the organizer or guarantor of an Event without Owltside’s prior written consent.</li>
							</ul>

							<h3>13. Governing Law &amp; Dispute Resolution</h3>
							<p>
								<strong>13.1 Governing Law:</strong> This Agreement is governed by and construed in accordance with the laws of the <strong>Federal Republic of Nigeria</strong>.
							</p>
							<p>
								<strong>13.2 Amicable Resolution &amp; Mediation:</strong> If any dispute arises between the Parties concerning the interpretation, implementation, or operation of this Agreement that cannot be resolved amicably within <strong>fourteen (14) days</strong> of formal written notice of dispute by either Party, the Parties (and/or their legal representatives) shall promptly confer to consider resolution by mediation or conciliation.
							</p>
							<p>
								<strong>13.3 Binding Arbitration in Lagos:</strong> If the Parties do not agree to mediation or fail to resolve the dispute, the dispute shall be referred to and finally resolved by arbitration in accordance with the <strong>Arbitration and Mediation Act, 2023</strong>. The seat of arbitration shall be <strong>Lagos, Nigeria</strong>, conducted in English before a single arbitrator jointly appointed by the Parties. Should the Parties fail to agree on an arbitrator within <strong>five (5) days</strong> after the matter is referred to arbitration, the arbitrator shall be appointed by the Chairman / President for the time being of the Chartered Institute of Arbitrators (UK) (Nigeria Branch) upon the application of either Party.
							</p>
							<p>
								<strong>13.4 Final Award &amp; Urgent Relief:</strong> The Parties undertake to carry out the arbitral award without delay. Awards shall be final and binding from the date made, and judgment upon any award may be entered in any court having jurisdiction. Nothing in this clause precludes either Party from seeking urgent interim or conservatory relief from a Nigerian court of competent jurisdiction.
							</p>
						</div>
					</section>

					<!-- ================================================================ -->
					<!-- 5. COOKIES & LOCAL STORAGE                                       -->
					<!-- ================================================================ -->
					<section id="cookies" class="scroll-mt-24 rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-8">
						<div class="flex flex-wrap items-center justify-between gap-2 border-b border-surface-glass-border pb-4">
							<div class="flex items-center gap-2.5">
								<Database class="h-5 w-5 text-primary shrink-0" />
								<h2 class="font-display text-headline-md text-on-surface">Cookies &amp; Local Storage</h2>
							</div>
							<span class="font-code text-[11px] tracking-[0.1em] uppercase text-on-surface-variant">Last Updated: {updated}</span>
						</div>

						<div class="policy-copy">
							<p>
								Cookies are small data files placed by your browser. Owltside also uses browser storage (<code>localStorage</code> and <code>sessionStorage</code>) and Service Worker caches to power Progressive Web App (PWA) features. Together, these technologies support passwordless sign-in sessions, PKCE OAuth security, light/dark appearance preferences, query caching, offline ticket wallet access, organizer wizard drafts, and offline gate check-in queues. Clearing them may sign you out, reset device preferences, or clear locally cached offline passes.
							</p>
							<p>
								<a href="/settings">Settings → Help &amp; Legal</a> provides device toggles for optional <strong>Analytics</strong> and <strong>Personalization</strong> cookies, while essential authentication and checkout cookies remain active so the Platform can function securely. These preferences are saved on your current browser/device. Your web browser also lets you block or delete cookies, though disabling essential cookies will prevent sign-in and ticket checkout. Third-party services used for payments (Paystack), authentication (Supabase / Google), or bot protection (Cloudflare Turnstile) may set their own security cookies under their respective policies.
							</p>
							<p>
								Manage your preferences anytime in <a href="/settings">Settings → Help &amp; Legal</a>, or email <a href="mailto:owltside.app@gmail.com">owltside.app@gmail.com</a> with any questions.
							</p>
						</div>
					</section>

					<!-- ================================================================ -->
					<!-- 6. LICENSES & ATTRIBUTION                                        -->
					<!-- ================================================================ -->
					<section id="licenses" class="scroll-mt-24 rounded-2xl border border-surface-glass-border bg-surface-container p-5 md:p-8">
						<div class="flex items-center gap-2.5 border-b border-surface-glass-border pb-4">
							<Landmark class="h-5 w-5 text-primary shrink-0" />
							<h2 class="font-display text-headline-md text-on-surface">Licenses &amp; attribution</h2>
						</div>
						<p class="mt-4 text-body-sm leading-relaxed text-on-surface-variant">
							Owltside uses open-source packages and infrastructure libraries under their respective licenses, including Svelte, SvelteKit, Tailwind CSS, Lucide, Supabase, jsQR, and Embla Carousel. Refer to the project’s dependency manifests and each upstream project for current license terms.
						</p>
						<a
							href="https://github.com/tomiwa-code/owltside"
							target="_blank"
							rel="noreferrer"
							class="mt-3 inline-flex items-center gap-1.5 text-body-sm text-primary hover:underline"
						>
							Project repository <ExternalLink class="h-3.5 w-3.5" />
						</a>
					</section>

					<footer class="rounded-2xl border border-surface-glass-border bg-surface-container p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
						<div class="text-body-sm text-on-surface-variant">
							<p class="font-semibold text-on-surface">Need help with an order, refund, or organizer account?</p>
							<p class="mt-1">
								Email <a href="mailto:owltside.app@gmail.com" class="text-primary underline">owltside.app@gmail.com</a> or call <a href="tel:+2349071401036" class="text-primary underline">+234 907 140 1036</a>.
							</p>
						</div>
						<SocialLinks compact />
					</footer>
				</div>
			</div>
		</div>
	</main>
</div>

<style>
	.policy-copy {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		margin-top: 1.25rem;
		line-height: 1.75;
	}
	.policy-copy :global(h3) {
		margin-top: 1rem;
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-on-surface);
	}
	.policy-copy :global(h4) {
		margin-top: 0.5rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-on-surface);
	}
	.policy-copy :global(p),
	.policy-copy :global(li) {
		font-size: 0.875rem;
		color: var(--color-on-surface-variant);
	}
	.policy-copy :global(strong) {
		color: var(--color-on-surface);
		font-weight: 600;
	}
	.policy-copy :global(ul) {
		list-style-type: disc;
		padding-left: 1.35rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.policy-copy :global(ul ul) {
		list-style-type: circle;
		margin-top: 0.45rem;
	}
	.policy-copy :global(ol) {
		list-style-type: decimal;
		padding-left: 1.35rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.policy-copy :global(a) {
		color: var(--color-primary);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.policy-copy :global(code) {
		font-family: var(--font-code, ui-monospace, monospace);
		font-size: 0.8rem;
		padding: 0.1rem 0.35rem;
		border-radius: 0.25rem;
		background: color-mix(in srgb, var(--color-on-surface) 8%, transparent);
		color: var(--color-on-surface);
	}
	.policy-copy :global(.callout) {
		margin-top: 0.5rem;
		border-radius: 0.75rem;
		border: 1px solid var(--color-surface-glass-border);
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
		padding: 0.9rem 1rem;
	}
	.policy-copy :global(.legal-caps) {
		font-size: 0.8125rem;
		line-height: 1.7;
		border-radius: 0.75rem;
		border: 1px solid var(--color-surface-glass-border);
		background: color-mix(in srgb, var(--color-on-surface) 4%, transparent);
		padding: 0.9rem 1rem;
	}
</style>
