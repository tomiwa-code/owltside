import { describe, expect, it, vi } from 'vitest';

/**
 * Older builds stored a looked-up `accountName` alongside the payout account.
 * That feature is gone, so the saved settings must keep the bank and number and
 * drop the stale name rather than rendering it anywhere.
 */
describe('payout settings migration', () => {
	it('drops a previously saved account name but keeps the account', async () => {
		localStorage.setItem(
			'owltside.settings.v1',
			JSON.stringify({
				verification: { email: true, phone: false, identity: false, payoutAccount: true, age: true },
				notifications: {
					pushEnabled: true,
					emailEnabled: true,
					smsEnabled: false,
					eventReminders: true,
					eventUpdates: true,
					messages: true,
					marketing: false,
					quietHours: false,
					quietFrom: '22:00',
					quietTo: '08:00'
				},
				privacy: { privateProfile: false, showAttendedEvents: true, personalizedAds: false },
				cookies: { analytics: false, personalization: false },
				security: { biometricLogin: false, twoFactor: true },
				payments: { savedMethods: [] },
				payout: { bank: 'Zenith Bank', accountNumber: '1234567890', accountName: 'ADA OBI' },
				accessibility: { appearance: 'dark', reduceMotion: false, screenReaderLabels: true, pageSize: 100 },
				storage: { offlineMode: true, autoDownloadTickets: true }
			})
		);

		vi.resetModules();
		const { appSettings } = await import('$lib/state/settings.svelte');

		expect(appSettings.value.payout).toEqual({ bank: 'Zenith Bank', accountNumber: '1234567890' });
		expect('accountName' in appSettings.value.payout).toBe(false);
		expect(appSettings.value.verification.payoutAccount).toBe(true);
	});
});
