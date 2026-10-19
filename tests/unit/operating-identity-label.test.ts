import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { operatingIdentityLabel, peerIdentityLabel } from '$lib/constants/operating-identity';
import { conversations } from '$lib/server/demo/seed';
import DesktopInboxList from '$components/DesktopInboxList.svelte';
import type { Conversation } from '$lib/types';

describe('operating identity labels under a chat peer name', () => {
	it('shows the operating identity the user chose', () => {
		expect(peerIdentityLabel({ handle: 'adaobi', operatingIdentity: 'attendee' })).toBe('Attendee');
		expect(peerIdentityLabel({ handle: 'adaobi', operatingIdentity: 'guest' })).toBe('Guest');
		expect(peerIdentityLabel({ handle: 'adaobi', operatingIdentity: 'organizer' })).toBe('Organizer');
	});

	it('never falls back to a made-up role like Speaker', () => {
		expect(peerIdentityLabel({ handle: 'adaobi' })).toBe('Attendee');
		expect(peerIdentityLabel({ handle: 'adaobi', operatingIdentity: null })).toBe('Attendee');
		expect(operatingIdentityLabel('admin')).toBe('Attendee');
		expect(operatingIdentityLabel(undefined)).toBe('Attendee');
	});

	it('keeps the Owltside system account as an event channel', () => {
		expect(peerIdentityLabel({ handle: 'owltside' })).toBe('Event channel');
		expect(peerIdentityLabel({ handle: 'owltside', operatingIdentity: 'organizer' })).toBe('Event channel');
	});

	it('demo conversation peers carry a chosen identity', () => {
		for (const conversation of conversations) {
			const label = peerIdentityLabel(conversation.peer);
			expect(label).not.toContain('Speaker');
			if (conversation.peer.handle !== 'owltside') {
				expect(conversation.peer.operatingIdentity).toBeDefined();
				expect(label).toBe(operatingIdentityLabel(conversation.peer.operatingIdentity));
			}
		}
	});

	it('renders the chosen identity instead of Speaker in the inbox list', () => {
		const items: Conversation[] = [
			{
				id: 'c1',
				peer: {
					id: 'u-dre',
					handle: 'dre',
					name: 'Dre',
					avatarColor: '#111111',
					operatingIdentity: 'organizer',
					followers: 0,
					following: 0
				},
				lastMessage: 'What would you like to know?',
				lastAt: new Date().toISOString(),
				unread: 0
			}
		];
		render(DesktopInboxList, { items });
		expect(screen.getByText('Organizer')).toBeInTheDocument();
		expect(screen.queryByText('Keynote Speaker')).not.toBeInTheDocument();
	});
});
