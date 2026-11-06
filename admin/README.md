# Owltside Admin — control plane

Internal, admin-only workspace for the Owltside event, ticketing and payments
platform. It is a **separate SvelteKit app** (`owltside/admin`) that reads and
governs the same platform data as the customer app, and links back to it from
the sidebar (`PUBLIC_APP_URL`). The public app links here from its desktop
footer (`PUBLIC_ADMIN_URL`).

```text
owltside/            customer app  → http://localhost:5173
owltside/admin/      control plane → http://localhost:5174
```

## Run it

```bash
cd admin
npm install
npx svelte-kit sync # generate route types
npm run dev        # http://localhost:5174 (Supabase configuration required)
npm run check      # svelte-check / TypeScript
npm test           # vitest unit suite (store, auth, export contracts)
npm run build      # production build (@sveltejs/adapter-vercel)
```

## Admin accounts: Supabase Auth + database access list

There is no environment-based login bypass. Admins sign in with
**Supabase Auth email/password**. Migration 032 bootstraps the initial account
listed below; provision individual accounts for your team. Password hashes are
managed by Supabase in `auth.users`; **never put passwords in a public table**.
`public.admin_accounts` is the separate allowlist of permitted administrators.
A customer account alone does not grant any admin access.

### Set up your first admin

1. Run `supabase/sql/032_admin_accounts.sql` in the **same Supabase project's SQL
   Editor** after migration 031. It creates `public.admin_accounts`, visible in
   Table Editor. New all-in-one schema installs already include this migration.
2. Migration 032 creates a confirmed Supabase Auth user and email identity with:
   - **Work email address:** `admin@owltside.com`
   - **Security password:** `owltside-admin-2026`
   - **Access:** Super Admin (tier 0) in `public.admin_accounts`.

   The password is stored only as a bcrypt hash in `auth.users`, never in the
   access list. Enable email/password sign-in in Supabase's Email provider.
3. **Change this publicly known default password immediately through Supabase
   Auth before production use.** Re-running 032 does not reset an existing
   user's password or confirmation state, nor does it undo an existing admin's
   suspension or role changes. If that email already exists, use its current
   password or explicitly reset it in Supabase Auth; the migration prints a
   notice and preserves the existing credentials.

4. Copy `admin/.env.example` to `admin/.env` and configure
   `PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
   `ADMIN_SESSION_SECRET` (generate with `openssl rand -hex 32`). In production,
   set these in the **admin deployment's environment settings**. Never expose
   the service-role key to a browser or prefix it with `PUBLIC_`.
5. Restart the admin app and sign in at `/login` with the initial credentials
   above (or the changed password for an existing account). There is no
   `ADMIN_EMAIL` / `ADMIN_PASSWORD` fallback.

### Troubleshooting “Invalid credentials or admin access unavailable”

This is a rejected sign-in, not a blocked session cookie. The console deliberately
uses the same message for incorrect passwords, unconfirmed emails, and missing or
suspended admin access.

1. Check that the admin deployment's `PUBLIC_SUPABASE_URL` and server-only
   `SUPABASE_SERVICE_ROLE_KEY` point to the same Supabase project where you ran
   migration 032. Do not share the key in chat or browser diagnostics.
2. Run `supabase/diagnostics/admin_login.sql` in that project's SQL Editor.
   It is read-only and returns account/access flags, not password hashes:
   - No rows: run the revised migration 032 to create the initial account.
   - `email_confirmed = false` or `password_configured = false`: finish setting
     up that account in Supabase Auth.
   - `email_identity_present = false`: repair/provision the email/password
     account through Supabase Auth's supported admin workflow.
   - `admin_access_present = false`: grant that exact Auth user ID an allowlist
     row using the instructions below.
   - `admin_access_active = false`: have a trusted operator review the suspension;
     do not automatically reactivate an account just because login failed.
3. If all flags are true, use the user's current password. **Migration 032 does
   not replace an existing password with `owltside-admin-2026`.** Explicitly
   reset the password through Supabase Auth if it is unknown. Supabase provider
   policies or account restrictions can also reject sign-in; check Auth logs.
4. After five failed attempts, wait for the 10-minute local lockout to expire.
   The sign-in diagnostics button only checks the browser/session; it does not
   submit credentials or use up another attempt.

The page decodes action results with SvelteKit's `deserialize()`. A raw string
such as `[{"error":1,"email":2}, ...]` on a deployed login screen means its
frontend still needs the response-handling fix deployed. Fixing the presentation
does not itself reset passwords, apply SQL, or grant account access.

### Add, change, or revoke access

Create each additional user in Supabase Auth, confirm their email, and insert
an allowlist row using their actual Auth user UUID:

```sql
insert into public.admin_accounts (user_id, name, role)
values ('YOUR_AUTH_USER_UUID', 'Your name', 'Read-only Auditor');
```

`role` accepts the six roles in the authorization ladder below; `tier` is
computed automatically, so do not insert or edit it. You can manage names,
roles and `is_active` through Table Editor or trusted SQL:

```sql
-- Suspension immediately blocks the next admin request, including live sessions.
update public.admin_accounts set is_active = false
where user_id = 'THE_AUTH_USER_UUID';
-- Restore access with is_active = true; delete the row to remove access entirely.
```

Only trusted database operators/the server service role can access this table;
RLS is enabled with no browser-accessible policies. User-editable profiles and
Auth metadata never grant privileges. Role changes and suspensions are checked
on every request, not just at sign-in. Database failures deny access. Existing
legacy environment-based cookies are rejected after this upgrade.

The current `/staff` invitation/status controls are **in-memory workflow stubs**,
not this access list. Use Supabase to provision/suspend real accounts; those
controls do not grant or revoke login access. For password resets, use Supabase
Auth's recovery workflow; the admin app does not provide a reset page. To revoke
an existing admin session during recovery, deactivate its allowlist row.

This integration uses password authentication, not WebAuthn or TOTP. No Supabase
access/refresh tokens are exposed to the admin browser. The console issues its
own signed, HttpOnly cookie lasting 2 hours (12 hours when remembered).

## Routes

| Route | Purpose |
| --- | --- |
| `/login` | Supabase email/password sign-in, rate-limited, signed HttpOnly cookie |
| `/dashboard` | GMV/settlement KPIs, revenue velocity, review queue, top events, live ledger |
| `/search` | Federated Search HUD (users, passes, orders, events, organizers, incidents) |
| `/events`, `/events/[id]` | Organizer submission queue (live Supabase), approve/publish/reject, capacity & compliance |
| `/organizers`, `/organizers/[id]` | KYB registry, dossier, Paystack subaccount binding, evidence pipeline |
| `/users`, `/users/[id]` | Directory + attendee dossier, KYC, pass/order history, suspend/reinstate |
| `/tickets` | Pass inspector, void/re-issue, wallet delivery, re-issue history |
| `/orders` | Paystack ledger, split itemisation, webhook stream, refund initiation |
| `/settlements` | Escrow, commission, payout velocity, organizer settlement table |
| `/approvals` | Queue for everything the public app submits: refunds, instant payouts, identity & payout-account verification |
| `/refunds` | Policy-match review queue, approve/reject, batch auto-approve |
| `/reports` | Content reports from the public app: event listings and public profiles, action/dismiss with a note |
| `/moderation` | Incident triage, forensic telemetry, warn / dismiss / freeze sales |
| `/audit`, `/audit/[id]` | Immutable hash-chained ledger + forensic record dossier |
| `/staff` | Staff workflow stubs and permission matrix (real access is managed in Supabase) |
| `/settings` | Paystack rails, credential policy, signing keys, integrations |

Every list view supports `?q=`, status filters and pagination; the URL is the
source of truth so a dossier is linkable and survives refresh.

## Content reports (public app → console)

Attendees can flag an event listing or a public profile from the customer app.
Each report names a violation category (dropdown) and carries the details they
typed, and it arrives **open** in `public.content_reports`. The `/reports` queue
shows the target label, category, reporter, a snapshot of the live content and a
deep link into the public app.

- **Action** — the team acted on the content (suspend the listing from Events,
  restrict the account from Users, …). A note is mandatory and is written to the
  audit trail.
- **Dismiss** — reviewed, no action needed; also requires a note.
- Without Supabase credentials the page reviews the seeded queue
  (`seed.ts` → `makeReports`) and shows a **Demo dataset** chip.
- Apply `supabase/sql/025_content_reports.sql` from the customer app first; the
  page surfaces a clear error if the table is missing.
- Clients get no read or update access to the table: only the service role can
  list or resolve reports.

## Platform-wide announcements

Open **Notifications → Send announcement** to compose and preview an update for
**all users** of the public web app. Sending calls the service-role-only
`send_platform_announcement` RPC, which records the title, message, actor,
recipient count, and timestamp in `platform_announcements`, then inserts one
unread `announcement` notification per public profile in the same transaction.
The page also lists recent sends. Read-only auditors can read this history but
cannot send.

Apply `../supabase/sql/031_platform_announcements.sql` (or the current full
schema) in the public app's Supabase project. Public and authenticated roles
cannot execute the RPC or read the admin delivery log. In the public Activity
Hub, every platform announcement and organizer broadcast automatically ends
with **Follow for updates** and Owltside's Instagram, X, and TikTok icons.

## Approval queue (public app → console)

The customer app never approves itself. Refund requests, instant payouts and
verification details are written to `public.approval_requests` as `pending` and
show up on `/approvals` as **Pending review** on the public web until an admin
decides them.

```bash
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # decides approval_requests
```

- **Approve** (refund) → the pass flips to `refunded` and the attendee is
  notified; **Approve** (payout) → the payout is released; **Approve**
  (verification) → the public app shows "Verified".
- **Reject** requires a reason, which the requester sees on the same screen.
- Without Supabase credentials the console reviews its deterministic demo queue
  (`seed.ts` → `makeApprovals`) so the workflow is still demonstrable, and the
  page shows a **Demo dataset** chip.
- Apply `supabase/sql/023_approval_requests.sql` from the customer app first;
  the page surfaces a clear error if the table is missing.

## Organizer submission queue

Every event an organizer submits in the customer app is created with
`status = 'pending'` and is **not** visible on the public home/explore feeds.
The `/events` console renders those submissions at the top of the page
("Organizer submission queue") with title, organizer, date, venue, description,
ticket tiers and the submission timestamp.

- **Approve & Publish** writes `status = 'published'` (plus `moderated_at`,
  `moderated_by`, and a note when one is supplied). The customer app filters its
  feeds on that exact value, so the event appears on the next request, and the
  organizer's dashboard badge flips to “Published”.
- **Reject** requires a reason, writes `status = 'rejected'` and stores the note
  in `moderation_note`. The organizer can edit the event to resubmit it, which
  puts it back in the queue as `pending`.

The queue is Supabase-backed whenever both are set (server-side only):

```bash
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # bypasses RLS on events
```

Without them the console moderates its seeded demo dataset, so the workflow
still works with zero configuration. The service-role key is required because
RLS deliberately forbids organizers (and every other client) from setting
`status = 'published'` — see `supabase/sql/022_event_moderation.sql` in the
customer app.

## Authorisation ladder

| Tier | Role | Capabilities |
| --- | --- | --- |
| 0 | Super Admin | Everything: settings, staff, refunds, exports |
| 1 | Finance & Treasury / Trust & Safety Lead | Configure rails, approve refunds, KYC decisions |
| 2 | Event Operations / Support | Mutations: void/reissue passes, moderation actions |
| 3 | Read-only Auditor | Read + export only |

Guards live in `src/lib/server/auth.ts` (`requireMutation`, `requireConfigure`,
`requireSuper`, `requireAudit`) and are enforced **server-side** in every
`+page.server.ts` and API route — the UI only reflects the resulting capability.
API routes return `401` when signed out and `403` when the tier is insufficient.

## Security posture

- Stateless HMAC-signed session cookie (`owl_admin_session`) — session integrity
  only, never attendee passes. `HttpOnly`, `SameSite=Strict`, `Secure` in
  production, 2h TTL (12h when remembered).
- Supabase Auth verifies passwords; 5 failed attempts per IP per 10 minutes
  per server process, in addition to Supabase Auth rate limits. For multi-instance
  deployments, add a shared rate limiter at the gateway.
- `hooks.server.ts` redirects unauthenticated requests, and sets
  `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, `noindex`,
  COOP, a restrictive permissions policy, HSTS in production, and `no-store`
  on API and authenticated responses.
- Every mutation appends an immutable audit record with actor, IP, reason and
  a field-level diff; `verifyLedger()` re-walks the hash chain.
- All exports are CSV-escaped (RFC 4180) and audited by route.
- Errors keep the operator in context: `(console)/+error.svelte` renders 404s
  and 403s inside the sidebar shell, `+error.svelte` covers auth-free requests,
  both showing the request signature and a route back to the control plane.

## Responsive behaviour

Desktop-first like the reference screens, but every route is usable at 390px:
the sidebar collapses into a sheet, KPI grids reflow, dense registry tables
scroll inside `.table-wrap`, and secondary columns (settlement rail, platform
fees, audit reason, pass tier) drop out below `xl`/`2xl` so the primary
identifier, amount and status always stay visible without clipping.

## Data layer

The console has two data modes. Without a server-side Supabase URL and service
key, it uses the deterministic demo seed in `src/lib/server/seed.ts`. With
`PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` set in
`admin/.env` or the repository-root `.env`, the event registry, organizer and
user directories, detail records, dashboard order/ticket metrics, and event
counts read from the configured Supabase project. In development the admin
loads both local env locations, so the main app's project URL and service key
can be shared without duplicating credentials. The service key is used only on
the server to bypass attendee/organizer-scoped RLS; do not expose it as a
`PUBLIC_` variable or in browser code. The console shows a prominent demo-mode
banner when a URL/service-key pair is not detected.

The current schema in `../supabase/sql/000_full_schema.sql` has `events`,
`profiles`, `tickets`, and `orders`, but does not store event moderation status,
admin audit records, or settlement records. Accordingly, the live events view
is read-only; pending/draft/suspended counts are not reported as real, and event
creation/moderation actions are disabled rather than silently changing demo
state. Dashboard gross volume is calculated from paid + pending orders over the
last 30 days; paid order total, ticket counts/status, event counts, and event
capacity/sales come from database rows. Metrics that the schema cannot support
(such as settlement fees and moderation queues) are omitted/zeroed in live mode.

Other admin modules (users, organizers, refunds, moderation, staff, settings,
exports, and their mutations) still use the in-memory demo store. The `subscribe()`/
`touch()` hooks apply to that demo store only; Supabase reads currently refresh
when a page is loaded or revalidated.

## API surface

```
GET  /api/search?q=                 federated lookup for ⌘K palette
GET  /api/health                    liveness probe (public)
GET  /api/announcements             recent platform-wide sends
POST /api/announcements             send an announcement to every public app user
POST /api/events                    create draft event
POST /api/events/[id]/status        approve / reject / suspend / publish
POST /api/organizers/[id]/status    verify / reject / freeze KYB
POST /api/tickets/[id]/actions      void | reissue
POST /api/orders/[id]/refund        initiate refund (settled only)
POST /api/approvals/[id]/decision   approve | reject (refund, payout, verification)
POST /api/reports/[id]/decision     action | dismiss (event listing / profile report)
POST /api/refunds/[id]/decision     approve | reject
POST /api/refunds/batch             auto-approve eligible queue
POST /api/users/[id]/status         active | blocked | flagged
POST /api/users/[id]/reverify       request identity | payoutAccount updates (reason required)
POST /api/cases/[id]/resolve        warn | dismiss | freeze
POST /api/staff/invite              issue enrolment link (Super Admin)
POST /api/staff/[id]/status         suspend / restore administrator
POST /api/settings                  update financial & credential policy
POST /api/settlements/reconcile     release cleared payout batch
GET  /api/export/[report]           dashboard, overview, events, organizers, users,
                                    tickets, orders, refunds, moderation, audit,
                                    staff, settlements
```

## Tests

```bash
cd admin
npm test
```

`tests/auth.test.ts` covers Supabase password verification, denied access,
lockout, refreshed session permissions, cookie signing/expiry and tier guards.
`tests/admin-access.test.ts` covers server-only client configuration and trusted
access-row validation. The repository-root
`tests/unit/admin-accounts-database.test.ts` executes migration 032 in PGlite
and checks role/tier constraints, foreign keys and client-role access denial.
The remaining admin suites cover verification workflows, announcements and UI
regressions.

## Deploy

Build with `npm run build` (Vercel adapter). Set the env vars from
`.env.example` in the hosting project, keep the admin deployment on a separate
hostname from the public app, and put it behind your SSO / VPN if the platform
is not meant to be publicly discoverable.

### User verification

Apply `../supabase/sql/030_admin_verification_lifecycle.sql` after migration 029
before deploying this workflow. The Users directory and full profile share a
verification panel with confirmed email, phone, identity and payout statuses.
Email uses Supabase Auth `email_confirmed_at`, not `profiles.verified` or editable
user metadata. **Re-verify** is available to mutation-enabled admins for approved
identity or payout-account checks. It requires a reason, records the actor,
notifies the user and resets the selected check atomically. Auditors cannot request
updates. Review the user's new submission in **Approvals** as usual.
