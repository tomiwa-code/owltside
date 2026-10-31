import { describe, expect, it } from 'vitest';
import { extractApprovalAttachments } from '../src/lib/server/approvals';
import { isUserRecordBlocked, mapSupabaseEvent } from '../src/lib/server/supabase-data';
import { eventStatus, hasAdminEventEnded } from '../src/lib/utils/status';
import { auditFor, logAudit } from '../src/lib/server/store';

describe('Admin unredacted details & KYC document attachments', () => {
	it('extracts both front and back KYC image and PDF attachments with full dataUrls', () => {
		const attachments = extractApprovalAttachments({
			document: 'NIN Slip',
			fullReference: '90123456789',
			frontDocument: {
				name: 'nin-front.jpg',
				mimeType: 'image/jpeg',
				dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
			},
			backDocument: {
				name: 'nin-back.pdf',
				mimeType: 'application/pdf',
				dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK'
			}
		});

		expect(attachments).toHaveLength(2);
		expect(attachments[0]).toEqual({
			side: 'front',
			name: 'nin-front.jpg',
			mimeType: 'image/jpeg',
			dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
		});
		expect(attachments[1]).toEqual({
			side: 'back',
			name: 'nin-back.pdf',
			mimeType: 'application/pdf',
			dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK'
		});
	});

	it('maps event poster src, promos, gates, speakers, description, and organizer contact for admin review', () => {
		const mapped = mapSupabaseEvent(
			{
				id: '11111111-2222-4333-8444-555555555555',
				slug: 'midnight-rooftop',
				title: 'Midnight Rooftop',
				description: 'Private rooftop session in VI.',
				category: 'Nightlife',
				organizer_id: 'org-1',
				status: 'suspended',
				starts_at: '2026-12-20T21:00:00.000Z',
				ends_at: '2026-12-21T03:00:00.000Z',
				venue: 'Harbour Point',
				city: 'Lagos',
				cover: { from: '#111', to: '#333', icon: 'music', src: 'https://cdn.example.com/poster.jpg' },
				tiers: [{ name: 'VIP', price: 25000, capacity: 100, sold: 25, benefits: 'Fast-track gate' }],
				gates: [{ name: 'North Gate', staff: [{ name: 'Tunde' }, { name: 'Kemi' }] }],
				speakers: [{ name: 'DJ Spin', handle: 'djspin', role: 'Headliner', inviteStatus: 'accepted' }]
			},
			'Vibe Collective',
			{
				organizerHandle: 'vibecollective',
				organizerEmail: 'ops@vibecollective.ng',
				organizerPhone: '+2348012345678',
				promos: [{ code: 'VIP20', percent: 20, used: 4, maxUses: 50 }]
			}
		);

		expect(mapped.status).toBe('suspended');
		expect(mapped.coverSrc).toBe('https://cdn.example.com/poster.jpg');
		expect(mapped.description).toBe('Private rooftop session in VI.');
		expect(mapped.organizerEmail).toBe('ops@vibecollective.ng');
		expect(mapped.organizerPhone).toBe('+2348012345678');
		expect(mapped.promos).toEqual([{ code: 'VIP20', percent: 20, used: 4, maxUses: 50 }]);
		expect(mapped.gatesList).toEqual([{ name: 'North Gate', staffCount: 2 }]);
		expect(mapped.speakersList?.[0]?.inviteStatus).toBe('accepted');
	});

	it('transitions published events to completed (Closed) once their end date and time passes instead of staying published', () => {
		const row = {
			id: '22222222-3333-4444-8555-666666666666',
			slug: 'lagos-sound-weekender',
			title: 'Lagos Sound Weekender',
			category: 'music',
			organizer_id: 'org-2',
			status: 'published',
			starts_at: '2026-10-30T16:00:00+01:00',
			ends_at: '2026-10-30T22:30:00+01:00',
			venue: 'Landmark Beach',
			city: 'Lagos',
			tiers: [{ name: 'General', price: 15000, capacity: 200, sold: 180 }]
		};

		const beforeEnd = Date.parse('2026-10-30T22:29:59+01:00');
		const atEnd = Date.parse('2026-10-30T22:30:00+01:00');

		expect(hasAdminEventEnded(row.starts_at, row.ends_at, beforeEnd)).toBe(false);
		expect(mapSupabaseEvent(row, 'Organizer', { now: beforeEnd }).status).toBe('published');

		expect(hasAdminEventEnded(row.starts_at, row.ends_at, atEnd)).toBe(true);
		const closed = mapSupabaseEvent(row, 'Organizer', { now: atEnd });
		expect(closed.status).toBe('completed');
		expect(eventStatus(closed.status).label).toBe('Closed');

		// Legacy published events without ends_at close after their WAT event date passes
		const legacyRow = { ...row, ends_at: null };
		expect(
			mapSupabaseEvent(legacyRow, 'Organizer', {
				now: Date.parse('2026-10-30T23:00:00+01:00')
			}).status
		).toBe('published');
		expect(
			mapSupabaseEvent(legacyRow, 'Organizer', {
				now: Date.parse('2026-10-31T00:00:01+01:00')
			}).status
		).toBe('completed');

		// Suspended/rejected/pending/draft events keep their moderation state even if past
		expect(
			mapSupabaseEvent({ ...row, status: 'suspended' }, 'Organizer', { now: atEnd }).status
		).toBe('suspended');
		expect(
			mapSupabaseEvent({ ...row, status: 'pending' }, 'Organizer', { now: atEnd }).status
		).toBe('pending');
	});
});

describe('Admin user account disable/enable detection & audit trail', () => {
	it('detects disabled accounts across profiles.disabled, user_metadata.account_disabled, and future banned_until', () => {
		expect(isUserRecordBlocked({ disabled: false }, {})).toBe(false);
		expect(isUserRecordBlocked({ disabled: true }, {})).toBe(true);
		expect(isUserRecordBlocked({}, { user_metadata: { account_disabled: true } })).toBe(true);
		expect(
			isUserRecordBlocked({}, { banned_until: new Date(Date.now() + 3600_000).toISOString() })
		).toBe(true);
		expect(
			isUserRecordBlocked({}, { banned_until: new Date(Date.now() - 3600_000).toISOString() })
		).toBe(false);
	});

	it('records and retrieves entity-scoped audit entries for event deletion and user disablement', () => {
		logAudit({
			actor: 'Tomiwa A.',
			action: 'EVENT_DELETED',
			kind: 'event',
			entityId: 'evt-del-99',
			target: 'Fraudulent Concert (fraud-concert)',
			reason: 'Removed scam listing',
			severity: 'critical'
		});
		logAudit({
			actor: 'Tomiwa A.',
			action: 'USER_ACCOUNT_DISABLED',
			kind: 'user',
			entityId: 'usr-ban-42',
			target: 'Bad Actor (@badactor)',
			reason: 'Repeated scam listings',
			severity: 'critical'
		});

		const eventAudit = auditFor('evt-del-99');
		expect(eventAudit).toHaveLength(1);
		expect(eventAudit[0].action).toBe('EVENT_DELETED');

		const userAudit = auditFor('usr-ban-42');
		expect(userAudit).toHaveLength(1);
		expect(userAudit[0].action).toBe('USER_ACCOUNT_DISABLED');
	});
});
