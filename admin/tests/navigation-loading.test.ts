import { afterEach, describe, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { navigating } from './mocks/app-state';
import NavigationLoading from '../src/lib/components/NavigationLoading.svelte';
import RootLayout from '../src/routes/+layout.svelte';

afterEach(() => { navigating.to = null; });

describe('admin navigation loading line', () => {
	it('does not show an indicator when no navigation is in progress', () => {
		expect(render(NavigationLoading).body).not.toContain('Loading page');
	});

	it.each(['/dashboard', '/events?page=2', '/login'])('shows an accessible line while navigating to %s', (path) => {
		navigating.to = { url: new URL(path, 'https://admin.example.com') };
		const html = render(NavigationLoading).body;
		expect(html).toContain('role="status"');
		expect(html).toContain('aria-label="Loading page"');
		expect(html).toContain('h-0.5');
		expect(html).toContain('animate-pulse');
		expect(html).toContain('bg-accent');
		expect(html).toContain('motion-reduce:animate-none');
		expect(html).toContain('pointer-events-none');
	});

	it('disappears when navigation settles or is cancelled', () => {
		navigating.to = { url: new URL('https://admin.example.com/users') };
		expect(render(NavigationLoading).body).toContain('Loading page');
		navigating.to = null;
		expect(render(NavigationLoading).body).not.toContain('Loading page');
	});

	it('is mounted once in the shared root layout without replacing page content', () => {
		navigating.to = { url: new URL('https://admin.example.com/dashboard') };
		const children = createRawSnippet(() => ({ render: () => '<p>Admin page content</p>' }));
		const html = render(RootLayout, { props: { children } }).body;
		expect(html.match(/aria-label="Loading page"/g)).toHaveLength(1);
		expect(html).toContain('Admin page content');
		expect(html).toContain('fixed inset-x-0 top-0');
	});
});
