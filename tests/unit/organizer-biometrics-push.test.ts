import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { Checkin, EventItem, NotificationItem, Order, Ticket } from '$lib/types';
import {
	decryptBiometricVault,
	encryptBiometricVault,
	fromBase64Url,
	issueWebAuthnChallenge,
	toBase64Url,
	verifyWebAuthnAssertion,
	verifyWebAuthnChallengeToken
} from '$lib/server/webauthn';
import { notifyUnreadStreamItems } from '$lib/push.client';
import { appSettings } from '$lib/state/settings.svelte';
import { computeOrganizer } from '$lib/server/datasource';
import OrganizerPage from '../../src/routes/(app)/organizer/+page.svelte';

describe('Organizer event switcher (multiple events)', () => {
	const baseData = {
		unread: 0,
		inboxUnread: 0,
		operatingIdentity: 'organizer' as const,
		session: {
			userId: 'u-org',
			email: 'org@owltside.com',
			name: 'Tomiwa Host',
			handle: 'tomiwahost',
			role: 'organizer' as const
		},
		demoMode: true,
		currentProfile: null,
		followingIds: [] as string[],
		followLoadError: false
	};

	const makeEvent = (overrides: {
		id: string;
		slug: string;
		title: string;
		venue: string;
		tiers: EventItem['tiers'];
		attendees: number;
	}): EventItem =>
		({
			id: overrides.id,
			slug: overrides.slug,
			title: overrides.title,
			description: 'Full production live event.',
			category: 'music',
			tags: ['Music'],
			startsAt: '2026-12-10T20:00:00.000Z',
			endsAt: '2026-12-11T02:00:00.000Z',
			venue: overrides.venue,
			city: 'Lagos',
			cover: { from: '#1e1b4b', to: '#4c1d95', icon: 'music' },
			organizer: { id: 'u-org', name: 'Tomiwa Host', handle: 'tomiwahost', verified: true },
			tiers: overrides.tiers,
			agenda: [],
			speakers: [],
			attendees: overrides.attendees,
			gates: [],
			promos: [],
			status: 'published'
		}) as unknown as EventItem;

	beforeEach(() => {
		vi.stubGlobal('scrollTo', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('renders the event switcher when organizer has 2+ events and updates active event metrics on switch', async () => {
		const ev1 = makeEvent({
			id: 'ev-alpha',
			slug: 'lagos-sound-fest',
			title: 'Lagos Sound Fest',
			venue: 'Landmark Beach',
			tiers: [{ id: 't-a', name: 'Arena VIP', price: 20000, capacity: 100, sold: 40 }],
			attendees: 40
		});
		const ev2 = makeEvent({
			id: 'ev-beta',
			slug: 'abuja-tech-gala',
			title: 'Abuja Tech Gala',
			venue: 'Transcorp Hilton',
			tiers: [{ id: 't-b', name: 'Founder Table', price: 50000, capacity: 80, sold: 10 }],
			attendees: 10
		});

		const orders = [
			{
				id: 'ord-1',
				eventId: 'ev-alpha',
				reference: 'REF-ALPHA',
				total: 800000,
				itemsLabel: 'Arena VIP × 40',
				status: 'paid',
				gateway: 'paystack',
				createdAt: '2026-10-30T10:00:00.000Z'
			},
			{
				id: 'ord-2',
				eventId: 'ev-beta',
				reference: 'REF-BETA',
				total: 500000,
				itemsLabel: 'Founder Table × 10',
				status: 'paid',
				gateway: 'paystack',
				createdAt: '2026-10-30T11:00:00.000Z'
			}
		] as unknown as Order[];

		const tickets = [
			{
				id: 'tkt-1',
				code: 'EV-ALPH-0001',
				eventId: 'ev-alpha',
				eventSlug: 'lagos-sound-fest',
				eventTitle: 'Lagos Sound Fest',
				eventStartsAt: ev1.startsAt,
				venue: ev1.venue,
				tierName: 'Arena VIP',
				holder: 'Ada',
				status: 'used',
				purchasedAt: '2026-10-30T10:00:00.000Z',
				price: 20000,
				cover: ev1.cover
			},
			{
				id: 'tkt-2',
				code: 'EV-BETA-0002',
				eventId: 'ev-beta',
				eventSlug: 'abuja-tech-gala',
				eventTitle: 'Abuja Tech Gala',
				eventStartsAt: ev2.startsAt,
				venue: ev2.venue,
				tierName: 'Founder Table',
				holder: 'Bola',
				status: 'valid',
				purchasedAt: '2026-10-30T11:00:00.000Z',
				price: 50000,
				cover: ev2.cover
			}
		] as unknown as Ticket[];

		const checkIns = [
			{
				id: 'chk-alpha',
				eventId: 'ev-alpha',
				code: 'EV-ALPH-0001',
				holder: 'Ada AlphaGuest',
				tierName: 'Arena VIP',
				gate: 'Main Gate',
				at: '2026-10-30T20:10:00.000Z',
				result: 'verified'
			},
			{
				id: 'chk-beta',
				eventId: 'ev-beta',
				code: 'EV-BETA-0002',
				holder: 'Bola BetaGuest',
				tierName: 'Founder Table',
				gate: 'VIP Gate',
				at: '2026-10-30T21:15:00.000Z',
				result: 'verified'
			}
		] as unknown as Checkin[];

		const payload = computeOrganizer([ev1, ev2], tickets, orders, checkIns);
		render(OrganizerPage, { data: { ...baseData, payload } });
		await tick();

		const selects = Array.from(
			document.querySelectorAll<HTMLSelectElement>('select[aria-label="Switch active event"]')
		);
		expect(selects.length).toBe(2); // desktop + mobile switchers

		expect(document.body.textContent).toContain('Arena VIP');
		expect(document.body.textContent).toContain('Ada AlphaGuest');

		await fireEvent.change(selects[0], { target: { value: 'ev-beta' } });
		await tick();

		expect(document.body.textContent).toContain('Founder Table');
		expect(document.body.textContent).toContain('Bola BetaGuest');
		expect(document.body.textContent).toContain('Transcorp Hilton');
	});
});

describe('WebAuthn Biometrics cryptographic verification & encrypted vault', () => {
	it('issues and validates signed challenges, rejects tampered tokens, and encrypts/decrypts biometric vault', () => {
		const issued = issueWebAuthnChallenge('register', 'user-123');
		const verified = verifyWebAuthnChallengeToken(issued.challengeToken, 'register');
		expect(verified.challenge).toBe(issued.challenge);
		expect(verified.userId).toBe('user-123');

		expect(() => verifyWebAuthnChallengeToken(`${issued.challengeToken}tampered`, 'register')).toThrow();
		expect(() => verifyWebAuthnChallengeToken(issued.challengeToken, 'authenticate')).toThrow();

		const vault = encryptBiometricVault([
			{
				credentialId: 'cred-1',
				publicKey: 'pk-spki',
				algorithm: -7,
				counter: 1,
				deviceLabel: 'iPhone Face ID',
				userId: 'user-123',
				userName: 'Ada Obi',
				createdAt: '2026-10-31T00:00:00.000Z'
			}
		]);
		const restored = decryptBiometricVault(vault);
		expect(restored).toHaveLength(1);
		expect(restored[0].credentialId).toBe('cred-1');
		expect(restored[0].deviceLabel).toBe('iPhone Face ID');
	});

	it('verifies an ES256 (P-256) WebAuthn assertion signature over authenticatorData + sha256(clientDataJSON)', () => {
		const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
		const spki = publicKey.export({ format: 'der', type: 'spki' });

		const issued = issueWebAuthnChallenge('authenticate', 'user-bio');
		const origin = 'https://owltside.com';
		const rpId = 'owltside.com';

		const clientData = JSON.stringify({
			type: 'webauthn.get',
			challenge: issued.challenge,
			origin
		});
		const clientDataB64 = toBase64Url(Buffer.from(clientData, 'utf8'));

		const rpHash = createHash('sha256').update(rpId, 'utf8').digest();
		const flags = Buffer.from([0x05]); // UP (0x01) | UV (0x04)
		const counter = Buffer.alloc(4);
		counter.writeUInt32BE(7, 0);
		const authData = Buffer.concat([rpHash, flags, counter]);
		const authDataB64 = toBase64Url(authData);

		const clientHash = createHash('sha256').update(fromBase64Url(clientDataB64)).digest();
		const signedPayload = Buffer.concat([authData, clientHash]);
		const derSignature = sign('sha256', signedPayload, privateKey);

		const result = verifyWebAuthnAssertion({
			authenticatorData: authDataB64,
			clientDataJSON: clientDataB64,
			signature: toBase64Url(derSignature),
			expectedChallenge: issued.challenge,
			expectedOrigin: origin,
			publicKeySpki: toBase64Url(spki)
		});

		expect(result.counter).toBe(7);
		expect(result.userVerified).toBe(true);
	});
});

describe('Push notification stream delivery & deduplication', () => {
	beforeEach(() => {
		appSettings.value.notifications.pushEnabled = true;
		localStorage.clear();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it('seeds historical unread notifications silently and dispatches OS notifications only for newly arrived items', async () => {
		const showNotification = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('Notification', {
			permission: 'granted'
		});
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

		const prefs = {
			pushEnabled: true,
			eventReminders: true,
			marketing: true,
			soundHaptics: true
		};

		const oldAt = new Date(Date.now() - 10 * 60_000).toISOString();
		const oldItem: NotificationItem = {
			id: 'n-existing',
			kind: 'ticket',
			title: 'Old ticket',
			body: 'Already in inbox',
			at: oldAt,
			read: false
		};

		// First load baselines historical items (>45s old) without spamming OS tray
		await notifyUnreadStreamItems([oldItem], prefs);
		expect(showNotification).not.toHaveBeenCalled();

		// Newly arrived unread notification -> delivered to OS notification tray
		const newItem: NotificationItem = {
			id: 'n-new-1',
			kind: 'system',
			title: 'Refund approved',
			body: '₦20,000 returned',
			at: new Date().toISOString(),
			read: false
		};
		await notifyUnreadStreamItems([newItem, oldItem], prefs);
		expect(showNotification).toHaveBeenCalledTimes(1);
		expect(showNotification).toHaveBeenCalledWith(
			'Refund approved',
			expect.objectContaining({ body: '₦20,000 returned' })
		);

		// Subsequent poll with same IDs does not duplicate OS tray notification
		await notifyUnreadStreamItems([newItem, oldItem], prefs);
		expect(showNotification).toHaveBeenCalledTimes(1);
	});
});
