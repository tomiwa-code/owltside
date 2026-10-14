<script lang="ts">
	import {
		Accessibility,
		Bell,
		CreditCard,
		Database,
		ExternalLink,
		HelpCircle,
		LockKeyhole,
		Mail,
		Moon,
		ShieldCheck,
		Smartphone,
		Trash2,
		UserRound,
		Wallet
	} from '@lucide/svelte';
	import { appSettings, type AppSettings } from '$lib/state/settings.svelte';
	import { toast } from '$lib/state/toast.svelte';

	type NotificationToggle = 'pushEnabled' | 'emailEnabled' | 'smsEnabled' | 'eventReminders' | 'eventUpdates' | 'messages' | 'marketing' | 'quietHours';
	type PrivacyToggle = keyof AppSettings['privacy'];
	type CookieToggle = keyof AppSettings['cookies'];
	type SecurityToggle = keyof AppSettings['security'];
	type AccessibilityToggle = 'largerText' | 'reduceMotion' | 'screenReaderLabels';
	type StorageToggle = keyof AppSettings['storage'];

	const verificationRows: Array<{ key: keyof AppSettings['verification']; label: string; description: string }> = [
		{ key: 'email', label: 'Email address', description: 'Confirm your account email' },
		{ key: 'phone', label: 'Phone number', description: 'Add a secure recovery number' },
		{ key: 'identity', label: 'Identity', description: 'Verify your legal identity' },
		{ key: 'payoutAccount', label: 'Payout account', description: 'Confirm your settlement details' },
		{ key: 'age', label: 'Age 18+', description: 'Age eligibility for event access' }
	];

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

	const paymentMethods = $derived(appSettings.value.payments.savedMethods);

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
	function startVerification(label: string) {
		toast(`${label} verification is available from your secure account flow.`, 'info');
	}
	function removePayment(id: string) {
		appSettings.value.payments.savedMethods = appSettings.value.payments.savedMethods.filter((method) => method.id !== id);
		toast('Saved payment method removed from this device', 'success');
	}
	function setDefaultPayment(id: string) {
		appSettings.value.payments.savedMethods = appSettings.value.payments.savedMethods.map((method) => ({
				...method,
				isDefault: method.id === id
			}));
		toast('Default payment method updated', 'success');
	}
	function setAppearance(value: string) {
		appSettings.value.accessibility.appearance = value as AppSettings['accessibility']['appearance'];
	}
	function setTextSize(value: string) {
		appSettings.value.accessibility.textSize = value as AppSettings['accessibility']['textSize'];
	}
	async function clearOfflineCache() {
		try {
			if ('caches' in globalThis) {
				const keys = await caches.keys();
				await Promise.all(keys.map((key) => caches.delete(key)));
			}
			toast('Offline cache cleared. Saved account preferences were kept.', 'success');
		} catch {
			toast('The offline cache could not be cleared on this device.', 'error');
		}
	}
</script>

<div class="grid grid-cols-1 xl:grid-cols-2 gap-4 min-w-0">
	<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 md:p-6">
		<div class="flex items-center justify-between gap-3 mb-4">
			<div>
				<h2 class="font-display text-headline-md text-on-surface">Verification</h2>
				<p class="text-body-sm text-on-surface-variant mt-1">Manage the checks that protect your account and payouts.</p>
			</div>
			<ShieldCheck class="w-5 h-5 text-primary shrink-0" />
		</div>
		<div class="flex flex-col gap-2">
			{#each verificationRows as row (row.key)}
				<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3">
					<span class="min-w-0 flex-1">
						<span class="block text-body-sm font-semibold text-on-surface">{row.label}</span>
						<span class="block text-xs text-on-surface-variant mt-0.5">{row.description}</span>
					</span>
					<span class="text-label-badge rounded-full px-2 py-1 shrink-0 {appSettings.value.verification[row.key] ? 'bg-accent-emerald/10 text-accent-emerald' : 'bg-surface-container-high text-on-surface-variant'}">{appSettings.value.verification[row.key] ? 'Verified' : 'Not verified'}</span>
					{#if !appSettings.value.verification[row.key]}
						<button type="button" class="text-body-sm font-semibold text-primary hover:underline shrink-0" onclick={() => startVerification(row.label)}>Start</button>
					{/if}
				</div>
			{/each}
		</div>
	</section>

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

	<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 md:p-6">
		<div class="flex items-center justify-between gap-3 mb-4">
			<div>
				<h2 class="font-display text-headline-md text-on-surface">Saved payment methods</h2>
				<p class="text-body-sm text-on-surface-variant mt-1">Manage cards used for faster checkout.</p>
			</div>
			<CreditCard class="w-5 h-5 text-primary shrink-0" />
		</div>
		{#if paymentMethods.length}
			<div class="flex flex-col gap-2">
				{#each paymentMethods as method (method.id)}
					<div class="flex items-center gap-3 rounded-lg border border-surface-glass-border bg-surface-container-high/50 px-3 py-3">
						<CreditCard class="w-4 h-4 text-on-surface-variant shrink-0" />
						<span class="flex-1 text-body-sm font-semibold text-on-surface">{method.brand} •••• {method.last4}</span>
						{#if method.isDefault}<span class="text-label-badge text-accent-emerald">Default</span>{:else}<button type="button" class="text-label-badge text-primary hover:underline" onclick={() => setDefaultPayment(method.id)}>Make default</button>{/if}
						<button type="button" aria-label="Remove {method.brand} ending {method.last4}" class="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-error" onclick={() => removePayment(method.id)}><Trash2 class="w-4 h-4" /></button>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-body-sm text-on-surface-variant rounded-lg bg-surface-container-high/50 p-3">No payment methods are saved on this device.</p>
		{/if}
		<button type="button" class="mt-3 h-10 px-4 rounded-lg border border-surface-glass-border text-body-sm text-primary hover:bg-surface-container-high" onclick={() => toast('Add a payment method securely during checkout.', 'info')}>Add a payment method</button>
	</section>

	<section class="rounded-xl border border-surface-glass-border bg-surface-container p-5 md:p-6">
		<div class="flex items-center justify-between gap-3 mb-4">
			<div>
				<h2 class="font-display text-headline-md text-on-surface">Accessibility</h2>
				<p class="text-body-sm text-on-surface-variant mt-1">Tune appearance, motion and reading comfort.</p>
			</div>
			<Accessibility class="w-5 h-5 text-primary shrink-0" />
		</div>
		<label class="flex items-center justify-between gap-3 py-3 border-b border-surface-glass-border"><span class="text-body-sm font-semibold text-on-surface">Appearance</span><select value={appSettings.value.accessibility.appearance} onchange={(event) => setAppearance(event.currentTarget.value)} class="h-10 px-3 rounded-md bg-surface-base border border-surface-glass-border text-body-sm text-on-surface"><option value="dark">Dark</option><option value="light">Light</option></select></label>
		<label class="flex items-center justify-between gap-3 py-3 border-b border-surface-glass-border cursor-pointer"><span><span class="block text-body-sm font-semibold text-on-surface">Larger text</span><span class="block text-xs text-on-surface-variant">Increase text across the app.</span></span><input type="checkbox" checked={appSettings.value.accessibility.largerText} onchange={() => toggleAccessibility('largerText')} class="w-4 h-4 accent-primary" /></label>
		<label class="flex items-center justify-between gap-3 py-3 border-b border-surface-glass-border cursor-pointer"><span><span class="block text-body-sm font-semibold text-on-surface">Reduced motion</span><span class="block text-xs text-on-surface-variant">Minimize animations and transitions.</span></span><input type="checkbox" checked={appSettings.value.accessibility.reduceMotion} onchange={() => toggleAccessibility('reduceMotion')} class="w-4 h-4 accent-primary" /></label>
		<label class="flex items-center justify-between gap-3 py-3 border-b border-surface-glass-border cursor-pointer"><span><span class="block text-body-sm font-semibold text-on-surface">Screen-reader labels</span><span class="block text-xs text-on-surface-variant">Prefer explicit labels on controls.</span></span><input type="checkbox" checked={appSettings.value.accessibility.screenReaderLabels} onchange={() => toggleAccessibility('screenReaderLabels')} class="w-4 h-4 accent-primary" /></label>
		<label class="flex items-center justify-between gap-3 pt-3"><span class="text-body-sm font-semibold text-on-surface">Text size</span><select value={appSettings.value.accessibility.textSize} onchange={(event) => setTextSize(event.currentTarget.value)} class="h-10 px-3 rounded-md bg-surface-base border border-surface-glass-border text-body-sm text-on-surface"><option>90%</option><option>100%</option><option>110%</option><option>125%</option></select></label>
	</section>

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
		<button type="button" class="mt-3 inline-flex items-center gap-2 text-body-sm text-error hover:underline" onclick={clearOfflineCache}><Trash2 class="w-4 h-4" /> Clear offline cache</button>
	</section>

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
</div>
