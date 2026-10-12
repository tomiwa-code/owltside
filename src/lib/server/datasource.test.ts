import { describe, expect, it } from 'vitest';
import { demoSource, minPrice } from './datasource';

describe('demo datasource', () => {
	it('lists events sorted by date by default', async () => {
		const events = await demoSource.listEvents();
		const dates = events.map((e) => +new Date(e.startsAt));
		expect([...dates].sort((a, b) => a - b)).toEqual(dates);
	});

	it('filters by category', async () => {
		const music = await demoSource.listEvents({ category: 'music' });
		expect(music.length).toBeGreaterThan(0);
		expect(music.every((e) => e.category === 'music')).toBe(true);
	});

	it('filters free-only events', async () => {
		const free = await demoSource.listEvents({ freeOnly: true });
		expect(free.length).toBeGreaterThan(0);
		expect(free.every((e) => minPrice(e) === 0)).toBe(true);
	});

	it('searches by text', async () => {
		const hit = await demoSource.listEvents({ query: 'afrobeats' });
		expect(hit.some((e) => e.slug === 'afrobeats-sound-sunset')).toBe(true);
	});

	it('resolves an event by slug and 404s unknown ones', async () => {
		expect((await demoSource.getEvent('pulse-ai-summit-lagos'))?.title).toContain('Pulse AI');
		expect(await demoSource.getEvent('nope')).toBeUndefined();
	});

	it('creates an order, mints tickets and decrements capacity', async () => {
		const before = (await demoSource.getEvent('product-craft-masterclass'))!;
		const soldBefore = before.tiers[0].sold;
		const order = await demoSource.createOrder('u-ada', 'product-craft-masterclass', [
			{ tierId: before.tiers[0].id, qty: 1 }
		]);
		expect(order.tickets).toHaveLength(1);
		expect(order.tickets[0].code).toMatch(/^EV-/);
		const after = (await demoSource.getEvent('product-craft-masterclass'))!;
		expect(after.tiers[0].sold).toBe(soldBefore + 1);
	});

	it('refuses orders beyond capacity', async () => {
		await expect(
			demoSource.createOrder('u-ada', 'product-craft-masterclass', [
				{ tierId: 'tier-seat', qty: 6 }
			])
		).rejects.toThrow();
	});

	it('sends a message and updates the conversation preview', async () => {
		const msg = await demoSource.sendMessage('c-tunde', 'u-ada', 'testing!');
		expect(msg.body).toBe('testing!');
		const convs = await demoSource.getConversations('demo');
		expect(convs.find((c) => c.id === 'c-tunde')?.lastMessage).toBe('testing!');
	});
});
