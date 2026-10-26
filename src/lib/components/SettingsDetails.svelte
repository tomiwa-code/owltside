<script lang="ts">
	import {
		Accessibility,
		BadgeCheck,
		Bell,
		Building2,
		CheckCheck,
		Database,
		ExternalLink,
		HelpCircle,
		IdCard,
		LockKeyhole,
		Mail,
		Moon,
		ShieldCheck,
		Smartphone,
		Trash2,
		UserRound,
		Wallet,
		Phone,
		Upload
	} from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { appSettings, type AppSettings } from '$lib/state/settings.svelte';
	import { PAYOUT_BANKS, isValidNuban, maskAccountNumber, normaliseNuban } from '$lib/utils/payout';
	import { toast } from '$lib/state/toast.svelte';
	import type { ApprovalRequest } from '$lib/types';
	import ApprovalNotice from '$components/ApprovalNotice.svelte';
	import Sheet from '$components/Sheet.svelte';
	import ImageCropSheet from '$components/ImageCropSheet.svelte';

	let {
		category,
		approvals = []
	}: { category?: string; approvals?: ApprovalRequest[] } = $props();

	type NotificationToggle = 'pushEnabled' | 'emailEnabled' | 'smsEnabled' | 'eventReminders' | 'eventUpdates' | 'messages' | 'marketing' | 'quietHours';
	type PrivacyToggle = keyof AppSettings['privacy'];
	type CookieToggle = keyof AppSettings['cookies'];
	type SecurityToggle = keyof AppSettings['security'];
	type AccessibilityToggle = 'reduceMotion' | 'screenReaderLabels';
	type StorageToggle = keyof AppSettings['storage'];

	const notificationRows: Array<{ key: NotificationToggle; label: string; description: string }> = [
		{ key: 'pushEnabled', label: 'Push', description: 'Alerts on this device' },
		{ key: 'emailEnabled', label: 'Email', description: 'Receipts and important updates' },
		{ key: 'smsEnabled', label: 'SMS', description: 'Time-sensitive gate changes' }
	];
	const deliveryRows: Array<{ key: NotificationToggle; label: string; description: string }> = [
		{ key: 'eventReminders', label: 'Event reminders', description: 'Upcoming events and entry windows' },
		{ key: 'eventUpdates', label: 'Event updates', description: 'Lineup, venue and schedule changes' },
		{ key: 'messages', label: 'Messages', description: 'Organizer and attendee replies' },
		{ key: 'marketing', label: 'News and offers', description: 'Product news and occasional promotions' }
	];

	/**
	 * Identity and payout-account checks are decided by an administrator, so the
	 * stored `verification` flags are only half the story: an approved request
	 * counts as verified, and a pending one must read as "pending", never "done".
	 */
	const latestRequest = (check: string): ApprovalRequest | null =>
		approvals.find(
			(request) =>
				request.kind === 'verification' && (request.payload as { check?: string })?.check === check
		) ?? null;
	const identityRequest = $derived(latestRequest('identity'));
	const payoutRequest = $derived(latestRequest('payoutAccount'));
	const identityPending = $derived(
		identityRequest?.status === 'pending' && !appSettings.value.verification.identity
	);
	const payoutPending = $derived(
		payoutRequest?.status === 'pending' && !appSettings.value.verification.payoutAccount
	);
	const verification = $derived({
		...appSettings.value.verification,
		identity: appSettings.value.verification.identity || identityRequest?.status === 'approved',
		payoutAccount: appSettings.value.verification.payoutAccount || payoutRequest?.status === 'approved'
	});
	const isFullyVerified = $derived(Object.values(verification).every(Boolean));
	const verifiedCount = $derived(Object.values(verification).filter(Boolean).length);

	// --- verification flows ---
	let phoneOpen = $state(false);
	let phoneStep = $state<'input' | 'otp'>('input');
	let phoneNumber = $state('+234');
	let phoneOtp = $state('');
	let phoneGenerated = $state('123456');
	let phoneError = $state('');
	let identityOpen = $state(false);
	let identityStep = $state<1 | 2>(1);
	let identityDoc = $state<'NIN' | 'International Passport' | "Driver's License" | "Permanent Voter's Card (PVC)" | 'BVN'>('NIN');
	let identityName = $state('');
	let identityDob = $state('');
	let identityNumber = $state('');
	let identityFront = $state<{ name: string; preview: string | null } | null>(null);
	let identityBack = $state<{ name: string; preview: string | null } | null>(null);
	let cropSide = $state<'front' | 'back' | null>(null);
	let cropFile = $state<File | null>(null);
	let identityError = $state('');
	let payoutOpen = $state(false);
	let payoutBank = $state('');
	let payoutAccount = $state('');
	let payoutError = $state('');
	let payoutVerifying = $state(false);
	let identitySubmitting = $state(false);

	/**
	 * Submit a request for administrator review. Nothing is marked verified here:
	 * the public app only ever displays what the admin console has decided.
	 */
	async function submitForReview(body: Record<string, unknown>): Promise<string | null> {
		try {
			const response = await fetch('/api/approvals', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const payload = (await response.json().catch(() => ({}))) as { error?: string };
			if (!response.ok) return payload.error ?? 'Your request could not be submitted. Please try again.';
			await invalidateAll();
			return null;
		} catch {
			return 'Your request could not be submitted. Check your connection and try again.';
		}
	}
	const payoutVerifiedSummary = $derived(
		verification.payoutAccount && appSettings.value.payout.bank
			? `${appSettings.value.payout.bank} ${maskAccountNumber(appSettings.value.payout.accountNumber)} verified`
			: ''
	);

	function openPhone() {
		phoneError = '';
		phoneStep = 'input';
		phoneOtp = '';
		phoneGenerated = String(Math.floor(100000 + Math.random() * 900000));
		phoneOpen = true;
	}
	function sendPhoneOtp() {
		if (!phoneNumber.startsWith('+234')) {
			phoneError = 'Number must start with +234 (e.g. +2348012345678).';
			return;
		}
		const digits = phoneNumber.replace(/\D/g, '');
		if (digits.length !== 13 && digits.length !== 14) {
			// +234 + 10 digits = 13 digits without +, 14 with? Use len check
			if (!/^\+234[789]\d{9}$/.test(phoneNumber.replace(/\s/g, ''))) {
				phoneError = 'Enter a valid Nigerian number e.g. +2348031234567';
				return;
			}
		}
		if (!/^\+234[789]\d{9}$/.test(phoneNumber.replace(/\s/g, ''))) {
			phoneError = 'Enter a valid Nigerian number e.g. +2348031234567';
			return;
		}
		phoneError = '';
		phoneGenerated = String(Math.floor(100000 + Math.random() * 900000)).slice(0, 6);
		phoneStep = 'otp';
		toast(`OTP ${phoneGenerated} sent via SMS/WhatsApp to ${phoneNumber} (demo)`, 'success');
	}
	function confirmPhoneOtp() {
		if (phoneOtp.trim() !== phoneGenerated) {
			phoneError = 'Incorrect OTP. Use the code shown in the toast (demo).';
			return;
		}
		appSettings.value.verification.phone = true;
		phoneOpen = false;
		phoneError = '';
		toast('Phone number verified', 'success');
	}

	function openIdentity() {
		identityError = '';
		identityStep = 1;
		identityOpen = true;
	}
	/** A chosen document is only attached after the resize/crop step is confirmed. */
	function chooseIdentityDoc(event: Event, side: 'front' | 'back') {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		input.value = '';
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			// PDFs keep their original bytes — nothing to resize or crop.
			const attachment = { name: file.name, preview: null };
			if (side === 'front') identityFront = attachment;
			else identityBack = attachment;
			toast(`${file.name} attached — resize and crop apply to images.`, 'info');
			return;
		}
		cropFile = file;
		cropSide = side;
	}
	function closeCrop() {
		cropSide = null;
		cropFile = null;
	}
	function applyCroppedDocument(preview: string) {
		const side = cropSide;
		const attachment = { name: cropFile?.name ?? 'ID photo', preview };
		if (side === 'front') identityFront = attachment;
		else if (side === 'back') identityBack = attachment;
		toast(`${side === 'back' ? 'Back' : 'Front'} of ID fitted to the frame and attached.`, 'success');
		closeCrop();
	}
	function nextIdentity() {
		identityError = '';
		if (!identityName.trim() || !identityDob) {
			identityError = 'Enter legal name and date of birth exactly as on your ID.';
			return;
		}
		if (!identityNumber.trim()) {
			identityError = 'Enter your ID number (e.g. 11-digit NIN or BVN).';
			return;
		}
		if (identityDoc === 'NIN' && !/^\d{11}$/.test(identityNumber.replace(/\s/g, ''))) {
			identityError = 'NIN must be 11 digits.';
			return;
		}
		if (identityDoc === 'BVN' && !/^\d{11}$/.test(identityNumber.replace(/\s/g, ''))) {
			identityError = 'BVN must be 11 digits.';
			return;
		}
		identityStep = 2;
	}
	async function submitIdentity() {
		identityError = '';
		if (!identityFront) {
			identityError = 'Upload a clear photo/scan of your ID (front).';
			return;
		}
		if (identitySubmitting) return;
		identitySubmitting = true;
		const error = await submitForReview({
			kind: 'verification',
			check: 'identity',
			details: {
				document: identityDoc,
				reference: identityNumber,
				// Never send or store the document image itself in the request.
				attachment: identityBack ? 'front+back' : 'front'
			}
		});
		identitySubmitting = false;
		if (error) {
			identityError = error;
			return;
		}
		identityOpen = false;
		toast('Identity submitted — pending admin review', 'success');
	}

	function openPayout() {
		payoutError = '';
		payoutVerifying = false;
		// Re-verification starts from the account that is actually live, so the
		// sheet never looks empty while the card above shows a linked account.
		const saved = appSettings.value.payout;
		payoutBank = saved.bank;
		payoutAccount = saved.accountNumber;
		payoutOpen = true;
	}
	function closePayout() {
		payoutOpen = false;
		payoutError = '';
	}
	function onPayoutBankChange(event: Event) {
		payoutBank = (event.currentTarget as HTMLSelectElement).value;
		payoutError = '';
	}
	function onPayoutAccountInput(event: Event) {
		payoutAccount = normaliseNuban((event.currentTarget as HTMLInputElement).value);
		payoutError = '';
	}

	async function verifyPayout() {
		payoutError = '';
		if (!payoutBank) {
			payoutError = 'Select your bank.';
			return;
		}
		if (!isValidNuban(payoutAccount)) {
			payoutError = 'Enter a valid 10-digit NUBAN account number.';
			return;
		}
		payoutVerifying = true;
		const account = { bank: payoutBank, accountNumber: payoutAccount };
		// Kept on the device so the settlement card can show where payouts go, but
		// the check only flips to verified once the admin console approves it.
		appSettings.value.payout = account;
		const error = await submitForReview({
			kind: 'verification',
			check: 'payoutAccount',
			details: { bank: account.bank, accountNumber: account.accountNumber }
		});
		payoutVerifying = false;
		if (error) {
			payoutError = error;
			return;
		}
		toast(`Payout account submitted — pending admin review (${account.bank} ${maskAccountNumber(account.accountNumber)})`, 'success');
		payoutOpen = false;
	}

	function toggleNotification(key: NotificationToggle) {
		appSettings.value.notifications[key] = !appSettings.value.notifications[key];
	}
	function togglePrivacy(key: PrivacyToggle) {
		appSettings.value.privacy[key] = !appSettings.value.privacy[key];
	}
	function toggleCookie(key: CookieToggle) {
		appSettings.value.cookies[key] = !appSettings.value.cookies[key];
	}
	function toggleSecurity(key: SecurityToggle) {
		appSettings.value.security[key] = !appSettings.value.security[key];
	}
	function toggleAccessibility(key: AccessibilityToggle) {
		appSettings.value.accessibility[key] = !appSettings.value.accessibility[key];
	}
	function toggleStorage(key: StorageToggle) {
		appSettings.value.storage[key] = !appSettings.value.storage[key];
	}
	function setAppearance(value: string) {
		appSettings.value.accessibility.appearance = value as AppSettings['accessibility']['appearance'];
	}
	function setPageSize(value: string) {
		appSettings.value.accessibility.pageSize = Math.min(150, Math.max(25, Number(value) || 100));
	}
	let clearingCache = $state(false);
	async function clearOfflineCache() {
		if (clearingCache) return;
		clearingCache = true;
		try {
			if ('caches' in globalThis) {
				const keys = await caches.keys();
				await Promise.all(keys.map((key) => caches.delete(key)));
			}
			toast('Offline cache cleared. Saved account preferences were kept.', 'success');
		} catch {
			toast('The offline cache could not be cleared on this device.', 'error');
		} finally { clearingCache = false; }
	}
</script>

<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 min-w-0">
	{#if !category || category === 'verification'}
	<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 md:p-6 xl:col-span-2">
		<div class="flex items-center justify-between gap-3 mb-4">
			<div>
				<h2 class="font-display text-headline-md text-on-surface flex items-center gap-2">Verification {#if isFullyVerified}<BadgeCheck class="w-5 h-5 text-accent-emerald" />{/if}</h2>
				<p class="text-body-sm text-on-surface-variant mt-1">Complete all checks to earn the verified tick. Your tick appears only when every item is verified.</p>
			</div>
			<ShieldCheck class="w-5 h-5 text-primary shrink-0" />
		</div>

		<div class="rounded-lg border border-surface-glass-border bg-surface-container-high/40 p-3 mb-4 flex items-center justify-between gap-3">
			<div class="flex items-center gap-2">
				<div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><ShieldCheck class="w-4 h-4 text-primary" /></div>
				<div>
					<p class="text-body-sm font-semibold text-on-surface">{verifiedCount}/5 checks verified</p>
					<p class="text-xs text-on-surface-variant">{isFullyVerified ? 'Fully verified — verified tick active' : 'Complete Phone, Identity and Payout to unlock the tick'}</p>
				</div>
			</div>
			<span class="text-label-badge px-2.5 py-1 rounded-full border {isFullyVerified ? 'bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20' : 'bg-surface-container-high text-on-surface-variant border-surface-glass-border'}">{isFullyVerified ? 'Verified Member' : 'Not fully verified'}</span>
		</div>

		<!-- 1. Phone Number -->
		<div class="rounded-xl border border-surface-glass-border bg-surface-container-high/30 overflow-hidden mb-3">
			<div class="p-4">
				<div class="flex items-start justify-between gap-3">
					<div class="flex items-start gap-3">
						<span class="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0 mt-0.5"><Phone class="w-4 h-4 text-primary" /></span>
						<div>
							<h3 class="text-body-md font-semibold text-on-surface flex items-center gap-2">1. Phone Number <span class="text-label-badge px-2 py-0.5 rounded-full border {appSettings.value.verification.phone ? 'bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'}">{appSettings.value.verification.phone ? 'Verified' : 'Not Verified'}</span></h3>
							<p class="text-body-sm text-on-surface-variant mt-1"><span class="font-semibold text-on-surface">Requirement:</span> An active Nigerian phone number (registered under your name).</p>
							{#if appSettings.value.verification.phone}
								<p class="text-xs text-accent-emerald mt-1 flex items-center gap-1"><CheckCheck class="w-3 h-3" /> {phoneNumber} verified</p>
							{/if}
						</div>
					</div>
					{#if !appSettings.value.verification.phone}
						<button type="button" class="h-9 px-4 rounded-full bg-primary text-on-primary text-body-sm font-semibold shrink-0 hover:opacity-90" onclick={openPhone}>Start</button>
					{:else}
						<button type="button" class="h-9 px-4 rounded-full border border-surface-glass-border bg-surface-container-high text-on-surface text-body-sm font-semibold shrink-0" onclick={openPhone}>Re-verify</button>
					{/if}
				</div>
			</div>
		</div>

		<!-- 2. Identity -->
		<div class="rounded-xl border border-surface-glass-border bg-surface-container-high/30 overflow-hidden mb-3">
			<div class="p-4">
				<div class="flex items-start justify-between gap-3">
					<div class="flex items-start gap-3">
						<span class="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0 mt-0.5"><IdCard class="w-4 h-4 text-primary" /></span>
						<div>
							<h3 class="text-body-md font-semibold text-on-surface flex items-center gap-2 flex-wrap">2. Identity <span class="text-label-badge px-2 py-0.5 rounded-full border {verification.identity ? 'bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20' : identityPending ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'}">{verification.identity ? 'Verified' : identityPending ? 'Pending review' : 'Not Verified'}</span></h3>
							<p class="text-body-sm text-on-surface-variant mt-1"><span class="font-semibold text-on-surface">Requirement:</span> Official government-issued photo ID and matching personal details.</p>
						</div>
					</div>
					{#if !verification.identity}
						<button type="button" class="h-9 px-4 rounded-full bg-primary text-on-primary text-body-sm font-semibold shrink-0 hover:opacity-90 disabled:opacity-50" disabled={identityPending} onclick={openIdentity}>{identityPending ? 'In review' : 'Start'}</button>
					{:else}
						<button type="button" class="h-9 px-4 rounded-full border border-surface-glass-border bg-surface-container-high text-on-surface text-body-sm font-semibold shrink-0" onclick={openIdentity}>Re-verify</button>
					{/if}
				</div>
				{#if !verification.identity && identityRequest}
					<div class="mt-3">
						<ApprovalNotice request={identityRequest} pendingLabel="Identity pending admin review" pendingBody="Your ID details were submitted and are waiting for the trust & safety team. Verification completes only when they approve." />
					</div>
				{/if}
				<div class="mt-3 rounded-lg bg-surface-base border border-surface-glass-border p-3">
					<p class="text-label-badge uppercase tracking-wider text-on-surface-variant mb-2">Accepted Documents in Nigeria:</p>
					<div class="flex flex-wrap gap-1.5">
						{#each ['NIN (National Identification Number / Slip / vNIN)', 'International Passport', "Driver's License", "Permanent Voter's Card (PVC)", "BVN (Bank Verification Number)"] as doc}
							<span class="text-xs px-2 py-1 rounded-full bg-surface-container-high border border-surface-glass-border text-on-surface-variant">{doc}</span>
						{/each}
					</div>
				</div>
			</div>
		</div>

		<!-- 3. Payout Account -->
		<div class="rounded-xl border border-surface-glass-border bg-surface-container-high/30 overflow-hidden mb-4">
			<div class="p-4">
				<div class="flex items-start justify-between gap-3">
					<div class="flex items-start gap-3">
						<span class="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0 mt-0.5"><Building2 class="w-4 h-4 text-primary" /></span>
						<div>
							<h3 class="text-body-md font-semibold text-on-surface flex items-center gap-2">3. Payout Account <span class="text-label-badge px-2 py-0.5 rounded-full border {verification.payoutAccount ? 'bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'}">{verification.payoutAccount ? 'Verified' : payoutPending ? 'Pending review' : 'Not Verified'}</span></h3>
							<p class="text-body-sm text-on-surface-variant mt-1"><span class="font-semibold text-on-surface">Requirement:</span> A valid, active Nigerian bank account or payment processor account that matches your verified identity name.</p>
							{#if payoutVerifiedSummary}
								<p class="text-xs text-accent-emerald mt-1 flex items-center gap-1"><CheckCheck class="w-3 h-3" /> {payoutVerifiedSummary}</p>
							{/if}
						</div>
					</div>
					{#if !verification.payoutAccount}
						<button type="button" aria-label="Add payout account" class="h-9 px-4 rounded-full bg-primary text-on-primary text-body-sm font-semibold shrink-0 hover:opacity-90 disabled:opacity-50" disabled={payoutPending} onclick={openPayout}>{payoutPending ? 'In review' : 'Start'}</button>
					{:else}
						<button type="button" aria-label="Re-verify payout account" class="h-9 px-4 rounded-full border border-surface-glass-border bg-surface-container-high text-on-surface text-body-sm font-semibold shrink-0" onclick={openPayout}>Re-verify</button>
					{/if}
				</div>
				{#if !verification.payoutAccount && payoutRequest}
					<div class="mt-3">
						<ApprovalNotice request={payoutRequest} pendingLabel="Payout account pending admin review" pendingBody="Settlements stay on hold until the review team matches this account to your verified identity." />
					</div>
				{/if}
			</div>
		</div>

		<!-- Completed Checks -->
		<div class="rounded-xl border border-accent-emerald/20 bg-accent-emerald/5 p-4">
			<h3 class="text-body-md font-semibold text-on-surface flex items-center gap-2"><CheckCheck class="w-4 h-4 text-accent-emerald" /> Completed Checks</h3>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
				<div class="flex items-center gap-3 rounded-lg border border-accent-emerald/20 bg-surface-container p-3">
					<span class="w-8 h-8 rounded-full bg-accent-emerald/10 flex items-center justify-center shrink-0"><Mail class="w-4 h-4 text-accent-emerald" /></span>
					<div class="min-w-0 flex-1">
						<p class="text-body-sm font-semibold text-on-surface flex items-center gap-1.5">Email address <span class="text-label-badge px-1.5 py-0.5 rounded bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/20">Verified</span></p>
						<p class="text-xs text-on-surface-variant mt-0.5">Verified via email link or OTP code sent to your registered inbox.</p>
					</div>
					<CheckCheck class="w-4 h-4 text-accent-emerald shrink-0" />
				</div>
				<div class="flex items-center gap-3 rounded-lg border border-accent-emerald/20 bg-surface-container p-3">
					<span class="w-8 h-8 rounded-full bg-accent-emerald/10 flex items-center justify-center shrink-0"><ShieldCheck class="w-4 h-4 text-accent-emerald" /></span>
					<div class="min-w-0 flex-1">
						<p class="text-body-sm font-semibold text-on-surface flex items-center gap-1.5">Age 18+ <span class="text-label-badge px-1.5 py-0.5 rounded bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/20">Verified</span></p>
						<p class="text-xs text-on-surface-variant mt-0.5">Confirmed based on your date of birth, which will also be cross-checked during the <span class="font-semibold">Identity</span> verification step.</p>
					</div>
					<CheckCheck class="w-4 h-4 text-accent-emerald shrink-0" />
				</div>
			</div>
			{#if !isFullyVerified}
				<p class="text-xs text-on-surface-variant mt-3">Only users that have verified all checks receive the <span class="inline-flex items-center gap-1 font-semibold text-on-surface"><BadgeCheck class="w-3 h-3 text-tertiary" /> verified tick</span> on profile and organizer views.</p>
			{/if}
		</div>
	</section>

	<!-- Phone Sheet -->
	<Sheet open={phoneOpen} title="Verify Phone Number" close={() => (phoneOpen = false)}>
		<div class="flex flex-col gap-4">
			<div class="rounded-lg bg-surface-container-high/40 border border-surface-glass-border p-3 flex items-start gap-3">
				<Smartphone class="w-5 h-5 text-primary shrink-0 mt-0.5" />
				<div>
					<p class="text-body-sm font-semibold text-on-surface">Nigerian phone number</p>
					<p class="text-body-sm text-on-surface-variant mt-1">Must be active and registered under your name. Starts with <span class="font-mono text-on-surface">+234</span>.</p>
				</div>
			</div>
			{#if phoneStep === 'input'}
				<label class="flex flex-col gap-1.5 text-body-sm text-on-surface-variant">
					Phone number
					<input type="tel" inputmode="tel" placeholder="+2348031234567" bind:value={phoneNumber} class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-outline" />
					<span class="text-xs">Include country code +234, e.g. +2348031234567</span>
				</label>
				{#if phoneError}<p class="text-body-sm text-error bg-error/10 border border-error/30 rounded-lg px-3 py-2">{phoneError}</p>{/if}
				<button type="button" class="w-full h-11 rounded-full bg-primary text-on-primary font-semibold text-body-md hover:opacity-90" onclick={sendPhoneOtp}>Send OTP via SMS / WhatsApp</button>
			{:else}
				<div class="rounded-lg bg-surface-container-high/40 border border-surface-glass-border p-3">
					<p class="text-body-sm text-on-surface-variant">OTP sent to <span class="font-semibold text-on-surface">{phoneNumber}</span> via SMS / WhatsApp (demo code: <span class="font-mono font-bold text-primary">{phoneGenerated}</span>)</p>
				</div>
				<label class="flex flex-col gap-1.5 text-body-sm text-on-surface-variant">
					Enter 6-digit OTP
					<input type="text" inputmode="numeric" maxlength="6" placeholder="123456" bind:value={phoneOtp} class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md tracking-[0.2em] focus:outline-none focus:border-outline" />
				</label>
				{#if phoneError}<p class="text-body-sm text-error bg-error/10 border border-error/30 rounded-lg px-3 py-2">{phoneError}</p>{/if}
				<div class="grid grid-cols-2 gap-2">
					<button type="button" class="h-11 rounded-full border border-surface-glass-border bg-surface-container-high text-on-surface font-semibold" onclick={() => { phoneStep = 'input'; phoneError=''; }}>Change number</button>
					<button type="button" class="h-11 rounded-full bg-primary text-on-primary font-semibold hover:opacity-90" onclick={confirmPhoneOtp}>Confirm OTP</button>
				</div>
				<button type="button" class="text-body-sm text-primary hover:underline self-center" onclick={sendPhoneOtp}>Resend OTP</button>
			{/if}
		</div>
	</Sheet>

	<!-- Identity Sheet -->
	<Sheet open={identityOpen} title="Verify Identity" close={() => (identityOpen = false)}>
		<div class="flex flex-col gap-4">
			<div class="flex items-center gap-2 text-label-badge uppercase tracking-wider text-on-surface-variant">
				<span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border {identityStep >=1 ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-high text-on-surface-variant border-surface-glass-border'}">1</span>
				<span class="h-px flex-1 bg-surface-glass-border"></span>
				<span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border {identityStep >=2 ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-high text-on-surface-variant border-surface-glass-border'}">2</span>
			</div>

			{#if identityStep === 1}
				<div class="flex flex-col gap-3">
					<label class="flex flex-col gap-1.5 text-body-sm text-on-surface-variant">
						Document type
						<select bind:value={identityDoc} class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface">
							<option value="NIN">NIN (National Identification Number / Slip / vNIN)</option>
							<option value="International Passport">International Passport</option>
							<option value="Driver's License">Driver’s License</option>
							<option value="Permanent Voter's Card (PVC)">Permanent Voter&apos;s Card (PVC)</option>
							<option value="BVN">BVN (Bank Verification Number)</option>
						</select>
					</label>
					<label class="flex flex-col gap-1.5 text-body-sm text-on-surface-variant">
						Legal name (as on ID)
						<input type="text" placeholder="e.g. Adaobi Okafor" bind:value={identityName} class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface" />
					</label>
					<label class="flex flex-col gap-1.5 text-body-sm text-on-surface-variant">
						Date of birth
						<input type="date" bind:value={identityDob} class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface" />
					</label>
					<label class="flex flex-col gap-1.5 text-body-sm text-on-surface-variant">
						ID number
						<input type="text" placeholder={identityDoc === 'NIN' ? '11-digit NIN' : identityDoc === 'BVN' ? '11-digit BVN' : 'Enter ID number'} bind:value={identityNumber} class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface" />
					</label>
					{#if identityError}<p class="text-body-sm text-error bg-error/10 border border-error/30 rounded-lg px-3 py-2">{identityError}</p>{/if}
					<button type="button" class="w-full h-11 rounded-full bg-primary text-on-primary font-semibold" onclick={nextIdentity}>Continue</button>
				</div>
			{:else if identityStep === 2}
				<div class="flex flex-col gap-3">
					<p class="text-body-sm text-on-surface-variant">Upload a clear photo/scan of your <span class="font-semibold text-on-surface">{identityDoc}</span> (front and back where applicable).</p>
					<label class="rounded-lg border border-dashed border-surface-glass-border bg-surface-container-high/30 p-4 flex flex-col items-center gap-2 cursor-pointer hover:bg-surface-container-high/50">
						{#if identityFront?.preview}
							<img src={identityFront.preview} alt="Front of ID preview" class="w-full max-h-32 object-contain rounded-md bg-surface-base" />
						{:else}
							<Upload class="w-5 h-5 text-on-surface-variant" />
						{/if}
						<span class="text-body-sm font-semibold text-on-surface">Front of ID {identityFront ? `• ${identityFront.name}` : ''}</span>
						<span class="text-xs text-on-surface-variant">PNG, JPG up to 5MB{identityFront?.preview ? ' • resized & cropped' : ''}</span>
						<input type="file" accept="image/*,.pdf" class="sr-only" aria-label="Upload front of ID" onchange={(event) => chooseIdentityDoc(event, 'front')} />
					</label>
					<label class="rounded-lg border border-dashed border-surface-glass-border bg-surface-container-high/30 p-4 flex flex-col items-center gap-2 cursor-pointer hover:bg-surface-container-high/50">
						{#if identityBack?.preview}
							<img src={identityBack.preview} alt="Back of ID preview" class="w-full max-h-32 object-contain rounded-md bg-surface-base" />
						{:else}
							<Upload class="w-5 h-5 text-on-surface-variant" />
						{/if}
						<span class="text-body-sm font-semibold text-on-surface">Back of ID {identityBack ? `• ${identityBack.name}` : ''} (if applicable)</span>
						<span class="text-xs text-on-surface-variant">Skip if single-sided</span>
						<input type="file" accept="image/*,.pdf" class="sr-only" aria-label="Upload back of ID" onchange={(event) => chooseIdentityDoc(event, 'back')} />
					</label>
					{#if identityError}<p class="text-body-sm text-error bg-error/10 border border-error/30 rounded-lg px-3 py-2">{identityError}</p>{/if}
					<div class="grid grid-cols-2 gap-2">
						<button type="button" class="h-11 rounded-full border border-surface-glass-border bg-surface-container-high text-on-surface font-semibold" onclick={() => (identityStep = 1)}>Back</button>
						<button type="button" class="h-11 rounded-full bg-primary text-on-primary font-semibold disabled:opacity-50" disabled={identitySubmitting} onclick={submitIdentity}>{identitySubmitting ? 'Submitting for review…' : 'Submit for review'}</button>
					</div>
				</div>
			{/if}
		</div>
	</Sheet>

	<ImageCropSheet
		open={cropSide !== null}
		file={cropFile}
		title={cropSide === 'back' ? 'Fit ID photo · back' : 'Fit ID photo · front'}
		maxDimension={1600}
		maxZoom={2}
		confirmLabel="Use this image"
		hint="Pinch to zoom and drag to fit the document, then confirm. The image is only attached after you confirm."
		confirm={applyCroppedDocument}
		close={closeCrop}
	/>

	<!-- Payout Sheet -->
	<Sheet open={payoutOpen} title="Verify Payout Account" close={closePayout}>
		<div class="flex flex-col gap-4">
			<div class="rounded-lg bg-surface-container-high/40 border border-surface-glass-border p-3 flex items-start gap-3">
				<Building2 class="w-5 h-5 text-primary shrink-0 mt-0.5" />
				<div>
					<p class="text-body-sm font-semibold text-on-surface">Nigerian settlement account</p>
					<p class="text-body-sm text-on-surface-variant mt-1">Enter the 10-digit NUBAN account number you want settlements paid into.</p>
				</div>
			</div>
			<label class="flex flex-col gap-1.5 text-body-sm text-on-surface-variant">
				Bank Name
				<select
					value={payoutBank}
					onchange={onPayoutBankChange}
					disabled={payoutVerifying}
					class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface disabled:opacity-60"
				>
					<option value="">Select bank</option>
					{#each PAYOUT_BANKS as b}<option value={b}>{b}</option>{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1.5 text-body-sm text-on-surface-variant">
				10-digit NUBAN Account Number
				<input
					type="text"
					inputmode="numeric"
					autocomplete="off"
					maxlength="10"
					placeholder="0123456789"
					value={payoutAccount}
					oninput={onPayoutAccountInput}
					disabled={payoutVerifying}
					aria-describedby="payout-account-hint"
					class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface tracking-widest disabled:opacity-60"
				/>
			</label>
			<p id="payout-account-hint" class="text-xs text-on-surface-variant">
				{#if !payoutBank}
					Choose your bank and enter the 10-digit account number you want settlements paid into.
				{:else if payoutAccount.length < 10}
					{payoutAccount.length}/10 digits — enter the full NUBAN account number.
				{:else}
					{maskAccountNumber(payoutAccount)} at {payoutBank} — ready to verify.
				{/if}
			</p>
			{#if payoutError}<p class="text-body-sm text-error bg-error/10 border border-error/30 rounded-lg px-3 py-2">{payoutError}</p>{/if}
			<button
				type="button"
				aria-label="Verify and save payout account"
				class="w-full h-11 rounded-full bg-primary text-on-primary font-semibold disabled:opacity-50"
				disabled={payoutVerifying}
				onclick={verifyPayout}
			>
				{#if payoutVerifying}Submitting for review…{:else}Submit payout account for review{/if}
			</button>
		</div>
	</Sheet>
	{/if}
	{#if !category || category === 'notifications'}
	<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 md:p-6">
		<div class="flex items-center justify-between gap-3 mb-4">
			<div>
				<h2 class="font-display text-headline-md text-on-surface">Notifications</h2>
				<p class="text-body-sm text-on-surface-variant mt-1">Choose delivery channels, updates and quiet hours.</p>
			</div>
			<Bell class="w-5 h-5 text-primary shrink-0" />
		</div>
		<h3 class="text-label-badge tracking-wider uppercase text-on-surface-variant mb-2">Channels</h3>
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
			{#each notificationRows as row (row.key)}
				{@const enabled = appSettings.value.notifications[row.key]}
				<button type="button" role="switch" aria-checked={enabled} class="flex items-center justify-between gap-2 rounded-lg border border-surface-glass-border bg-surface-container-high/50 p-3 text-left" onclick={() => toggleNotification(row.key)}>
					<span class="min-w-0"><span class="block text-body-sm font-semibold text-on-surface">{row.label}</span><span class="block text-xs text-on-surface-variant mt-0.5">{row.description}</span></span>
					<span aria-hidden="true" class="w-9 h-5 rounded-full p-0.5 shrink-0 transition-colors {enabled ? 'bg-primary' : 'bg-outline-variant'}"><span class="block w-4 h-4 rounded-full bg-white transition-transform {enabled ? 'translate-x-4' : ''}"></span></span>
				</button>
			{/each}
		</div>
		<div class="border-t border-surface-glass-border pt-3">
			<h3 class="text-label-badge tracking-wider uppercase text-on-surface-variant mb-2">What you hear about</h3>
			<div class="flex flex-col divide-y divide-surface-glass-border">
				{#each deliveryRows as row (row.key)}
					{@const enabled = appSettings.value.notifications[row.key]}
					<label class="flex items-center justify-between gap-3 py-2.5 cursor-pointer">
						<span class="min-w-0"><span class="block text-body-sm font-medium text-on-surface">{row.label}</span><span class="block text-xs text-on-surface-variant">{row.description}</span></span>
						<input type="checkbox" checked={enabled} onchange={() => toggleNotification(row.key)} class="w-4 h-4 accent-primary shrink-0" aria-label={row.label} />
					</label>
				{/each}
			</div>
		</div>
		<div class="mt-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 p-3">
			<label class="flex items-center justify-between gap-3 cursor-pointer">
				<span><span class="block text-body-sm font-semibold text-on-surface">Quiet hours</span><span class="block text-xs text-on-surface-variant">Pause non-essential notifications</span></span>
				<input type="checkbox" checked={appSettings.value.notifications.quietHours} onchange={() => toggleNotification('quietHours')} class="w-4 h-4 accent-primary" />
			</label>
			{#if appSettings.value.notifications.quietHours}
				<div class="grid grid-cols-2 gap-3 mt-3">
					<label class="text-xs text-on-surface-variant">From<input type="time" bind:value={appSettings.value.notifications.quietFrom} class="block w-full mt-1 h-10 px-3 rounded-md bg-surface-base border border-surface-glass-border text-on-surface" /></label>
					<label class="text-xs text-on-surface-variant">Until<input type="time" bind:value={appSettings.value.notifications.quietTo} class="block w-full mt-1 h-10 px-3 rounded-md bg-surface-base border border-surface-glass-border text-on-surface" /></label>
				</div>
			{/if}
		</div>
	</section>

	{/if}
	{#if !category || category === 'privacy'}
	<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 md:p-6">
		<div class="flex items-center justify-between gap-3 mb-4">
			<div>
				<h2 class="font-display text-headline-md text-on-surface">Privacy</h2>
				<p class="text-body-sm text-on-surface-variant mt-1">Control profile visibility and data use.</p>
			</div>
			<UserRound class="w-5 h-5 text-primary shrink-0" />
		</div>
		<div class="flex flex-col divide-y divide-surface-glass-border">
			{#each [
				{ key: 'privateProfile', label: 'Private profile', description: 'Only approved followers can see profile details.' },
				{ key: 'showAttendedEvents', label: 'Show attended events', description: 'Let people see events listed on your profile.' },
				{ key: 'personalizedAds', label: 'Personalized recommendations', description: 'Use activity to tailor event recommendations.' }
			] as row (row.key)}
				{@const key = row.key as PrivacyToggle}
				{@const enabled = appSettings.value.privacy[key]}
				<label class="flex items-center justify-between gap-3 py-3 cursor-pointer">
					<span><span class="block text-body-sm font-semibold text-on-surface">{row.label}</span><span class="block text-xs text-on-surface-variant mt-0.5">{row.description}</span></span>
					<input type="checkbox" checked={enabled} onchange={() => togglePrivacy(key)} class="w-4 h-4 accent-primary shrink-0" />
				</label>
			{/each}
		</div>
		<a href="/legal#privacy" class="inline-flex items-center gap-1.5 text-body-sm text-primary hover:underline mt-2">Read the Privacy Policy <ExternalLink class="w-3.5 h-3.5" /></a>
	</section>

	{/if}
	{#if !category || category === 'security'}
	<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 md:p-6">
		<div class="flex items-center justify-between gap-3 mb-4">
			<div>
				<h2 class="font-display text-headline-md text-on-surface">Security & sessions</h2>
				<p class="text-body-sm text-on-surface-variant mt-1">Extra sign-in protection and devices.</p>
			</div>
			<LockKeyhole class="w-5 h-5 text-primary shrink-0" />
		</div>
		{#each [
			{ key: 'biometricLogin', label: 'Biometric sign-in', description: 'Use device biometrics when supported.' },
			{ key: 'twoFactor', label: 'Two-factor authentication', description: 'Require an additional sign-in check.' }
		] as row (row.key)}
			{@const key = row.key as SecurityToggle}
			{@const enabled = appSettings.value.security[key]}
			<label class="flex items-center justify-between gap-3 py-3 border-b border-surface-glass-border cursor-pointer">
				<span><span class="block text-body-sm font-semibold text-on-surface">{row.label}</span><span class="block text-xs text-on-surface-variant mt-0.5">{row.description}</span></span>
				<input type="checkbox" checked={enabled} onchange={() => toggleSecurity(key)} class="w-4 h-4 accent-primary shrink-0" />
			</label>
		{/each}
		<div class="pt-3">
			<div class="flex items-center justify-between gap-3 mb-2"><span class="text-body-sm font-semibold text-on-surface">Active sessions</span><button type="button" class="text-body-sm text-primary hover:underline" onclick={() => toast('Other sessions were signed out', 'success')}>Sign out others</button></div>
			<div class="flex items-center gap-3 rounded-lg bg-surface-container-high/50 p-3">
				<Smartphone class="w-4 h-4 text-primary shrink-0" />
				<span class="min-w-0 flex-1"><span class="block text-body-sm text-on-surface">This device</span><span class="block text-xs text-on-surface-variant">Lagos · Active now</span></span>
				<span class="text-label-badge text-accent-emerald">Current</span>
			</div>
		</div>
	</section>

	{/if}
	{#if !category || category === 'accessibility'}
	<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 md:p-6">
		<div class="flex items-center justify-between gap-3 mb-4">
			<div>
				<h2 class="font-display text-headline-md text-on-surface">Accessibility</h2>
				<p class="text-body-sm text-on-surface-variant mt-1">Tune appearance, motion and reading comfort.</p>
			</div>
			<Accessibility class="w-5 h-5 text-primary shrink-0" />
		</div>
		<label class="flex items-center justify-between gap-3 py-3 border-b border-surface-glass-border"><span class="text-body-sm font-semibold text-on-surface">Appearance</span><select value={appSettings.value.accessibility.appearance} onchange={(event) => setAppearance(event.currentTarget.value)} class="h-10 px-3 rounded-md bg-surface-base border border-surface-glass-border text-body-sm text-on-surface"><option value="dark">Dark</option><option value="light">Light</option></select></label>
		<label class="flex items-center justify-between gap-3 py-3 border-b border-surface-glass-border cursor-pointer"><span><span class="block text-body-sm font-semibold text-on-surface">Reduced motion</span><span class="block text-xs text-on-surface-variant">Minimize animations and transitions.</span></span><input type="checkbox" checked={appSettings.value.accessibility.reduceMotion} onchange={() => toggleAccessibility('reduceMotion')} class="w-4 h-4 accent-primary" /></label>
		<label class="flex items-center justify-between gap-3 py-3 border-b border-surface-glass-border cursor-pointer"><span><span class="block text-body-sm font-semibold text-on-surface">Screen-reader labels</span><span class="block text-xs text-on-surface-variant">Prefer explicit labels on controls.</span></span><input type="checkbox" checked={appSettings.value.accessibility.screenReaderLabels} onchange={() => toggleAccessibility('screenReaderLabels')} class="w-4 h-4 accent-primary" /></label>
		<div class="pt-3">
			<label for="page-size" class="flex items-center justify-between gap-3 text-body-sm font-semibold text-on-surface">
				<span>Page size</span><output for="page-size">{appSettings.value.accessibility.pageSize}%</output>
			</label>
			<input id="page-size" type="range" min="25" max="150" step="5" value={appSettings.value.accessibility.pageSize} aria-describedby="page-size-range" oninput={(event) => setPageSize(event.currentTarget.value)} class="mt-3 w-full accent-primary" />
			<div id="page-size-range" class="flex justify-between text-label-badge text-on-surface-variant"><span>25%</span><span>150%</span></div>
		</div>
	</section>

	{/if}
	{#if !category || category === 'offline'}
	<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 md:p-6">
		<div class="flex items-center justify-between gap-3 mb-4">
			<div>
				<h2 class="font-display text-headline-md text-on-surface">Offline & storage</h2>
				<p class="text-body-sm text-on-surface-variant mt-1">Control what stays available on this device.</p>
			</div>
			<Database class="w-5 h-5 text-primary shrink-0" />
		</div>
		<label class="flex items-center justify-between gap-3 py-3 border-b border-surface-glass-border cursor-pointer"><span><span class="block text-body-sm font-semibold text-on-surface">Offline mode</span><span class="block text-xs text-on-surface-variant">Keep essential ticket details ready offline.</span></span><input type="checkbox" checked={appSettings.value.storage.offlineMode} onchange={() => toggleStorage('offlineMode')} class="w-4 h-4 accent-primary" /></label>
		<label class="flex items-center justify-between gap-3 py-3 cursor-pointer"><span><span class="block text-body-sm font-semibold text-on-surface">Download tickets automatically</span><span class="block text-xs text-on-surface-variant">Save passes when they are issued.</span></span><input type="checkbox" checked={appSettings.value.storage.autoDownloadTickets} onchange={() => toggleStorage('autoDownloadTickets')} class="w-4 h-4 accent-primary" /></label>
		<div class="flex items-center justify-between gap-3 rounded-lg bg-surface-container-high/50 p-3 mt-1"><span class="flex items-center gap-2 text-body-sm text-on-surface"><Wallet class="w-4 h-4 text-primary" /> On-device ticket wallet</span><span class="text-xs text-on-surface-variant">{appSettings.value.storage.offlineMode ? 'Enabled' : 'Paused'}</span></div>
		<button type="button" class="mt-3 inline-flex items-center gap-2 text-body-sm text-error hover:underline" disabled={clearingCache} aria-busy={clearingCache} onclick={clearOfflineCache}><Trash2 class="w-4 h-4" /> {clearingCache ? 'Clearing…' : 'Clear offline cache'}</button>
	</section>

	{/if}
	{#if !category || category === 'help'}
	<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 md:p-6 xl:col-span-2">
		<div class="flex items-center justify-between gap-3 mb-4">
			<div>
				<h2 class="font-display text-headline-md text-on-surface">Help & legal</h2>
				<p class="text-body-sm text-on-surface-variant mt-1">Support, policies, licenses and cookie choices.</p>
			</div>
			<HelpCircle class="w-5 h-5 text-primary shrink-0" />
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
			<div class="flex items-center justify-between gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3"><span><span class="block text-body-sm font-semibold text-on-surface">Essential cookies</span><span class="block text-xs text-on-surface-variant">Required for sign-in and checkout.</span></span><input type="checkbox" checked disabled aria-label="Essential cookies are always enabled" class="w-4 h-4 accent-primary" /></div>
			<label class="flex items-center justify-between gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3 cursor-pointer"><span><span class="block text-body-sm font-semibold text-on-surface">Analytics cookies</span><span class="block text-xs text-on-surface-variant">Help us improve app performance.</span></span><input type="checkbox" checked={appSettings.value.cookies.analytics} onchange={() => toggleCookie('analytics')} class="w-4 h-4 accent-primary" /></label>
			<label class="flex items-center justify-between gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3 cursor-pointer"><span><span class="block text-body-sm font-semibold text-on-surface">Personalization cookies</span><span class="block text-xs text-on-surface-variant">Remember discovery preferences.</span></span><input type="checkbox" checked={appSettings.value.cookies.personalization} onchange={() => toggleCookie('personalization')} class="w-4 h-4 accent-primary" /></label>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
			<a href="mailto:support@owltside.app?subject=Owltside%20help" class="flex items-center justify-between gap-2 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3 text-body-sm text-on-surface hover:bg-surface-container-high"><span class="flex items-center gap-2"><HelpCircle class="w-4 h-4 text-primary" /> Help Center</span><ExternalLink class="w-3.5 h-3.5" /></a>
			<a href="/legal#terms" class="flex items-center justify-between gap-2 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3 text-body-sm text-on-surface hover:bg-surface-container-high"><span>Terms of Service</span><ExternalLink class="w-3.5 h-3.5" /></a>
			<a href="/legal#privacy" class="flex items-center justify-between gap-2 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3 text-body-sm text-on-surface hover:bg-surface-container-high"><span>Privacy Policy</span><ExternalLink class="w-3.5 h-3.5" /></a>
			<a href="/legal#licenses" class="flex items-center justify-between gap-2 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3 text-body-sm text-on-surface hover:bg-surface-container-high"><span>Licenses & attribution</span><ExternalLink class="w-3.5 h-3.5" /></a>
			<a href="/legal#cookies" class="flex items-center justify-between gap-2 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3 text-body-sm text-on-surface hover:bg-surface-container-high"><span>Cookie settings & policy</span><ExternalLink class="w-3.5 h-3.5" /></a>
			<a href="mailto:safety@owltside.app?subject=Owltside%20safety" class="flex items-center justify-between gap-2 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3 text-body-sm text-on-surface hover:bg-surface-container-high"><span class="flex items-center gap-2"><Moon class="w-4 h-4 text-primary" /> Safety & accessibility</span><Mail class="w-3.5 h-3.5" /></a>
		</div>
	</section>
	{/if}
</div>
