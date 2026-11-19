# Tiered ticket fees

Apply `supabase/sql/034_tiered_fee_engine.sql` and then
`supabase/sql/035_fee_checkout_integration.sql` after the existing database
schema/payment migrations (up through `033_payment_integrity.sql`), then
`supabase/sql/037_fee_quote_config.sql`. These are idempotent migrations; `034`
creates and seeds the editable fee configuration, `035` updates the
server-side pending-order RPC while preserving its inventory reservation and
idempotency behavior, and `037` adds the read-only
`public.fee_quote_config()` function the public quote endpoint uses when the
web deployment has no service-role key.

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

## How a quote survives a broken configuration

`POST /api/v1/fees/quote` is display-only — the amount that is actually charged
is computed inside `create_pending_order` — so it degrades instead of failing:

1. **Fee tables** through the service-role client (the normal path).
2. **`public.fee_quote_config()`** through the visitor's own client when the web
   deployment has no `SUPABASE_SERVICE_ROLE_KEY` (migration 037).
3. **The documented seed defaults** when neither can be read, so the page shows
   a real fee breakdown instead of “Unavailable”.

Every demotion is logged once, and an audit-insert failure is logged but never
turns a quote into an error. Reads are bounded (4 s for the tables, 2.5 s for
the RPC), so an unreachable database cannot stall an event page.

## If a live ticket shows “Service fee unavailable”

Check the **public web app's** runtime logs after loading an event (not the
admin app's logs):

- `Fee quote fell back to the seed fee configuration` — the quote still worked,
  but `reason` names the source that failed. This is the line that used to be a
  hard “Unavailable”.
- `Fee quote failed` — nothing could be quoted. The log distinguishes event
  lookup, calculation and (now non-fatal) audit errors.
- `Fee quote audit failed` — bookkeeping only; buyers are unaffected.

Fixes, by the `reason` in the log:

- `service-role client is not configured` — either add
  `SUPABASE_SERVICE_ROLE_KEY` (same project as `PUBLIC_SUPABASE_URL`) to the web
  deployment and redeploy, or apply migration 037 so the public RPC serves the
  configuration. Never paste keys into tickets or browser code.
- `fee_quote_config(): not deployed` — apply
  `supabase/sql/037_fee_quote_config.sql` (it only adds one read-only function;
  it does not touch data).
- For a missing relation or column, check the project in the Supabase SQL
  Editor: `select fee_bearer from public.events limit 1;`,
  `select count(*) from public.fee_rules where is_active;`, and
  `select id from public.platform_settings where id = 1;`. Older copies of
  `000_full_schema.sql` stopped at 033. If SQL succeeds but PostgREST reports a
  stale schema cache, run `NOTIFY pgrst, 'reload schema';`.
- `No active fee rule covers this ticket price` (a real 503) — the readable
  rules leave a gap at that price. Fix the ranges in **Settings → Ticket fee
  rules**; the checkout RPC rejects the same price, so this one must be fixed
  rather than hidden.
- For an audit write error, use its database code to distinguish missing
  privileges from a constraint failure; don't grant browser roles access to fee
  tables to make a quote work.
