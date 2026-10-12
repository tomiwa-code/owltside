import type { Currency } from '$lib/types';
import { persisted } from './persist.svelte';

/** UI preferences that survive reloads (currency, bookmarks, follows). */
export const currency = persisted<Currency>('owltside.prefs.currency', 'NGN');
export const bookmarks = persisted<string[]>('owltside.prefs.bookmarks', []);
export const follows = persisted<string[]>('owltside.prefs.follows', []);

export function toggleIn(list: { value: string[] }, id: string): boolean {
	const has = list.value.includes(id);
	list.value = has ? list.value.filter((x) => x !== id) : [...list.value, id];
	return !has;
}
