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
	payments: {
		savedMethods: Array<{ id: string; brand: string; last4: string; isDefault: boolean }>;
	};
	accessibility: {
		appearance: 'dark' | 'light';
		largerText: boolean;
		reduceMotion: boolean;
		screenReaderLabels: boolean;
		textSize: '90%' | '100%' | '110%' | '125%';
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
	payments: {
		savedMethods: [
			{ id: 'visa-4821', brand: 'Visa', last4: '4821', isDefault: true },
			{ id: 'verve-1906', brand: 'Verve', last4: '1906', isDefault: false }
		]
	},
	accessibility: {
		appearance: 'dark',
		largerText: false,
		reduceMotion: false,
		screenReaderLabels: true,
		textSize: '100%'
	},
	storage: { offlineMode: true, autoDownloadTickets: true }
};

export const appSettings = persisted<AppSettings>('owltside.settings.v1', defaults);
