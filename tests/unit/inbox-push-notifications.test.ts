import { createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, verify } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import AppHeader from '$components/AppHeader.svelte';
import { page } from '$app/state';
import { queryClient } from '$lib/state/query.svelte';
import { appSettings } from '$lib/state/settings.svelte';
import {
	markConversationPushBaseline,
	notifyIncomingDirectMessage,
	notifyUnreadInboxItems
} from '$lib/push.client';
import {
	createVapidAuthorizationHeader,
	encryptWebPushPayload,
	fromBase64Url,
	rememberPushSubscription,
	forgetPushSubscription,
	resolveVapidKeys,
	sendWebPushToUser,
	toBase64Url
} from '$lib/server/webpush';
import type { Conversation, MessageRequest, Profile } from '$lib/types';

function makeProfile(id: string, handle: string, name: string): Profile {
	return {
		id,
		handle,
		name,
		avatarColor: '#4f46e5',
		followers: 0,
		following: 0,
		verified: false
	};
}

function makeConversation(overrides: {
	id: string;
	peerName: string;
	lastMessage: string;
	lastAt: string;
	unread: number;
}): Conversation {
	return {
		id: overrides.id,
		peer: makeProfile(`peer-${overrides.id}`, overrides.peerName.toLowerCase(), overrides.peerName),
		lastMessage: overrides.lastMessage,
		lastAt: overrides.lastAt,
		unread: overrides.unread
	};
}

describe('Inbox messaging push notifications (client OS tray)', () => {
	let showNotification: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		localStorage.clear();
		appSettings.value.notifications.pushEnabled = true;
		appSettings.value.notifications.messages = true;
		appSettings.value.notifications.quietHours = false;

		showNotification = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('Notification', { permission: 'granted' });
		Object.defineProperty(navigator, 'serviceWorker', {
			configurable: true,
			value: {
				getRegistration: vi.fn().mockResolvedValue({
					active: { postMessage: vi.fn() },
					showNotification
				}),
				ready: Promise.resolve({ showNotification })
			}
		});
	});

	afterEach(() => {
		cleanup();
		queryClient.invalidate('notifications');
		queryClient.invalidate('conversations');
		queryClient.invalidate('message-requests');
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it('baselines historical unread threads silently, alerts on new peer messages, resets after reading, and ignores self-sent messages', async () => {
		const prefs = { pushEnabled: true, messages: true, soundHaptics: true };
		const userId = 'u-ada';
		const oldIso = new Date(Date.now() - 15 * 60_000).toISOString();

		// 1. Historical unread thread (>45s old) is seeded silently on first load
		const initialConv = makeConversation({
			id: 'c-1',
			peerName: 'Tunde',
			lastMessage: 'Old message from yesterday',
			lastAt: oldIso,
			unread: 1
		});
		await notifyUnreadInboxItems([initialConv], [], prefs, userId);
		expect(showNotification).not.toHaveBeenCalled();

		// 2. User opens the chat and reads it (unread drops 1 -> 0)
		const readConv = { ...initialConv, unread: 0 };
		await notifyUnreadInboxItems([readConv], [], prefs, userId);
		expect(showNotification).not.toHaveBeenCalled();

		// 3. User sends their OWN message (unread stays 0 while lastMessage/lastAt changes) -> NO push alert
		const selfSentAt = new Date().toISOString();
		const afterSelfReply = {
			...readConv,
			lastMessage: 'Hey Tunde, I am heading out now!',
			lastAt: selfSentAt,
			unread: 0
		};
		await notifyUnreadInboxItems([afterSelfReply], [], prefs, userId);
		expect(showNotification).not.toHaveBeenCalled();

		// 4. Tunde replies (unread increments 0 -> 1) -> OS push notification fires!
		const peerReplyAt = new Date(Date.now() + 1_000).toISOString();
		const afterPeerReply = {
			...readConv,
			lastMessage: 'Meet me at VIP Gate 2!',
			lastAt: peerReplyAt,
			unread: 1
		};
		await notifyUnreadInboxItems([afterPeerReply], [], prefs, userId);
		expect(showNotification).toHaveBeenCalledTimes(1);
		expect(showNotification).toHaveBeenCalledWith(
			'New message from Tunde',
			expect.objectContaining({
				body: 'Meet me at VIP Gate 2!',
				data: { url: '/inbox/c-1' }
			})
		);

		// 5. Tunde sends a second message before Ada opens the chat (unread 1 -> 2) -> fires again!
		const secondReplyAt = new Date(Date.now() + 3_000).toISOString();
		const afterSecondReply = {
			...afterPeerReply,
			lastMessage: 'Bringing your backstage wristband',
			lastAt: secondReplyAt,
			unread: 2
		};
		await notifyUnreadInboxItems([afterSecondReply], [], prefs, userId);
		expect(showNotification).toHaveBeenCalledTimes(2);
		expect(showNotification).toHaveBeenLastCalledWith(
			'New message from Tunde',
			expect.objectContaining({
				body: 'Bringing your backstage wristband',
				data: { url: '/inbox/c-1' }
			})
		);
	});

	it('deduplicates Realtime message INSERT notifications against subsequent conversation polls', async () => {
		const prefs = { pushEnabled: true, messages: true, soundHaptics: true };
		const userId = 'u-ada';
		const sentAt = new Date().toISOString();

		// Baseline empty inbox
		await notifyUnreadInboxItems([], [], prefs, userId);

		// Realtime `messages` INSERT arrives first
		const delivered = await notifyIncomingDirectMessage(
			{
				id: 'msg-99',
				conversationId: 'c-amina',
				senderName: 'Amina',
				body: 'Soundcheck starts at 6 PM',
				sentAt
			},
			prefs,
			userId
		);
		expect(delivered).toBe(true);
		expect(showNotification).toHaveBeenCalledTimes(1);

		// Subsequent `/api/conversations` poll sees unread: 1 with the same message -> must NOT duplicate
		const polledConv = makeConversation({
			id: 'c-amina',
			peerName: 'Amina',
			lastMessage: 'Soundcheck starts at 6 PM',
			lastAt: sentAt,
			unread: 1
		});
		await notifyUnreadInboxItems([polledConv], [], prefs, userId);
		expect(showNotification).toHaveBeenCalledTimes(1);
	});

	it('respects the Direct Messages preference toggle and delivers incoming message requests', async () => {
		const userId = 'u-org';
		await notifyUnreadInboxItems([], [], { pushEnabled: true, messages: false, soundHaptics: true }, userId);

		// Muted messages -> updates baseline silently without firing OS tray alert
		const mutedConv = makeConversation({
			id: 'c-muted',
			peerName: 'Kemi',
			lastMessage: 'Muted hello',
			lastAt: new Date().toISOString(),
			unread: 1
		});
		await notifyUnreadInboxItems(
			[mutedConv],
			[],
			{ pushEnabled: true, messages: false, soundHaptics: true },
			userId
		);
		expect(showNotification).not.toHaveBeenCalled();

		// Re-enabling messages alerts on newly arriving message requests
		const newReq: MessageRequest = {
			id: 'req-1',
			eventId: 'ev-1',
			eventSlug: 'lagos-fest',
			eventTitle: 'Lagos Fest',
			requester: makeProfile('u-req', 'bola', 'Bola'),
			organizer: makeProfile('u-org', 'org', 'Organizer'),
			body: 'Hi, do group tickets include table service?',
			createdAt: new Date().toISOString(),
			status: 'pending'
		};
		await notifyUnreadInboxItems(
			[mutedConv],
			[newReq],
			{ pushEnabled: true, messages: true, soundHaptics: true },
			userId
		);
		expect(showNotification).toHaveBeenCalledTimes(1);
		expect(showNotification).toHaveBeenCalledWith(
			'Message request from Bola',
			expect.objectContaining({
				body: 'Hi, do group tickets include table service?',
				data: { url: '/inbox' }
			})
		);

		// Accepting a request marks baseline so organizer does not get self-echoed
		const acceptTime = new Date().toISOString();
		markConversationPushBaseline('c-bola', 1, acceptTime, newReq.body, userId);
		await notifyUnreadInboxItems(
			[
				mutedConv,
				makeConversation({
					id: 'c-bola',
					peerName: 'Bola',
					lastMessage: newReq.body,
					lastAt: acceptTime,
					unread: 1
				})
			],
			[],
			{ pushEnabled: true, messages: true, soundHaptics: true },
			userId
		);
		expect(showNotification).toHaveBeenCalledTimes(1);
	});

	it('AppHeader dispatches a device push notification when a message arrives from another user', async () => {
		Object.assign(page.data, {
			session: {
				userId: 'u-me',
				email: 'ada@owltside.com',
				handle: 'ada',
				name: 'Ada',
				role: 'attendee' as const,
				avatarUrl: null
			},
			currentProfile: null,
			unread: 0,
			inboxUnread: 0,
			operatingIdentity: 'attendee'
		});

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('[]', { headers: { 'content-type': 'application/json' } }))
		);

		const oldAt = new Date(Date.now() - 5 * 60_000).toISOString();
		queryClient.set('notifications:mine', []);
		queryClient.set('message-requests:mine', []);
		queryClient.set('conversations:mine', [
			makeConversation({
				id: 'c-chidi',
				peerName: 'Chidi',
				lastMessage: 'Catch you later',
				lastAt: oldAt,
				unread: 0
			})
		]);

		render(AppHeader);
		await tick();
		expect(showNotification).not.toHaveBeenCalled();

		// Chidi sends a new message -> unread becomes 1
		queryClient.set('conversations:mine', [
			makeConversation({
				id: 'c-chidi',
				peerName: 'Chidi',
				lastMessage: 'Are you outside Gate 1?',
				lastAt: new Date().toISOString(),
				unread: 1
			})
		]);
		await tick();

		await waitFor(() => expect(showNotification).toHaveBeenCalledTimes(1));
		expect(showNotification).toHaveBeenCalledWith(
			'New message from Chidi',
			expect.objectContaining({
				body: 'Are you outside Gate 1?',
				data: { url: '/inbox/c-chidi' }
			})
		);
	});
});

describe('Server W3C Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID ES256)', () => {
	afterEach(() => {
		forgetPushSubscription('u-recipient');
		vi.unstubAllGlobals();
	});

	it('derives a valid P-256 VAPID keypair and signs verifiable ES256 VAPID JWT headers', () => {
		const vapid = resolveVapidKeys();
		const pubBytes = fromBase64Url(vapid.publicKey);
		const privBytes = fromBase64Url(vapid.privateKey);
		expect(pubBytes.length).toBe(65);
		expect(pubBytes[0]).toBe(0x04);
		expect(privBytes.length).toBe(32);

		const header = createVapidAuthorizationHeader('https://fcm.googleapis.com/fcm/send/demo', vapid);
		expect(header.startsWith('vapid t=')).toBe(true);
		const match = header.match(/^vapid t=([^,]+), k=(.+)$/);
		expect(match).not.toBeNull();

		const jwt = match![1];
		const [hB64, pB64, sigB64] = jwt.split('.');
		const claims = JSON.parse(fromBase64Url(pB64).toString('utf8'));
		expect(claims.aud).toBe('https://fcm.googleapis.com');

		// Verify ES256 IEEE-P1363 signature against uncompressed P-256 SPKI
		const spkiPrefix = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');
		const pubKeyObj = createPublicKey({
			key: Buffer.concat([spkiPrefix, pubBytes]),
			format: 'der',
			type: 'spki'
		});
		const isValid = verify(
			'sha256',
			Buffer.from(`${hB64}.${pB64}`, 'utf8'),
			{ key: pubKeyObj, dsaEncoding: 'ieee-p1363' },
			fromBase64Url(sigB64)
		);
		expect(isValid).toBe(true);
	});

	it('encrypts RFC 8291 aes128gcm Web Push payloads and dispatches to subscribed endpoints', async () => {
		const subscriberEcdh = createECDH('prime256v1');
		subscriberEcdh.generateKeys();
		const uaPublic = subscriberEcdh.getPublicKey();
		const authSecret = randomBytes(16);

		const plaintext = JSON.stringify({
			title: 'New message from Ada',
			body: 'See you at the main stage!',
			url: '/inbox/c-1'
		});
		const body = encryptWebPushPayload(plaintext, toBase64Url(uaPublic), toBase64Url(authSecret));

		// Verify RFC 8291 header layout & decrypt as the browser UA would
		const salt = body.subarray(0, 16);
		const rs = body.readUInt32BE(16);
		const idlen = body[20];
		const asPublic = body.subarray(21, 21 + idlen);
		const ciphertextWithTag = body.subarray(21 + idlen);
		expect(rs).toBe(4096);
		expect(idlen).toBe(65);

		const shared = subscriberEcdh.computeSecret(asPublic);
		const prkKey = createHmac('sha256', authSecret).update(shared).digest();
		const ikm = createHmac('sha256', prkKey)
			.update(Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublic, asPublic, Buffer.from([0x01])]))
			.digest()
			.subarray(0, 32);
		const prk = createHmac('sha256', salt).update(ikm).digest();
		const cek = createHmac('sha256', prk)
			.update(Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), Buffer.from([0x01])]))
			.digest()
			.subarray(0, 16);
		const nonce = createHmac('sha256', prk)
			.update(Buffer.concat([Buffer.from('Content-Encoding: nonce\0', 'utf8'), Buffer.from([0x01])]))
			.digest()
			.subarray(0, 12);

		const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
		decipher.setAuthTag(ciphertextWithTag.subarray(ciphertextWithTag.length - 16));
		const decryptedRecord = Buffer.concat([
			decipher.update(ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16)),
			decipher.final()
		]);
		expect(decryptedRecord[decryptedRecord.length - 1]).toBe(0x02);
		expect(decryptedRecord.subarray(0, decryptedRecord.length - 1).toString('utf8')).toBe(plaintext);

		// End-to-end sendWebPushToUser delivery test
		const pushEndpoint = 'https://fcm.googleapis.com/fcm/send/sub-123';
		rememberPushSubscription('u-recipient', {
			endpoint: pushEndpoint,
			p256dh: toBase64Url(uaPublic),
			auth: toBase64Url(authSecret)
		});
		const fetchSpy = vi.fn().mockResolvedValue(new Response('', { status: 201 }));
		vi.stubGlobal('fetch', fetchSpy);

		const count = await sendWebPushToUser('u-recipient', {
			title: 'New message from Ada',
			body: 'See you at the main stage!',
			url: '/inbox/c-1',
			tag: 'owltside-dm-c-1-123'
		});
		expect(count).toBe(1);
		expect(fetchSpy).toHaveBeenCalledWith(
			pushEndpoint,
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					'Content-Encoding': 'aes128gcm',
					Urgency: 'high'
				})
			})
		);
	});
});
