import Chip from '$components/Chip.svelte';
import EventCard from '$components/EventCard.svelte';
import Avatar from '$components/Avatar.svelte';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { EventItem } from '$lib/types';

const event: EventItem = {
	id: 'e1',
	slug: 'test-event',
	title: 'Test Event',
	category: 'music',
	tags: ['live'],
	startsAt: new Date(Date.now() + 86_400_000).toISOString(),
	venue: 'Some Venue',
	city: 'Lagos',
	cover: { from: '#123', to: '#456', icon: 'music' },
	description: 'desc',
	organizer: { id: 'o1', handle: 'org', name: 'Org', avatarColor: '#fff', followers: 1, following: 1 },
	speakers: [],
	agenda: [],
	tiers: [{ id: 't1', name: 'General', price: 15_000, sold: 10, capacity: 100 }],
	faqs: [],
	policies: [],
	viewsToday: 10,
	attendees: 10
};

describe('components', () => {
	it('Chip renders and fires onclick with active styling', async () => {
		const onclick = vi.fn();
		const { container } = render(Chip, { label: 'Music', active: true, onclick });
		const btn = container.querySelector('button')!;
		expect(btn).toHaveTextContent('Music');
		expect(btn.className).toContain('bg-primary');
		await fireEvent.click(btn);
		expect(onclick).toHaveBeenCalled();
	});

	it('EventCard renders title, venue and formatted price', () => {
		render(EventCard, { event });
		expect(screen.getByText('Test Event')).toBeInTheDocument();
		expect(screen.getAllByText(/₦15,000/).length).toBeGreaterThan(0);
		expect(screen.getByText(/Some Venue/)).toBeInTheDocument();
	});

	it('Avatar derives initials', () => {
		render(Avatar, { name: 'Ada Obi' });
		expect(screen.getByText('AO')).toBeInTheDocument();
	});
});
