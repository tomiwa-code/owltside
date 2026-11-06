# Owltside — Security & Reliability Audit

**Scope:** public SvelteKit app (`/src`), admin control plane (`/admin`), Supabase schema & RLS (`/supabase/sql`), payment integration (Paystack), ticket issuance, gate scanning, payouts/refunds.

**Method:** full manual read of every server route, form action, API handler, `SECURITY DEFINER` function, RLS policy, trigger, and the payment/scan/settlement code paths. Findings below are confirmed against the code, not theoretical.

**Date:** 2026-11-06


<!-- Remediation status: every critical, high and medium finding below has been
     fixed in this branch. See SECURITY_REMEDIATION.md for the finding → fix map,
     the tests that pin each behaviour, and the deploy checklist. -->

---

## Executive summary

The product surface (UI, admin console, WebAuthn, image handling) is unusually well built for its stage, and the admin app in particular is hardened properly. **The money path is not.** The root problem is architectural:

> **The database — not the checkout — is the source of truth for "did this person pay", and the database has no concept of payment at all.**

`create_order` is a `SECURITY DEFINER` function granted to `authenticated`, accepts the buyer's ID as a parameter, never checks `auth.uid()`, and mints `status = 'paid'` orders and valid tickets without ever consulting Paystack. Because the Supabase anon key is public by design, any signed-in user can call it directly over `POST /rest/v1/rpc/create_order` and **mint unlimited free tickets for any published event**, bypassing the SvelteKit checkout entirely.

Everything else in the payment path compounds this: amount is chosen in the browser, verification ignores amount, references can be replayed, no webhook exists, and ticket rows are writable by their owner (which reaches tier, price, and check-in status).

### Severity roll-up

| # | Finding | Severity | Exploitable today |
|---|---------|----------|-------------------|
| 1 | `create_order` RPC mints free tickets (no payment check, trusts `p_owner`) | 🔴 **Critical** | Yes, trivially |
| 2 | Payment verification ignores amount & currency (client sets kobo) | 🔴 **Critical** | Yes |
| 3 | Payment reference can be replayed / reused → unlimited tickets from one payment | 🔴 **Critical** | Yes |
| 4 | `success` page mints a paid order on a **GET** (refresh/back/prefetch) | 🟠 High | Yes |
| 5 | No Paystack webhook & no reconciliation → no trusted revenue source | 🟠 High | Yes (silently) |
| 6 | Ticket owners can rewrite their own ticket (status/price/tier/event) | 🔴 **Critical** | Yes via PostgREST |
| 7 | Payout amount is client-supplied and unvalidated against real revenue | 🔴 **Critical** | Yes |
| 8 | 6-digit scanner PINs brute-forceable via direct RPC, no rate limit | 🟠 High | Yes |
| 9 | Check-in race condition allows double entry (non-atomic update) | 🟠 High | Yes, under load |
| 10 | Banned users can clear `profiles.disabled` on themselves | 🟠 High | Yes |
| 11 | Blind SSRF through user-supplied Web Push `endpoint` | 🟠 High | Yes |
| 12 | Ticket transfer matches on mutable display **name**, not handle | 🟠 High | Yes |
| 13 | "HMAC anti-clone" QR is client-side with a hard-coded public secret | 🟠 High (integrity claim) | N/A |
| 14 | Demo mode is a full auth bypass if Supabase env vars are missing | 🟠 High (deploy risk) | Conditionally |
| 15 | No rate limiting anywhere in the public app | 🟡 Medium | Yes |
| 16 | Missing security headers/CSP on the public app | 🟡 Medium | Yes |
| 17 | `notifications` insert open to any authenticated user (phishing) | 🟡 Medium | Yes |
| 18 | Message insert policy (002) lacks participation check (IDOR) | 🟡 Medium | Depends on migration path |
| 19 | Weak HMAC secret fallbacks (biometric & QR) | 🟡 Medium | Partially |
| 20 | Reference collisions & unbounded queries will break under load | 🟡 Medium | Yes at scale |

**Top-line answers:** APIs are **not** protected at the data layer (only at the SvelteKit layer, which is bypassable); SQL injection is **not** a meaningful risk here (no raw SQL, all access is via the parameterised PostgREST client) but **authorization injection** is; the platform **will not scale** past a modestly busy event; and payments have **no idempotency, no replay protection, and no amount binding** — double-debit and double-mint are both possible.

---

## 1. Exploitable features / structure

### 1.1 🔴 CRITICAL — Free tickets via the `create_order` RPC

**Where:** `supabase/sql/003_functions.sql:75`, `supabase/sql/020_event_promos.sql:120`, consolidated `supabase/sql/000_full_schema.sql:620`; granted at `000_full_schema.sql:775` / `020:280`.

```sql
create or replace function public.create_order(
  p_owner uuid, p_event_slug text, p_items jsonb, p_promo_code text default null
) returns jsonb language plpgsql
security definer set search_path = public
...
  select * into v_event from public.events where slug = p_event_slug for update;
  ...
  insert into public.orders (owner_id, event_id, reference, total, status, ...)
  values (p_owner, v_event.id, v_reference, v_total, 'paid', ...)   -- always 'paid'
...
grant execute on function public.create_order(uuid, text, jsonb, text) to authenticated;
```

Three independent defects in one function:

1. **No payment linkage.** Nothing verifies that a Paystack transaction exists for this order. The RPC is the minting authority and its only precondition is "event is published and has capacity".
2. **No caller binding.** `p_owner` is a parameter. The function never compares it to `auth.uid()`, so a caller can mint into *any* account (ticket spam, framing, poisoning organizer revenue).
3. **No quantity cap.** The SvelteKit action clamps `qty` to 1–6; the RPC accepts any integer, so a scalper can take the whole tier in one call.

**Exploit (no tooling beyond the browser console):**

```js
// 1. Sign in normally to get a user JWT.
// 2. Call the database directly with the public anon key:
await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_order`, {
  method: 'POST',
  headers: {
    apikey: PUBLIC_ANON_KEY,
    Authorization: `Bearer ${userJwt}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    p_owner: myUserId,
    p_event_slug: 'any-published-event',
    p_items: [{ tierId: 'tier-vip', qty: 6 }],
    p_promo_code: null
  })
});
// → valid VIP tickets in the wallet, order marked 'paid', zero naira spent.
```

**Fix (required):**
- Remove `p_owner` from the client contract entirely. Derive the owner from `auth.uid()` inside the function and `raise` if null.
- Do **not** let the RPC mark orders paid. Split into `request_order(...)` (writes `pending`, reserves capacity) and a server-only `fulfil_order(order_id, paystack_reference, amount_kobo)`.
- `revoke execute ... from authenticated, anon` on the fulfilment function; call it only from a server context using a service credential or a webhook handler.
- Keep the existing `for update` lock (good), add a per-user/per-event purchase cap in SQL.

### 1.2 🔴 CRITICAL — Owners can rewrite their own ticket

**Where:** `supabase/sql/002_rls.sql:29` and `000_full_schema.sql:427-429`.

```sql
create policy tickets_update_owner on public.tickets for update
  using (auth.uid() = owner_id) with check (true);
```

`with check (true)` plus a broad `using` allows the owner to update **every column** of their own ticket: `status`, `price`, `tier_name`, `event_id`, `holder_name`, `code`.

Attack chains:
- **Tier upgrade:** buy the ₦2,000 regular pass, `PATCH /rest/v1/tickets?id=eq.<id>` with `{"tier_name":"VIP Table"}`. The gate scanner validates only `event_id` + `code` + `status` (`datasource.ts:2171`), never tier against price — VIP access for ₦2,000.
- **Refund fraud:** set `price` to `1000000`, then request a refund. `requestTicketRefund` uses `ticket.price` for the approval amount, so the admin queue shows a ₦1,000,000 refund for a ₦2,000 ticket.
- **Double entry:** attended already? Set `status` back to `'valid'` and re-enter (or hand the pass to someone else).
- **Refund + attend:** request a refund, attend, and the pass is only flipped to `refunded` on admin approval — but the owner can flip it back to `valid` afterwards.

**Fix:** there is no legitimate reason for a buyer to UPDATE their own ticket. Replace the policy with:
- `for update using (auth.uid() = owner_id)` **plus** column-level grants: `grant update (holder_name) on public.tickets to authenticated;` — or better, no update policy at all and route transfers through the existing `transfer_ticket` RPC (which is `SECURITY DEFINER` and correct).
- Add a trigger mirroring `guard_profile_role` that rejects client-side changes to `status`, `price`, `tier_name`, `event_id`, `code` unless `auth.role() = 'service_role'`.

### 1.3 🟠 HIGH — 6-digit scanner PINs are brute-forceable, and the RPCs ignore the app-layer gate

**Where:** `supabase/sql/019_shared_staff_scanner.sql:104,214,313`; PIN generation `datasource.ts:512,1607`.

`resolve_staff_scan_token`, `staff_check_in_ticket`, and `staff_check_in_terminal` are granted to `authenticated`. They check only `auth.uid() is not null` — the actual gate (`hasOrganizerIdentity`) lives in the SvelteKit route (`/api/scan`, `/api/scan/authorize`), which is irrelevant because the attacker calls PostgREST directly.

- PIN space = 1,000,000, stored as unsalted `sha256(digits)` (`gateTokenHash`), valid for 6 hours.
- No throttle, no attempt counter, no lockout anywhere in the public app.
- At a few hundred requests/second an attacker enumerates the active space in roughly an hour, finding every live gate/terminal PIN for every event.

Consequences: mark valid tickets as `used` (deny entry to real holders = mass DoS at the gate), harvest `eventId`/`organizerId`, and feed bogus check-in records.

**Fix:** move scanner operations behind the server (remove `authenticated` grants), add a `checkin_attempts` table with per-user and per-PIN-hash counters enforced *inside* the RPC, extend PINs to 8+ digits (or an alphanumeric token), and store an HMAC with a server-side pepper instead of a bare SHA-256.

### 1.4 🟠 HIGH — Banned users can un-ban themselves

**Where:** `supabase/sql/002_rls.sql:15` (`profiles_update using (auth.uid() = id)`), ban enforcement `src/hooks.server.ts:33`.

`role` and `verified` are protected by triggers (`032`, `030`) — good. `disabled`, `disabled_reason`, `disabled_at`, and `username_changed_at` are **not**. A user with a live JWT can `PATCH /rest/v1/profiles?id=eq.<uid>` → `{"disabled": false}` and walk straight back through the ban check. They can also null `username_changed_at` to bypass the 30-day username cooldown.

**Fix:** extend `guard_profile_verification` into a single `guard_profile_protected_columns` trigger covering `disabled`, `disabled_at`, `disabled_reason`, `verified`, `role`, `followers`, `following`, `username_changed_at`.

### 1.5 🟠 HIGH — Blind SSRF via Web Push subscriptions

**Where:** `src/routes/api/push/subscribe/+server.ts:34`, `src/lib/server/webpush.ts:278`.

```ts
const response = await fetch(sub.endpoint, { method: 'POST', ... });  // endpoint is user-controlled
```

`endpoint` is accepted as any string, stored in `push_subscriptions`, and later POSTed by the server with a VAPID `Authorization` header. No scheme/host allowlist, no private-IP block, no port restriction.

Impact: internal network probing and POST-based SSRF against services reachable from the server (cloud metadata, admin panels on localhost, internal APIs); also a latency/DoS lever by pointing at black-holed addresses. Delivery is triggered whenever the attacker receives a message or notification, which they fully control.

**Fix:** require `https:`, allowlist the known push hosts (`*.googleapis.com`, `*.mozilla.com`, `*.push.apple.com`, `*.windows.com`), resolve DNS and reject private/link-local/loopback ranges, set a 5s timeout and `redirect: 'manual'`.

### 1.6 🟠 HIGH — Ticket transfer resolves recipients by mutable display name

**Where:** `supabase/sql/013_ticket_transfer.sql:25-30`.

```sql
select * into v_recipient from public.profiles
where lower(handle) = v_cleaned or lower(name) = v_cleaned limit 1;
```

`profiles.name` is user-editable. An attacker sets their name to `adaobi` (the intended recipient's handle) and, because the query is `handle OR name ... LIMIT 1` with no ordering, can win the match and receive tickets meant for someone else. Accidentally identical names produce the same silent misdelivery.

**Fix:** match on `handle` only; require exact, case-sensitive-after-lowering handle equality; drop the name match entirely (or make it an explicit "did you mean" step in the UI).

### 1.7 🟠 HIGH — The "tamper-evident HMAC" QR pass is decorative

**Where:** `src/lib/utils/qr.ts:11` (`DEMO_QR_SECRET`), `src/lib/components/QrPass.svelte:21`, `QR_SIGNING_SECRET` in `.env.example` (never read anywhere).

The QR is signed **in the browser** with a hard-coded constant that ships in the JS bundle. The server never verifies the signature — `/api/scan` accepts a plain `code` string and checks only `event_id`/`code`/`status`. So:

- The advertised 30-second rotation, "anti-clone", and "zero scalping" properties (marketing copy in `DesktopHomeFeed.svelte:390`, `events/[slug]/+page.svelte:628`) do not exist as security controls.
- Any code that leaks (screenshot of a *code*, support tickets, logs, an organizer export) can be turned into a valid-looking pass by anyone.
- `QR_SIGNING_SECRET` gives a false sense of configuration.

**Fix:** either implement it for real (sign server-side, verify in `/api/scan`, bind signature to ticket id + event + window, and reject unsigned codes) or remove the claim. Treat the ticket `code` as a bearer secret and rotate it on transfer (already done) and on check-in.

### 1.8 🟠 HIGH — Demo mode is a production auth bypass waiting for a typo

**Where:** `src/hooks.server.ts:9,103`; `src/routes/auth/verify/+page.server.ts:74-79`.

```ts
event.locals.demoMode = !supabaseConfigured();           // no NODE_ENV guard
} else if (event.cookies.get('owltside_demo_session')) { // presence == authenticated
```

In demo mode *any* 6-digit code is accepted and a plain cookie is set; the cookie is then trusted by simple presence. Anyone can send `Cookie: owltside_demo_session=1` with `curl` and be "signed in" as the demo user. If a production deploy is missing `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` (a very common first-deploy failure), the app silently runs a permissive demo, and `paystackSecretConfigured()` being false means **every payment verifies as successful** (`paystack.ts:68` returns `true`).

**Fix:** gate demo mode on an explicit `DEMO_MODE=true` **and** `NODE_ENV !== 'production'`; fail the boot if `NODE_ENV=production` and Supabase is unconfigured. In `verifyTransaction`, return `false` (fail closed) when no secret is configured outside demo.

### 1.9 🟡 MEDIUM — Notification injection → in-app phishing

**Where:** `supabase/sql/002_rls.sql:61` / `000_full_schema.sql:508`.

```sql
create policy notifications_insert_authenticated on public.notifications
  for insert with check (auth.uid() is not null);
```

Any authenticated user can insert a notification **for any other user**, including the `href` field. A crafted row can render a trusted-looking in-app alert routing to an attacker-controlled path (and, with a permissive CSP, to an external page). Open-redirect-free `safeAuthNext` does not help here.

**Fix:** restrict inserts to `auth.uid() = user_id` only; all cross-user notifications already come from `SECURITY DEFINER` triggers, which bypass RLS.

### 1.10 🟡 MEDIUM — Weak/default HMAC secrets

**Where:** `src/lib/server/webauthn.ts:31-39`.

```ts
privateEnv.BIOMETRIC_SECRET || privateEnv.SUPABASE_JWT_SECRET ||
publicEnv.PUBLIC_SUPABASE_ANON_KEY || 'owltside-biometric-webauthn-secret-key-v1'
```

Falling back to a **public** value or a hard-coded constant means challenge tokens are forgeable on any deployment that did not set `BIOMETRIC_SECRET`. The real signature check still protects authentication, but the defence-in-depth layer is gone, and any future use of the challenge token as an authenticator breaks. `QR_SIGNING_SECRET=dev-only-change-me` has the same shape.

**Fix:** require these secrets in production; throw on boot if absent (the admin app already does exactly this in `admin/src/hooks.server.ts:init`).

---

## 2. Fraud & abuse

### 2.1 🔴 CRITICAL — No payment↔ticket binding, so "revenue" is fiction

The only place payment status is checked is the SvelteKit action. The database will happily create `status='paid'`, `total=<tier price>` orders. Revenue displays are computed from `events.tiers.sold × tiers.price` (`src/lib/utils/settlement.ts`) — both organizer-writable through the `events_write` policy. There is no ledger row for "money actually received".

**Consequence:** an organizer can raise the price in `tiers` after selling out and inflate their settlement; a buyer can create paid orders without paying; and no figure in the admin console can be tied back to a bank settlement. Payouts (`admin/src/lib/server/supabase-data.ts:1078` — *"Without a real payout rail we approximate disbursed…"*) are therefore paid against unverifiable numbers.

**Fix:** introduce an append-only `payments` table populated **only** by the Paystack webhook, keyed by reference, storing `amount_kobo`, `currency`, `status`, `paid_at`, `gateway_response`. Derive all revenue/settlement from `payments ⨝ order_items`, never from `tiers`. Make `tiers.price` immutable once the first ticket is sold (trigger).

### 2.2 🔴 CRITICAL — Payout amount is attacker-chosen

**Where:** `src/routes/api/approvals/+server.ts` (payout branch) — `const amount = Number(body.amount)`; RLS `023:62` allows any authenticated insert with `status='pending'`.

Nothing reconciles the requested amount with sales. Because approval rows can also be inserted directly via PostgREST (bypassing the API's payload builder), the amount and payload are entirely arbitrary. The admin queue simply displays `Payout value: ₦<client number>` (`admin/src/lib/server/approvals.ts:97`).

**Fix:** compute the payout amount **server-side** from settled payments at decision time and ignore any client-supplied amount (or reject if it exceeds the computed payable). Show the server-computed figure and the computed delta in the admin UI. Require a second approver above a threshold.

### 2.3 🔴 CRITICAL — Refund amount follows a mutable field

`apply_approved_refund` (`023:93`) flips the ticket to `refunded`, which is correct, but the amount presented to the approver comes from `ticket.price` — writable by the ticket owner (see 1.2). Refunds are also never executed against the gateway, so there is no automatic reversal and no idempotency on the money movement.

**Fix:** store `paid_amount_kobo` from the verified payment record and refund against that; call the Paystack refund API server-side with the reference as the idempotency key.

### 2.4 🟠 HIGH — Free-ticket minting distorts organizer payouts

Any attacker can inflate an event's `attendees` and `sold` counters via `create_order`, which (a) denies real buyers capacity, (b) creates fake revenue claims for the organizer's settlement, and (c) spams the organizer's notification stream. This is denial-of-inventory for a hot event — a competitor or a scalper can simply zero out the remaining stock.

### 2.5 🟠 HIGH — No fraud signal on the free-money paths

There is no velocity limit on: account creation, ticket purchases, transfers, refund requests, payout requests, content reports, or scanner PIN attempts. Combined with `notifications_insert_authenticated` and the SSRF endpoint, an attacker can run all of these at machine speed.

---

## 3. Are the APIs protected?

**Short answer: at the app layer yes, at the data layer no — and the data layer is publicly reachable.**

Two trust boundaries exist, and only one is guarded:

```
Browser ──► SvelteKit actions/API (guarded: session checks, zod, rate limits: none)
   │
   └────► Supabase PostgREST + RPC (public anon key, user JWT)  ← the real boundary
```

Because the anon key ships to the browser, every table and every `authenticated`-granted function is a public API. The audit found app-layer checks that have **no** equivalent at the DB layer:

| App-layer control | DB-layer equivalent | Bypass |
|---|---|---|
| `checkout` action calls `verifyTransaction` | none | `create_order` RPC |
| `hasOrganizerIdentity` on `/api/scan` | only `auth.uid() is not null` | `staff_check_in_*` RPCs |
| session must exist for `/api/approvals` POST | RLS checks requester only | direct insert |
| refund/transfer initiated by owner | RLS `with check (true)` | direct update |

**What is done well:**
- RLS is **enabled** on all sensitive tables and defaults to deny.
- `approval_requests` cannot be updated or self-approved by clients (`023:66`).
- Role/verification escalation is blocked by `guard_profile_role` / `guard_profile_verification` triggers — these are genuinely good and show the right pattern.
- Event publishing is admin-only via `guard_event_moderation`.
- Account deletion (`024`) derives the user from `auth.uid()` correctly.
- Admin console: signed HMAC session, `timingSafeEqual`, role re-checked from the DB on every request, per-route `requireMutation/requireConfigure/requireSuper`, fail-closed `ADMIN_SESSION_SECRET` in production, security headers, no-store on API. This is the correct architecture and should be the model for the public app.

**Unprotected / weakly protected endpoints in the public app:**
- `GET /api/approvals` and `POST /api/approvals` — no explicit auth check (`locals.session?.userId ?? 'demo'`); relies entirely on RLS. Should 401 explicitly.
- `GET /api/conversations/[id]/messages` — no session check at all; relies on RLS.
- `GET /api/conversations`, `/api/events/[slug]/promo` — unauthenticated by design; promo endpoint permits unlimited code guessing (no rate limit), a discount-code oracle.
- All form actions identify guests as `'demo'`/`'u-ada'`; in demo mode that is a shared identity across all visitors.

**Recommendation:** treat PostgREST as an untrusted internet-facing API. Every capability must be enforced in SQL (RLS + `SECURITY DEFINER` input validation + grant hygiene), and the SvelteKit layer should be treated as a convenience layer only. Concretely: revoke `execute` on `create_order`, `resolve_staff_scan_token`, `staff_check_in_ticket`, `staff_check_in_terminal` from `authenticated` and expose them only through server routes using a service credential with its own authorization checks.

---

## 4. SQL injection & other injection classes

**SQL injection: essentially not exploitable.** There is no raw SQL in the TypeScript codebase (no template-built queries, no stored-procedure string concatenation driven by user input), and every query goes through `@supabase/supabase-js`, which parameterises via PostgREST. Inside PL/pgSQL, all inputs are bound variables (`p_*`), and `raise exception` messages use static text. The only dynamic identifiers are JSON keys and static column names.

**Injection classes that *are* real:**

| Class | Location | Note |
|---|---|---|
| **Authorization injection / IDOR** | `create_order.p_owner`, `staff_check_in_terminal.p_organizer_id`, ticket `UPDATE` policy | Identity is a client parameter |
| **Parameter tampering** | `checkout` → `tier`, `qty`, `promo`, `paystackReference`; `success` → `slug`, `tier`, `qty`, `ref` | Server trusts the callback URL |
| **Amount tampering** | `checkout/+page.svelte:132` sends `amount` to Paystack from the browser | See §7 |
| **Blind SSRF** | `push_subscriptions.endpoint` | See 1.5 |
| **Stored payload abuse** | `approval_requests.payload` accepts ~7.5 MB base64 docs (`MAX_DOC_URL_LENGTH`) | Storage exhaustion; no MIME sniff on the *approval* path (the poster path is correctly re-encoded with `sharp`) |
| **Prompt/markup injection into notifications** | `notifications` insert open to all authenticated users | See 1.9 |

**XSS:** no `{@html}` anywhere in `src` or `admin/src`; Svelte escapes by default. SvelteKit's default `csrf.checkOrigin` is in force (not overridden). `safeAuthNext`/`safeAdminNext` correctly reject `//`, `/\`, control characters, absolute URLs and `/auth/` targets — no open redirect. The residual XSS risk is content-driven (user bios/messages rendered as text, so low) and structural (no CSP to catch a future mistake).

**Path traversal / file upload:** poster upload decodes and re-encodes with `sharp` (`limitInputPixels` 40 MP, `failOn: 'warning'`, format re-check, size caps) — this is a good implementation.

---

## 5. Potential risks, flaws and system failures

1. **Reference collision on checkout (deterministic, will happen under load).** `create_order` builds `reference := 'OWT-' || extract(epoch from now())::bigint` (`020:139`). Epoch has **second** resolution and `orders.reference` is `UNIQUE`. Two orders in the same second → `duplicate key value violates unique constraint` → 500. Worse, the RPC inserts one `orders` row **per item inside the loop** using the same reference, so any multi-item order fails outright. A buyer can be charged with no ticket.
2. **Check-in race → double entry.** `datasource.ts:2171-2204` does `SELECT` → check `status` → `UPDATE ... eq('id')` with no `for update` and no conditional guard. Two scans (two gates, or a scanner retry) can both read `valid` and both return `verified`. The staff-token path is correct (`019` uses `for update`) — the organizer's own-gate path is not.
3. **No webhook → orphaned payments.** If the buyer closes the browser after a successful charge, no ticket is ever issued and no record of the payment exists. Refunds cannot be automated. Disputes are unresolvable from the platform side.
4. **Serverless + in-memory state.** The demo store, push subscriptions, and the admin login rate limiter all live in module scope (`datasource.ts` demo maps, `webpush.ts:29`, `admin/src/lib/server/auth.ts:202`). On Vercel these are per-instance: mutations vanish, rate limits reset on every cold start / scale-out, and admin lockout is per-lambda — effectively not a control.
5. **`cache-control` on authenticated data.** `private, max-age=5` on `/api/organizer` and `max-age=10` on `/api/tickets` are private-cache directives, so acceptable, but any shared proxy that ignores `private` would leak.
6. **Unbounded payload storage.** Verification documents are stored as base64 data URLs in `approval_requests.payload` (up to ~7.5 MB × 2 per submission). Postgres TOAST + replication + admin list queries all pay for this; there is no cleanup for rejected submissions.
7. **Error surfaces.** Several routes surface raw upstream messages to clients (e.g. `error: error.message` from Supabase in auth and approval routes), which can disclose schema/constraint names and RLS internals.
8. **Trust in `user_metadata`.** `event.locals.session.role` is derived from the user-editable `raw_user_meta_data.operating_identity` (`hooks.server.ts:14`), and `hasOrganizerIdentity` reads it. Any user can call `auth.updateUser({ data: { operating_identity: 'organizer' } })` and pass the organizer gate (the DB still scopes what they can actually do, so impact is limited — but it is an authorization decision made on attacker-controlled data).
9. **Demo/`'demo'` identity fallbacks.** Many routes compute `locals.session?.userId ?? 'demo'`. This pattern is one refactor away from a production IDOR; unauthenticated requests should 401 rather than inherit a shared identity.
10. **Missing headers on the public app** (see 1.9 / §6): no `X-Frame-Options`/`frame-ancestors`, no CSP, no `X-Content-Type-Options`, no HSTS. Clickjacking is practical against checkout, ticket transfer, refund confirmation, and account deletion. The admin app sets all of these — copy `admin/src/hooks.server.ts:decorate` into the public hooks.

---

## 6. Can it scale?

**Not to a busy event, in its current shape.** The design is fine for hundreds of concurrent users and falls apart at tens of thousands of attendees or a hot on-sale.

**Hard ceilings, in order of severity:**

1. **`getEventTickets` loads every ticket for an event** (`datasource.ts:2149`, no `limit`, no filter). The standalone terminal path then loops **all of the organizer's events** and fetches their full ticket lists to find one code (`/api/scan/+server.ts`, terminal branch). At a 20,000-person event with 4 gates scanning 5/s each, that is ~400,000 rows/second pulled out of Postgres to compare strings in JS. This alone makes the gate unusable at scale. → Replace with an indexed point lookup by `code` and a single RPC; never fetch a list to answer a scan.
2. **`create_order` serialises every purchase of an event on one row lock** (`for update` on `events`). Throughput for a single event becomes the throughput of one row's lock — roughly tens of transactions/second at best. A popular on-sale will queue, time out, and produce exactly the reference collisions above. → Move inventory to a `ticket_tiers` table and reserve with `UPDATE ticket_tiers SET sold = sold + $qty WHERE id = $id AND sold + $qty <= capacity RETURNING ...` (no event-wide lock), or use `SELECT ... FOR UPDATE SKIP LOCKED` on per-tier rows.
3. **`listEvents` fetches the entire published catalogue** with an organizer join on every request, then filters and sorts **in JavaScript** (`datasource.ts:1736`). No `limit`, no pagination, no server-side sort. Home, Explore, and `/api/events` all pay this cost on every hit; the API has `cache-control: public` but no CDN/cache layer is configured. → Push filters and pagination into SQL, add `limit`/`range`, add `(status, starts_at)` and category indexes, and put a real cache (CDN/`s-maxage`) in front of `/api/events`.
4. **RLS policies with correlated `EXISTS` subqueries** (26 of them in `000_full_schema.sql`) run per row. On multi-row reads of `tickets`, `orders`, `order_items`, `event_promos` and `checkins` this multiplies cost. Several policies re-check `events.organizer_id = auth.uid()` per row. → Denormalise the check (e.g. store `organizer_id` on `tickets`), or precompute via `auth.jwt()` claims; ensure supporting indexes exist.
5. **Unbounded admin queries.** `getEventOrders`, `getEventCheckins`, admin user/order/ticket lists (see `admin/src/lib/server/supabase-data.ts`) all `select *` with no paging. The admin console degrades to unusable at a few hundred thousand rows.
6. **No rate limiting on the public app.** Combined with (3), a trivial `GET /api/events` loop is a cheap denial of service; `POST /api/events/[slug]/promo` is a cheap discount-oracle.
7. **Real-time fan-out.** `004_realtime.sql` plus per-user channel subscriptions scale with connected clients on Supabase's side; no cap or backoff is enforced client-side.
8. **`sharp` re-encode on the request path** (CPU-heavy, 40 MP allowance) — fine at low volume, a cold-start/CPU-budget problem on serverless under upload bursts.
9. **No read replicas / pooler configuration, no queue for notifications/push.** Push is awaited inline with a 1.5 s `Promise.race` inside the message action (`inbox/[id]/+page.server.ts`), adding tail latency to every DM.

---

## 7. Payment stability: double debit and transaction integrity

**There is no idempotency, no replay protection, and no amount binding. All three failure modes are live.**

### 7.1 🔴 Amount is chosen by the client

`checkout/+page.svelte:123-134` builds the Paystack Inline call:

```ts
const reference = `OWT-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
inline.openIframe({ key, amount: Math.round(total * 100), email, ref: reference, ... });
```

`total` is browser state. The server verifies only that some transaction succeeded:

```ts
// src/lib/server/paystack.ts:66
const json = await res.json();
return json.status === true && json.data?.status === 'success';   // amount never inspected
```

So a buyer can set `amount: 100` (₦1) in devtools, complete the payment, and the server mints the full order computed from the tier price (`checkout/+page.server.ts:88-100`). **Underpayment is a one-line devtools change.**

### 7.2 🔴 References can be replayed

Neither `checkout` nor `success` records the reference before minting. Submitting the same successful reference N times creates N paid orders with N sets of tickets — infinite reuse of one payment. Combined with the `create_order` RPC (§1.1) the payment step is optional anyway.

### 7.3 🔴 `GET /checkout/success` mutates state

`src/routes/(app)/checkout/success/+page.server.ts:9-45` runs in a **load function**: it verifies the reference and calls `createOrder`. Consequences:
- page refresh, back-button, or `data-sveltekit-preload-data="hover"` (`app.html`) can each mint a new order;
- the callback URL carries `slug`, `tier`, `promo` and `qty` in clear text, and those are trusted — pay for 1 cheap ticket, edit the URL to `qty=6&tier=vip`, and the order mints at the expensive tier (amount was never checked);
- no "already fulfilled" guard means a support engineer telling a user to "reload the success page" creates duplicates.

### 7.4 🟠 Double debit on retry

`initializeTransaction` is called fresh on every POST with a new random reference. A double-click, an impatient retry, or a flaky network gives the buyer **two open Paystack transactions for the same cart** — both chargeable, neither linked to the other. There is no `pending` order row (and thus no way) to detect that a payment for this cart already exists.

### 7.5 🟠 Charged but not ticketed

The app generates a reference, redirects to Paystack, and only learns the outcome from the browser redirect. If the redirect is lost, the money is taken and no order exists. There is no webhook fallback and nothing to reconcile against later.

### 7.6 🟠 Reference collisions

See §5.1 — same-second collisions and multi-item orders hit `orders.reference UNIQUE` and roll back *after* the charge.

### 7.7 What is correct

- Amount is sent in kobo (`toKobo`), currency pinned to `NGN`.
- Totals are recomputed server-side for the hosted flow (base + 5% + ₦100/ticket − promo).
- Promo redemption is atomic and capped (`event_promos` `for update`, `uses_count < max_uses`).
- Capacity is checked and locked inside `create_order` (`for update`) — no oversell under concurrency.
- The secret key never reaches the client; verification is server-side only.

### 7.8 Reference design for a safe payment flow

1. **Order first, pay second.** `POST /checkout` creates an `orders` row with `status='pending'`, `amount_kobo`, `currency`, `owner_id`, `event_id`, and a **server-generated** reference (UUIDv4/ULID, `UNIQUE`). Refuse to create a second pending order for the same cart idempotency key.
2. **Bind amount at initialization.** `initializeTransaction` uses the stored `amount_kobo` from the pending order — never a number from the request.
3. **Fulfil only in the webhook.** `POST /api/paystack/webhook`, verifying `x-paystack-signature` = HMAC-SHA512(rawBody, secret) with `timingSafeEqual`, then:
   - look up the order by reference **for update**;
   - if `status='paid'` → return 200 (idempotent no-op);
   - assert `data.amount === order.amount_kobo` and `data.currency === order.currency`, else flag and alert;
   - mark paid and call the server-only `fulfil_order` (which also checks `auth.uid` is not needed because it's service-scoped);
   - store the raw event in `payments` for audit/reconciliation.
4. **The success page becomes read-only.** It should poll/read the order status and say "payment received", never create anything.
5. **Idempotency keys** on every mutating money endpoint (`Idempotency-Key` header stored per user), and a `payment_attempts` table keyed by `(order_id, reference)` with a unique constraint so a reference can only ever be consumed once.
6. **Refunds via the gateway** with the reference as the idempotency key, recording the gateway refund id; never refund from a mutable `tickets.price`.
7. **Kill the client-side amount path** — remove the Paystack Inline `amount` parameter, or verify it against the pending order before minting.

---

## Prioritised remediation plan

**Ship-blockers (do before taking another naira):**
1. Revoke `execute` on `create_order` from `authenticated`; derive owner from `auth.uid()`; split into request/fulfil and gate fulfilment behind a verified payment (§1.1, §7.8).
2. Verify `amount`/`currency` against a server-stored order in `verifyTransaction` (§7.1).
3. Add reference uniqueness/consumption tracking; reject reused references (§7.2).
4. Turn `/checkout/success` into a read-only status page; never mint on GET (§7.3).
5. Add the Paystack webhook with signature verification (§7.4-7.5).
6. Replace `tickets_update_owner ... with check (true)` with column-level grants or no update policy (§1.2).
7. Compute payout/refund amounts server-side from verified payments (§2.2-2.3).

**High (this sprint):**
8. Revoke `authenticated` on the three `staff_check_*`/`resolve_staff_scan_token` RPCs; add attempt throttling inside the DB; lengthen the PIN space (§1.3).
9. Make check-in atomic — `UPDATE tickets SET status='used' WHERE id=... AND status='valid' RETURNING *` or reuse the `for update` RPC (§5.2).
10. Extend the protected-column trigger to `disabled`/`disabled_*`/`username_changed_at` (§1.4).
11. Allowlist push endpoints; block private ranges; short timeouts (§1.5).
12. Match transfer recipients on `handle` only (§1.6).
13. Gate demo mode on an explicit flag + `NODE_ENV`; fail closed on missing config and missing Paystack secret (§1.8).
14. Rate limit the public app (edge middleware): auth, promo, scan, tickets, approvals (§5.6).
15. Add security headers/CSP/`frame-ancestors` to the public hooks — copy from the admin app (§5.10).

**Medium (next):**
16. Restrict `notifications` inserts to self (§1.9).
17. Require `BIOMETRIC_SECRET`/`QR_SIGNING_SECRET` in production; remove public fallbacks (§1.10).
18. Fix the reference generator (UUID) and insert one order per cart, not per item (§5.1).
19. Point-lookup ticket validation; paginate `listEvents` and all admin lists (§6.1, §6.3, §6.5).
20. Move rate-limit and push/subscription state out of module memory (Redis/KV + table) (§5.4).
21. Stop returning raw upstream error messages; move verification documents to object storage with signed URLs.
22. Either implement the HMAC QR verification server-side or remove the marketing claim (§1.7).
23. Add authorization tests that call PostgREST/RPCs **directly** as an authenticated user — those are the attacks that matter, not the SvelteKit routes.

---

## Appendix — Trust boundary summary

| Actor | Can reach | Enforced by |
|---|---|---|
| Anonymous browser | `GET /api/events`, promo oracle, reports, login/OTP, demo endpoints | RLS `anon` + route code |
| Authenticated user | **All tables/functions granted to `authenticated` via PostgREST with the public anon key** | RLS + `SECURITY DEFINER` validation only |
| SvelteKit server | User-scoped Supabase client; service-role client for push only | `createSupabase`, cookies |
| Admin console | Service-role client (full DB) | HMAC-signed session + per-route `require*` + DB role re-check |
| Paystack | Nothing (no webhook, no IP allowlist, no signature handling) | — |

The single most important structural change: **make the database the enforcement point for money, and never let "paid" be something a client can request.**
