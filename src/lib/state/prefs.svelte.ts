import type { Currency } from '$lib/types';
import { persisted } from './persist.svelte';

/** UI preferences that survive reloads (currency, bookmarks). */
export const currency = persisted<Currency>('owltside.prefs.currency', 'NGN');
export const bookmarks = persisted<string[]>('owltside.prefs.bookmarks', []);

export function toggleIn(list: { value: string[] }, id: string): boolean {
	const has = list.value.includes(id);
	list.value = has ? list.value.filter((x) => x !== id) : [...list.value, id];
	return !has;
}
