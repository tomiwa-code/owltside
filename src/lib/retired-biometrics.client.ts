import { browser } from '$app/environment';

/** Clean up legacy opt-ins; never probe a sensor or invoke navigator.credentials. */
export function clearRetiredBiometricStorage(): void {
	if (!browser) return;
	for (const key of ['owltside.biometric.v1', 'owltside.biometric.users.v1']) {
		try { localStorage.removeItem(key); } catch { /* blocked storage is harmless */ }
	}
	try { sessionStorage.removeItem('owltside.biometric.session.v1'); } catch { /* blocked storage */ }
}
