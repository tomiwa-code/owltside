# Tiered ticket fees

Apply `supabase/sql/034_tiered_fee_engine.sql` and then
`supabase/sql/035_fee_checkout_integration.sql` after the existing database
schema/payment migrations (up through `033_payment_integrity.sql`). These are
idempotent migrations; `034` creates and seeds the editable fee configuration,
and `035` updates the server-side pending-order RPC while preserving its
inventory reservation and idempotency behavior.

All monetary values persisted by the fee engine are integer kobo; percentages
are basis points. The seeded defaults are:

| Tier | Price in kobo | Rate | Fixed | Cap |
| --- | ---: | ---: | ---: | ---: |
| Low | ₦0.01–₦1,999.99 | 400 bps | ₦100 | none |
| Mid | ₦2,000–₦15,000 | 600 bps | ₦100 | none |
| High | above ₦15,000 | 500 bps | ₦100 | ₦5,000 |

Payment processing is independently configured in `public.platform_settings`:
150 bps + ₦100, capped at ₦2,000 per ticket quote, free-ticket processing
₦0, and buyer-paid by default. Fee amounts and fee bearers are recomputed on
the server when an order is created; client quotes are display-only.

## Admin configuration

The Admin console's **Settings → Ticket fee rules** tab edits active price
ranges, bps, fixed fees, fee caps, processing rates/fixed/cap, free-ticket
processing and the processing fee bearer. Changes are written to the database
and take effect for new quotes/orders without deploying code. The API rule
management endpoints are also available under `/api/v1/fees/rules` (admin-only).

## Quote and preview endpoints

- `POST /api/v1/fees/quote` returns a per-ticket `unit` breakdown and quantity
  `totals`; optionally provide a real `eventId` so the event's persisted fee
  bearer is authoritative. `Idempotency-Key` deduplicates quote audit records.
- `GET /api/v1/fees/rules` lists the rules and processing settings for admins.
- `POST /api/v1/fees/rules` creates/updates a rule or updates
  `platformSettings`; `PATCH /api/v1/fees/rules/:id` updates a rule.
- `GET /api/v1/events/:id/fee-preview` returns an organizer's per-tier
  preview for their own event.

Every database-backed quote is appended to `public.fee_quote_audit`. Checkout
orders preserve the same fee breakdown in their audit record and retain the
existing order idempotency key.
