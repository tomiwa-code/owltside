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

For older installations, check the processing cap in **Settings → Ticket fee rules**.
The original SQL seed left it blank (uncapped). To use the documented ₦2,000
cap, enter `200000` kobo and save. Existing policies are never overwritten by
the seed.

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

## If a live ticket shows “Service fee unavailable”

Check the **public web app's** runtime logs for `Fee quote failed` after loading
an event (not the admin app's logs). A failed quote is not proof of a missing
migration. The log distinguishes event lookup, fee rules, processing policy,
calculation, and audit insert errors.

- For a missing client or invalid API key, confirm the web deployment's
  `PUBLIC_SUPABASE_URL` and private `SUPABASE_SERVICE_ROLE_KEY` (or
  `SUPABASE_SECRET_KEY`) belong to the same project. Redeploy after changing
  environment variables. Never paste keys into tickets or browser code.
- For a missing relation or column, check that project in Supabase SQL Editor:
  `select fee_bearer from public.events limit 1;`,
  `select count(*) from public.fee_rules where is_active;`, and
  `select id from public.platform_settings where id = 1;`. Older copies of
  `000_full_schema.sql` stopped at 033. If SQL succeeds but PostgREST reports
  a stale schema cache, run `NOTIFY pgrst, 'reload schema';`.
- For an uncovered price, check active price ranges in **Settings → Ticket
  fee rules**. For an audit write error, use its database code to distinguish
  missing privileges from a constraint failure; don't grant browser roles
  access to fee tables to make a quote work.
