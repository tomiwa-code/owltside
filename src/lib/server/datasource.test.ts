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

	it('ties the chat event brief to the event the message request came from', async () => {
		const event = (await demoSource.getEvent('fusion-gastro-beer-fair'))!;
		const request = await demoSource.createMessageRequest('u-ada', event.slug, 'Question about the beer fair');
		const accepted = request.status === 'accepted' && request.conversationId
			? request
			: await demoSource.respondToMessageRequest(event.organizer.id, request.id, true);

		const expected = { id: event.id, slug: event.slug, title: event.title };
		const requesterView = (await demoSource.getConversations('u-ada')).find((c) => c.id === accepted.conversationId);
		const organizerView = (await demoSource.getConversations(event.organizer.id)).find((c) => c.id === accepted.conversationId);
		expect(requesterView?.event).toEqual(expected);
		expect(organizerView?.event).toEqual(expected);
	});

	it('keeps seeded threads on their own event brief', async () => {
		const convs = await demoSource.getConversations('demo');
		expect(convs.find((c) => c.id === 'c-amina')?.event).toEqual({
			id: 'e-pulse-ai',
			slug: 'pulse-ai-summit-lagos',
			title: 'Pulse AI Summit Lagos'
		});
		expect(convs.find((c) => c.id === 'c-support')?.event ?? null).toBe(null);
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
	it('issues gate PINs only for configured organizer-owned event gates', async () => {
		const event = await demoSource.createEvent('u-ada', {
			title: 'Gate PIN Authorization Test', category: 'music', tags: [],
			startsAt: new Date().toISOString(), venue: 'Test Hall', city: 'Lagos', description: 'A test event with a gate.',
			cover: { from: '#111827', to: '#312e81', icon: 'image' }, tiers: [{ name: 'General', price: 0, capacity: 5, benefits: '' }], agenda: [], speakers: [],
			gates: [{ id: 'gate-main', name: 'Main Gate', modes: ['QR'], staff: ['Door lead'] }]
		});
		const token = await demoSource.issueGateToken('u-ada', event.id, 'Main Gate');
		expect(token.code).toMatch(/^\d{6}$/);
		expect(await demoSource.verifyGateToken('u-ada', event.id, 'Main Gate', token.code)).toBe(true);
		expect(await demoSource.verifyGateToken('u-ada', event.id, 'Main Gate', '000000')).toBe(false);
		expect(await demoSource.verifyGateToken('u-tunde', event.id, 'Main Gate', token.code)).toBe(false);
		const order = await demoSource.createOrder('u-ada', event.slug, [{ tierId: event.tiers[0].id, qty: 1 }]);
		const validCheckin = await demoSource.checkInTicket(event.id, order.tickets[0].code, 'Main Gate');
		expect(validCheckin.result).toBe('verified');
		const arbitraryCheckin = await demoSource.checkInTicket(event.id, 'not-a-generated-ticket', 'Main Gate');
		expect(arbitraryCheckin.result).toBe('invalid');
		const otherEvent = await demoSource.createEvent('u-ada', {
			title: 'Different Event Ticket Scope Test', category: 'music', tags: [], startsAt: new Date().toISOString(),
			venue: 'Other Hall', city: 'Lagos', description: 'Another event for scope validation.',
			cover: { from: '#111827', to: '#312e81', icon: 'image' }, tiers: [], agenda: [], speakers: [], gates: []
		});
		const crossEventCheckin = await demoSource.checkInTicket(otherEvent.id, order.tickets[0].code, 'Main Gate');
		expect(crossEventCheckin.result).toBe('invalid');
		await expect(demoSource.issueGateToken('u-ada', event.id, 'Unconfigured Gate')).rejects.toThrow('Gate not found');
	});
	it('issues a standalone terminal PIN that needs no event or gate', async () => {
		const token = await demoSource.issueScannerToken('u-ada');
		expect(token.code).toMatch(/^\d{6}$/);
		expect(Date.parse(token.expiresAt)).toBeGreaterThan(Date.now());
		expect(await demoSource.verifyScannerToken('u-ada', token.code)).toBe(true);
		expect(await demoSource.verifyScannerToken('u-ada', '000000' === token.code ? '111111' : '000000')).toBe(false);
		// Another organizer cannot use it, and rotating revokes the old PIN.
		expect(await demoSource.verifyScannerToken('u-tunde', token.code)).toBe(false);
		const rotated = await demoSource.issueScannerToken('u-ada');
		if (rotated.code !== token.code) {
			expect(await demoSource.verifyScannerToken('u-ada', token.code)).toBe(false);
		}
		expect(await demoSource.verifyScannerToken('u-ada', rotated.code)).toBe(true);
	});

});
