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
| `/events`, `/events/[id]` | Moderation queue, approve/publish/reject, capacity & compliance |
| `/organizers`, `/organizers/[id]` | KYB registry, dossier, Paystack subaccount binding, evidence pipeline |
| `/users`, `/users/[id]` | Directory + attendee dossier, KYC, pass/order history, suspend/reinstate |
| `/tickets` | Pass inspector, void/re-issue, wallet delivery, re-issue history |
| `/orders` | Paystack ledger, split itemisation, webhook stream, refund initiation |
| `/settlements` | Escrow, commission, payout velocity, organizer settlement table |
| `/refunds` | Policy-match review queue, approve/reject, batch auto-approve |
| `/moderation` | Incident triage, forensic telemetry, warn / dismiss / freeze sales |
| `/audit`, `/audit/[id]` | Immutable hash-chained ledger + forensic record dossier |
| `/staff` | Administrators, permission matrix, hardware-key enrolment, telemetry |
| `/settings` | Paystack rails, credential policy, signing keys, integrations |

Every list view supports `?q=`, status filters and pagination; the URL is the
source of truth so a dossier is linkable and survives refresh.

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

The console has two data modes. Without a server-side Supabase URL and service
key, it uses the deterministic demo seed in `src/lib/server/seed.ts`. With
`PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` set in
`admin/.env`, the event registry, event dossier, dashboard order/ticket metrics,
and event counts read from the configured Supabase project. The service key is
used only on the server to bypass attendee/organizer-scoped RLS; do not expose it
as a `PUBLIC_` variable or in browser code. Copy these values from the main
app's local environment into `admin/.env` (the nested admin app does not inherit
the root `.env` automatically).

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
POST /api/events                    create draft event
POST /api/events/[id]/status        approve / reject / suspend / publish
POST /api/organizers/[id]/status    verify / reject / freeze KYB
POST /api/tickets/[id]/actions      void | reissue
POST /api/orders/[id]/refund        initiate refund (settled only)
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
link referenced in the UI.

## Deploy

Build with `npm run build` (Vercel adapter). Set the env vars from
`.env.example` in the hosting project, keep the admin deployment on a separate
hostname from the public app, and put it behind your SSO / VPN if the platform
is not meant to be publicly discoverable.
