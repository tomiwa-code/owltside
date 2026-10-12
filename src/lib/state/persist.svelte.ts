import { browser } from '$app/environment';

/**
 * Module-level persisted reactive value (localStorage-backed).
 * Uses $effect.root so it is safe to create outside component
 * initialisation (module scope, stores, tests).
 */
export function persisted<T>(key: string, initial: T): { value: T } {
	let value = $state<T>(initial);
	if (browser) {
		try {
			const raw = localStorage.getItem(key);
			if (raw !== null) value = JSON.parse(raw) as T;
		} catch {
			/* corrupt entry — fall back to initial */
		}
		$effect.root(() => {
			$effect(() => {
				try {
					localStorage.setItem(key, JSON.stringify(value));
				} catch {
					/* storage full / private mode — non-fatal */
				}
			});
		});
	}
	return {
		get value() {
			return value;
		},
		set value(v: T) {
			value = v;
		}
	};
}
