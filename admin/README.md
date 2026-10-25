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
npm run dev        # http://localhost:5174  (demo mode, zero config)
npm run check      # svelte-check / TypeScript
npm test           # vitest unit suite (store, auth, export contracts)
npm run build      # production build (@sveltejs/adapter-vercel)
```

Demo credentials are pre-filled on the sign-in screen:
`admin@owltside.com` / `owltside-admin-2026`. The hardware-key button simulates a
FIDO2 assertion. Copy `.env.example` → `.env` and set `ADMIN_EMAIL`,
`ADMIN_PASSWORD` (16+ chars) and `ADMIN_SESSION_SECRET` to leave demo mode.

## Routes

| Route | Purpose |
| --- | --- |
| `/login` | Credential + WebAuthn sign-in, rate-limited, signed HttpOnly cookie |
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
| `/staff` | Administrators, permission matrix, hardware-key enrolment, telemetry |
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
- Constant-time credential comparison; 5 failed attempts per IP per 10 minutes.
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

`src/lib/server/store.ts` is the single read/write surface over the deterministic
seed in `src/lib/server/seed.ts` (18,420 users, 142 events, ~4,820 tickets,
~4,900 orders, refunds, moderation cases, staff, 1,428 audit records, settings).
The store is built once per server process; mutations last for the process
lifetime. In production the same query surface is served by Supabase — routes,
types and UI do not change. `subscribe()`/`touch()` are the hooks for pushing
live updates into the client.

## API surface

```
GET  /api/search?q=                 federated lookup for ⌘K palette
GET  /api/health                    liveness probe (public)
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

`tests/store.test.ts` exercises the mutation invariants (settled-only refunds,
void/re-issue epoch handling, audit chain integrity, pagination clamping);
`tests/auth.test.ts` covers demo/live auth, lockout, cookie signing/expiry and
the tier ladder; `tests/export.test.ts` locks the CSV contract and every export
link referenced in the UI; `tests/approvals.test.ts` locks the approval queue
(reason required to reject, approve-refund settles the pass, no double
decisions); `tests/reports.test.ts` locks the content report queue (both target
types, mandatory review note, no double reviews).

## Deploy

Build with `npm run build` (Vercel adapter). Set the env vars from
`.env.example` in the hosting project, keep the admin deployment on a separate
hostname from the public app, and put it behind your SSO / VPN if the platform
is not meant to be publicly discoverable.
