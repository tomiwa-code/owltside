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

	it('keeps a first message in requests until the organizer accepts it', async () => {
		const event = (await demoSource.listEvents()).find((item) => item.organizer.id !== 'u-ada')!;
		const request = await demoSource.createMessageRequest('u-ada', event.slug, 'Hello about the event');

		expect(request.status).toBe('pending');
		expect(await demoSource.getIncomingMessageRequests(event.organizer.id)).toContainEqual(request);

		const accepted = await demoSource.respondToMessageRequest(event.organizer.id, request.id, true);
		expect(accepted.status).toBe('accepted');
		expect(accepted.conversationId).toBeTruthy();
		expect((await demoSource.getEventMessageRequest('u-ada', event.id))?.conversationId).toBe(accepted.conversationId);
		expect((await demoSource.getConversations(event.organizer.id)).some((conversation) => conversation.id === accepted.conversationId)).toBe(true);
		expect((await demoSource.getMessages(accepted.conversationId!)).map((message) => message.body)).toContain('Hello about the event');
	});

	it('lets an invitee accept a role and shows it on their public profile', async () => {
		const event = await demoSource.createEvent('u-ada', {
			title: 'Speaker Invite Notification Test',
			category: 'community gathering',
			tags: [],
			startsAt: new Date().toISOString(),
			venue: 'Demo Hall',
			city: 'Lagos',
			description: '',
			cover: { from: '#111827', to: '#312e81', icon: 'mic' },
			tiers: [],
			agenda: [],
			gates: [],
			speakers: [
				{ id: 'u-segun', handle: 'seguna', name: 'Segun Alakija', role: 'Panel moderator', invited: true },
				{ name: 'Guest artist', role: 'Live performer', invited: false, displayOnly: true }
			]
		});

		const invite = (await demoSource.getNotifications('u-segun')).find((notification) => notification.title.includes(event.title));
		expect(invite?.body).toContain('Panel moderator');
		expect(invite?.href).toBe(`/events/${event.slug}`);
		expect((await demoSource.getNotifications('u-ada')).some((notification) => notification.title.includes(event.title))).toBe(false);
		expect((await demoSource.getProfileEvents('u-segun')).some((profileEvent) => profileEvent.id === event.id)).toBe(false);
		await expect(demoSource.respondToSpeakerInvite('u-ada', event.slug, true)).rejects.toThrow('Speaker invitation not found');

		expect(await demoSource.respondToSpeakerInvite('u-segun', event.slug, true)).toBe('accepted');
		const profileEvent = (await demoSource.getProfileEvents('u-segun')).find((item) => item.id === event.id);
		expect(profileEvent?.speakers.find((speaker) => speaker.id === 'u-segun')).toMatchObject({
			role: 'Panel moderator',
			inviteStatus: 'accepted'
		});
		await expect(demoSource.respondToSpeakerInvite('u-segun', event.slug, false)).rejects.toThrow('already been answered');
	});
});
