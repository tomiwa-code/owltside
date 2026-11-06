# Owltside — remediation of the security & reliability audit

Companion to [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md). Every critical, high and
medium finding in that report is addressed below; each row names the change and
the test that now pins the behaviour down.

Verification at the time of writing:

| Check | Result |
| --- | --- |
| `npx svelte-check --threshold error` | 0 errors |
| `npx vitest run` | 60 files, 448 tests passing |
| `npm run build` | succeeds (adapter-vercel) |
| `supabase/sql/000_full_schema.sql` on a clean Postgres | applies without error |

---

## 1. The money path

### 1.1 Client-decided amounts and replayable references (critical)

`POST /checkout` no longer carries a price, a reference or an amount. The flow is
now:

1. **`create_pending_order(event_slug, items, promo, idempotency_key)`**
   (`supabase/sql/033_payment_integrity.sql`) locks the event row, reads the tier
   price **from `events.tiers`**, applies the promo (event table + `TECHCOMMUNITY`
   / `OWL10`), computes the platform fee (`5% + ₦100/pass`), reserves capacity by
   bumping `tiers[].sold`, and writes an `orders` row with `status='pending'`,
   `amount_kobo`, `currency`, `expires_at = now() + 20 min` and the idempotency
   key. Nothing about money comes from the request.
2. The browser is redirected to Paystack with **that** amount. There is no
   in-page popup and no client-supplied reference (`checkout/+page.server.ts`,
   `checkout/+page.svelte`).
3. `/checkout/success` reads **only** the reference, calls Paystack
   `GET /transaction/verify/:reference`, and passes the **gateway-reported**
   amount and currency to `confirm_paid_order`. A mismatch returns 402 and mints
   nothing. The client can no longer hand in a reference it did not pay for,
   because the reference must belong to its own pending order and must match the
   amount that was actually charged.
4. `POST /api/paystack/webhook` verifies the `x-paystack-signature` HMAC-SHA512
   against the raw body (`isValidPaystackSignature`, timing-safe) and calls
   `confirm_payment` with the service role. It is idempotent and does not depend
   on the buyer's browser at all.
5. `release_expired_orders()` returns unclaimed capacity after 20 minutes.

Guarantees enforced in the database (`033`, tested in
`tests/unit/payment-integrity-database.test.ts`):

- `create_order` — the old "mint tickets for free" RPC — is **dropped**.
- `confirm_payment` / `confirm_paid_order` consume a reference **once**; a repeat
  delivery returns the same tickets (`duplicate: true`) instead of minting again.
- An amount or currency mismatch records a failed payment, never a ticket.
- `mint_order_tickets` is idempotent per order and service-role only.
- Free and 100%-promo orders go through `claim_free_order`, which refuses any
  order with `amount_kobo > 0`.

Tests: `payment-integrity-database.test.ts` (15 cases), `paystack-webhook.test.ts`
(12 cases, including forged signature, mismatch, replay and the "return URL
cannot change the cart" case).

### 1.2 Payout amounts (critical)

`POST /api/approvals` no longer accepts an amount for a payout. The database
computes the payable balance in `event_payable_amount()` /
`guard_money_request()` and overwrites whatever the client sent. Demo mode uses
`payoutAmountFor()` from `$lib/utils/settlement` for parity.
Test: `approvals.test.ts` — the ₦308,000 the fixture sends is ignored.

### 1.3 Approval endpoints (high)

`GET`/`POST /api/approvals` now require a session (401 otherwise) and scrub
database/driver error text, passing through only human-readable guard messages.
Tests: `approvals.test.ts`, `verification-api.test.ts`.

---

## 2. Tickets, transfers and scanning

| Finding | Fix |
| --- | --- |
| Owners could rewrite status/price/code/event (`tickets_update_owner … with check (true)`) | All client `UPDATE`/`DELETE` policies are dropped and the table privileges **revoked**; a deny-all policy documents it. Every legitimate write goes through a `SECURITY DEFINER` function. Test: `ticket rows are immutable to the buyer`. |
| Non-atomic check-in (read-then-write) | `organizer_check_in_ticket` performs a conditional `UPDATE … WHERE status='valid'`; concurrent scanners get `verified` exactly once, everyone else `duplicate`. The app calls the RPC (`datasource.checkInTicket`). |
| Snapshot medallions / mutable handle | `transfer_ticket` matches on the exact `handle` (lower-cased, `@` stripped) — no display-name match, no `LIMIT 1` guess. Test: `transfers match on the exact handle`. |
| Client-side QR HMAC with bundled secret | `signTicketToken` / `parseTicketToken` (`src/lib/server/qr-sign.ts`) sign `code:window` with `QR_SIGNING_SECRET`; `/api/tickets/[id]/qr` mints a token only for the caller's own `valid` pass; the scanner rejects a signed token that does not verify instead of downgrading it to a bare code. Tests: `qr-sign.test.ts`. |

---

## 3. Scanner PINs and authorization

- `resolve_staff_scan_token`, `staff_check_in_ticket`, `staff_check_in_terminal`
  and `organizer_check_in_ticket` were rewritten to be ownership-checked and to
  consume a per-actor attempt from `scan_attempts` (`consume_scan_attempt`,
  fixed 10-minute bucket). 25 resolutions / 120 check-ins per window; exceeding
  it raises rather than silently failing open.
- Staff PIN hashes are now keyed with `STAFF_PIN_PEPPER` (`gateTokenHash`), so a
  leaked table of six-digit SHA-256 hashes cannot be reversed offline.
- `consume_scan_attempt` is executable by `service_role` only, so a client cannot
  reset its own counter.
- Banned/disabled accounts: the hook reads `profiles.disabled` as well as the
  GoTrue ban, and `guard_profile_protected_fields()` stops users from clearing
  `disabled`, `disabled_at`, `disabled_reason` or rewriting
  `username_changed_at`. Network access is cut for the banned session before any
  page renders.
- `operating_identity` now comes from the guarded database column first;
  `user_metadata` is only a seeding fallback, so it can no longer be used to
  claim an organizer session.

---

## 4. Data exposure and RLS

- `notifications` insert policy is `auth.uid() = user_id` (no more spoofed
  in-app alerts pointing at an attacker's `href`).
- `messages` insert requires the sender to be a participant of the conversation.
- `/api/conversations/[id]/messages` and `/api/push/subscribe` require a session.
- Profile self-service may change name/bio/city/link/interests/avatar; role,
  verification and account status are server-owned (`030`, `032`, `033`).
- Approval and payment errors no longer echo schema, constraint or driver text.

---

## 5. Web Push SSRF

`isAllowedPushEndpoint()` accepts only `https` endpoints on a fixed allowlist
(FCM, Mozilla, WNS, Apple, Yandex; extendable via `PUSH_ENDPOINT_ALLOWLIST`),
rejects credentials in the URL, bare IPs, `localhost`, `.local` and `.internal`.
It is applied when a subscription is stored **and** again before every send, so
pre-existing rows cannot be used to probe the network.

---

## 6. Transport, headers and abuse limits

`src/hooks.server.ts` now always sends:

- `Content-Security-Policy` (self, inline styles/script for the theme bootstrap,
  Supabase REST + websocket, `form-action 'self' https://checkout.paystack.com`,
  `object-src 'none'`, `frame-ancestors`), `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and in production `HSTS`
  + `X-Frame-Options: DENY`.
- A fixed-window rate limiter: scan 40/min, promo 30/min, auth POSTs 15/min,
  webhook 600/min, all `/api/*` 240/min, returning `429` with `Retry-After`.
- `init` refuses to boot a production deployment with no Supabase configuration
  and no explicit `DEMO_MODE=true`, and demo mode can no longer be enabled by a
  missing key.

Demo mode is now an explicit opt-in (`DEMO_MODE` / `PUBLIC_DEMO_MODE`, and only
when Supabase is unconfigured). `verifyTransaction` fails closed when no secret
is configured instead of returning `true`.

---

## 7. Schema hygiene

`supabase/sql/000_full_schema.sql` was missing migration **026** (account status
columns, `biometric_credentials`, `push_subscriptions`) even though later
migrations reference them — a fresh database built from that file could not have
matched production. It is now included, so the consolidated file reproduces the
numbered chain, and the payment-integrity test loads it end to end.

`npx vitest run tests/unit/payment-integrity-database.test.ts` therefore doubles
as a "does the whole schema apply" check.

---

## 8. Required environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` | production | app database |
| `SUPABASE_SERVICE_ROLE_KEY` | production | webhook settlement, admin reads |
| `PAYSTACK_SECRET_KEY` | production | transaction init + verification + webhook signature |
| `QR_SIGNING_SECRET` | production | rotating pass signatures |
| `STAFF_PIN_PEPPER` | production | keyed staff PIN hashes |
| `BIOMETRIC_SECRET` | production | passkey vault encryption |
| `PUSH_ENDPOINT_ALLOWLIST` | optional | extra trusted push hosts |
| `DEMO_MODE` | never in production | explicit sandbox opt-in |

## 9. Deploy checklist

1. Apply `supabase/sql/033_payment_integrity.sql` (or the consolidated
   `000_full_schema.sql` on a fresh project).
2. Set the environment variables above; remove `DEMO_MODE` from production.
3. Point the Paystack dashboard webhook at `/api/paystack/webhook`.
4. Deploy, then buy one test ticket: expect a pending order, a hosted Paystack
   page, a verified return, and exactly one ticket per pass — including after a
   refresh and after a duplicate webhook.

## 10. Residual risks (deliberately not changed)

- **Rate limiting is per instance** (`src/lib/server/rate-limit.ts`) on
  serverless. It blunts brute force and abuse but is not a global quota; the
  scan-attempt cap that protects PINs lives in Postgres and *is* global.
- **`getEventTickets` is unbounded** for organizer dashboards. It is no longer on
  the scan path (which now does a single indexed lookup); very large events still
  load one big ticket list. Payout maths moved into the database for this reason.
- **Correlated `EXISTS` policies** (26 of them) are correct but cost per row.
  Rewriting them to `security definer` helpers is a performance project of its
  own; the public feed is now paginated and filtered in SQL, which removes the
  most common full-table scans.
- **Poster images are stored as base64 `data:` URLs** in `events.cover`. It works
  and is validated, but it inflates row size; moving to Storage is a data
  migration rather than a security fix.
- **Demo mode still holds a public signing secret** for client-side QR previews;
  it is opt-in, refuses to activate when Supabase is configured, and the
  production scanner only trusts server-signed tokens.
