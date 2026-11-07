import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync('src/app.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];

function firstPaint() {
	const page = new DOMParser().parseFromString(html, 'text/html');
	new Function('document', 'localStorage', script)(page, localStorage);
	return {
		theme: page.documentElement.dataset.theme,
		darkClass: page.documentElement.classList.contains('dark'),
		chromeColor: page.querySelector('meta[name="theme-color"]')?.getAttribute('content')
	};
}

beforeEach(() => {
	localStorage.clear();
	vi.resetModules();
});
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('light theme default', () => {
	it('ships light SSR markup even before JavaScript runs', () => {
		const page = new DOMParser().parseFromString(html, 'text/html');
		expect(page.documentElement.dataset.theme).toBe('light');
		expect(page.documentElement.classList.contains('dark')).toBe(false);
	});

	it('uses light for a first visit both before paint and after settings initialize', async () => {
		expect(firstPaint()).toEqual({ theme: 'light', darkClass: false, chromeColor: '#f8f9ff' });
		const { appSettings } = await import('$lib/state/settings.svelte');
		expect(appSettings.value.accessibility.appearance).toBe('light');
	});

	it('uses light when browser storage is blocked', async () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked storage'); });
		expect(firstPaint().theme).toBe('light');
		const { appSettings } = await import('$lib/state/settings.svelte');
		expect(appSettings.value.accessibility.appearance).toBe('light');
	});

	it.each(['light', 'dark'] as const)('preserves saved %s appearance on reload', async (appearance) => {
		localStorage.setItem('owltside.settings.v1', JSON.stringify({ accessibility: { appearance } }));
		expect(firstPaint()).toMatchObject({ theme: appearance, darkClass: appearance === 'dark' });
		const { appSettings } = await import('$lib/state/settings.svelte');
		expect(appSettings.value.accessibility.appearance).toBe(appearance);
	});

	it('preserves a legacy dark preference stored only in the appearance cache', async () => {
		localStorage.setItem('owltside.theme', 'dark');
		expect(firstPaint()).toEqual({ theme: 'dark', darkClass: true, chromeColor: '#1A1A1A' });
		const { appSettings } = await import('$lib/state/settings.svelte');
		expect(appSettings.value.accessibility.appearance).toBe('dark');
	});

	it('prefers actual settings over an out-of-date appearance cache', async () => {
		localStorage.setItem('owltside.settings.v1', JSON.stringify({ accessibility: { appearance: 'light' } }));
		localStorage.setItem('owltside.theme', 'dark');
		expect(firstPaint().theme).toBe('light');
		const { appSettings } = await import('$lib/state/settings.svelte');
		expect(appSettings.value.accessibility.appearance).toBe('light');
	});

	it('falls back to light for invalid saved appearance values', async () => {
		localStorage.setItem('owltside.settings.v1', JSON.stringify({ accessibility: { appearance: 'invalid', pageSize: 100 } }));
		localStorage.setItem('owltside.theme', 'invalid');
		expect(firstPaint().theme).toBe('light');
		const { appSettings } = await import('$lib/state/settings.svelte');
		expect(appSettings.value.accessibility.appearance).toBe('light');
	});

	it('can use the cache when the full settings entry is corrupt', async () => {
		localStorage.setItem('owltside.settings.v1', '{broken');
		localStorage.setItem('owltside.theme', 'dark');
		expect(firstPaint().theme).toBe('dark');
		const { appSettings } = await import('$lib/state/settings.svelte');
		expect(appSettings.value.accessibility.appearance).toBe('dark');
	});

	it('uses matching light launch colors for installed mobile and desktop PWAs', () => {
		const manifest = JSON.parse(readFileSync('static/manifest.webmanifest', 'utf8'));
		expect(manifest.background_color).toBe('#f8f9ff');
		expect(manifest.theme_color).toBe('#f8f9ff');
	});
});
