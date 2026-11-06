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
npm run dev        # http://localhost:5174 (uses shared Supabase Auth + data)
npm run check      # svelte-check / TypeScript
npm test           # vitest unit suite
npm run build      # production build (@sveltejs/adapter-vercel)
```

## Unified Admin authentication & roles

The Admin console shares **one unified login** with the customer-facing Owltside
app via Supabase Auth (**Email 6-digit OTP** + **Google OAuth**). There are no
dummy admins, pre-filled emails, or fixed `ADMIN_EMAIL` / `ADMIN_PASSWORD`
credentials.

Only users whose `public.profiles.role` column is `'superadmin'` or `'admin'`
are allowed to sign in; all other accounts are rejected with an explicit `403`
access-denied error.

### Bootstrap your first Super Admin

1. Apply `../supabase/sql/032_profile_admin_roles.sql` in your Supabase SQL
   Editor (or `000_full_schema.sql` for a fresh database).
2. Sign up / sign in once on the main Owltside app if you haven't already so
   your `public.profiles` row exists.
3. Open **Supabase Table Editor → `public.profiles`**, locate your user row, and
   update the `role` column from `user` to `superadmin` (values like
   `super admin` or `super_admin` are normalized automatically by the database
   trigger).
4. Configure `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_SESSION_SECRET` (`openssl rand -hex 32`
   in production) on the admin deployment.
5. Sign in at `/login` using the same email OTP code or Google account you use
   on the main app. For Google sign-in on a separate admin hostname, add
   `https://<admin-host>/auth/callback` to Supabase **Authentication → URL
   Configuration → Redirect URLs**.

### Assign or revoke Admin access

Once signed in as a **Super Admin**, open **Roles & Admins** (`/staff`) and click
**Assign Administrator**:

- Pick any existing Owltside user or enter a new user's email address (which
  provisions a confirmed Owltside account automatically so the same login works
  on both the main app and the admin dashboard).
- Choose **Admin** (operational dashboard access) or **Super Admin** (full
  governance + managing admins and platform settings).
- Role changes and removals update `public.profiles.role` immediately and are
  enforced on every subsequent request without waiting for session cookies to
  expire.

## Routes

| Route | Purpose |
| --- | --- |
| `/login` | Unified Owltside Email 6-digit OTP + Google OAuth sign-in, role-gated (`admin` / `superadmin`) |
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
| `/staff` | Live Roles & Administrators directory (`public.profiles.role`), assign/revoke Admin & Super Admin access |
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
| 0 | Super Admin (`superadmin`) | Everything: platform settings, assign/remove admins, approvals, refunds, announcements, exports |
| 1 | Admin (`admin`) | Operational dashboard access: events, approvals, refunds, users, organizers, reports, moderation, announcements, exports |

Guards live in `src/lib/server/auth.ts` (`requireMutation`, `requireConfigure`,
`requireSuper`, `requireAudit`) and are enforced **server-side** in every
`+page.server.ts` and API route — the UI only reflects the resulting capability.
API routes return `401` when signed out and `403` when the tier is insufficient.

## Security posture

- Stateless HMAC-signed session cookie (`owl_admin_session`) — session integrity
  only, never attendee passes. `HttpOnly`, `SameSite=Strict`, `Secure` in
  production, 2h TTL (12h when remembered).
- Constant-time credential comparison; 5 failed attempts per IP per 10 minutes
  per server process. For multi-instance
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

`tests/auth.test.ts` covers role-gated Email OTP & Google OAuth authentication,
rejection of non-admin users, lockout, signed session cookies, live role refresh
and revocation, legacy cookie rejection and tier guards. `tests/login-action.test.ts`
and `tests/login-response.test.ts` cover login actions, response decoding and
read-only diagnostics. `../tests/unit/profile-admin-roles-database.test.ts` tests
`032_profile_admin_roles.sql` in PGlite (normalization of `super admin`,
blocking client-side role escalation, and main-app profile upsert safety).

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
