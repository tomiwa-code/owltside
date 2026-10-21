import { persisted } from './persist.svelte';

export interface AppSettings {
	verification: {
		email: boolean;
		phone: boolean;
		identity: boolean;
		payoutAccount: boolean;
		age: boolean;
	};
	notifications: {
		pushEnabled: boolean;
		emailEnabled: boolean;
		smsEnabled: boolean;
		eventReminders: boolean;
		eventUpdates: boolean;
		messages: boolean;
		marketing: boolean;
		quietHours: boolean;
		quietFrom: string;
		quietTo: string;
	};
	privacy: {
		privateProfile: boolean;
		showAttendedEvents: boolean;
		personalizedAds: boolean;
	};
	cookies: {
		analytics: boolean;
		personalization: boolean;
	};
	security: {
		biometricLogin: boolean;
		twoFactor: boolean;
	};
	payout: {
		bank: string;
		accountNumber: string;
	};
	accessibility: {
		appearance: 'dark' | 'light';
		reduceMotion: boolean;
		screenReaderLabels: boolean;
		pageSize: number;
	};
	storage: {
		offlineMode: boolean;
		autoDownloadTickets: boolean;
	};
}

const defaults: AppSettings = {
	verification: { email: true, phone: false, identity: false, payoutAccount: false, age: true },
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
	payout: { bank: '', accountNumber: '' },
	accessibility: {
		appearance: 'dark',
		reduceMotion: false,
		screenReaderLabels: true,
		pageSize: 100
	},
	storage: { offlineMode: true, autoDownloadTickets: true }
};

const settings = persisted<AppSettings>('owltside.settings.v1', defaults);

// Upgrade the previous text-size preference without resetting any other saved preferences.
const stored = settings.value as AppSettings & {
	accessibility?: AppSettings['accessibility'] & { textSize?: string; largerText?: boolean };
};
// Saved payment methods were removed from settings. Older builds persisted
// them, so drop the stale key before any migration spreads `stored` back in.
delete (stored as unknown as Record<string, unknown>).payments;
const oldAccessibility = stored.accessibility;
if (!('payout' in stored) || !stored.payout || typeof stored.payout.bank !== 'string') {
	settings.value = {
		...settings.value,
		payout: { bank: '', accountNumber: '' }
	};
} else if ('accountName' in stored.payout) {
	// Accounts saved by an older build carried a looked-up name. That feature
	// is gone, so drop the stale field and keep only what was entered.
	const { bank, accountNumber } = stored.payout;
	settings.value = {
		...settings.value,
		payout: { bank: bank ?? '', accountNumber: accountNumber ?? '' }
	};
}

if (!oldAccessibility || !Number.isFinite(oldAccessibility.pageSize)) {
	const legacySize = Number(oldAccessibility?.textSize?.replace('%', ''));
	const migratedPageSize = Number.isFinite(legacySize) && legacySize > 0
		? legacySize
		: oldAccessibility?.largerText
			? 110
			: 100;
	settings.value = {
		...defaults,
		...stored,
		accessibility: {
			...defaults.accessibility,
			...oldAccessibility,
			pageSize: Math.min(150, Math.max(25, migratedPageSize))
		}
	};
}

export const appSettings = settings;
