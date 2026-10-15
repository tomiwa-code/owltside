# Owltside 🦉

Event discovery, instant ticketing and live gate check-in — a mobile-first,
installable **PWA** built with **SvelteKit 2 + Svelte 5 (runes)**, **TypeScript**,
**Tailwind CSS v4** and **Embla Carousel**, backed by **Supabase** (Postgres +
Auth + Realtime) with **Paystack** payments.

The UI implements the provided design sources exactly (the “Evently Pulse”
visual language: deep-slate glassmorphism, Space Grotesk / Inter /
JetBrains Mono, indigo `#c0c1ff` primary, coral/cyan accents).

## Run it

```bash
npm install
npm run dev          # http://localhost:5173  (demo mode, zero config)
npm run test:unit    # vitest
npm run check        # svelte-check / typecheck
npm run build        # production build (Vercel adapter, Node 24)
```

### Demo mode vs live mode

With no env vars the app runs in **demo mode**: seeded Lagos events, simulated
OTP auth (any 6 digits), a sandbox payment harness (Approve / 3-D Secure /
Decline) and a chat peer that replies server-side. Copy `.env.example` →
`.env`, paste your Supabase keys (and optionally Paystack keys) and the same
code paths switch to the live backend — no component changes.

## Going live on Supabase

1. Create a Supabase project.
2. Open **SQL Editor** and paste the files from `supabase/sql/` **in order**:
   - `001_schema.sql` — tables (profiles, events, tickets, orders, conversations, messages, notifications)
   - `002_rls.sql` — row-level security policies
   - `003_functions.sql` — signup trigger, conversation preview trigger, atomic `create_order` RPC
   - `004_realtime.sql` — realtime publication for chat + notifications
   - `005_seed.sql` — starter profiles/events
   - `006_organizer.sql` — gate config, check-ins and organizer policies
   - `007_profile_editing.sql` — banner, interests and 30-day username cooldown fields
   - `008_message_requests.sql` — organizer first-contact requests, RLS, and the accept-to-chat RPC
   - `009_speaker_invite_notifications.sql` — delivers role-specific notifications to invited profiles
   - `010_speaker_invite_responses.sql` — lets invitees accept or decline event roles for their public profiles
   - `011_profile_follows.sql` — persistent relationships, RLS, and atomic follower/following counts
   - `012_event_posters.sql` — requires uploaded poster artwork for all new events
3. Set env vars (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`,
   `PAYSTACK_SECRET_KEY`, `QR_SIGNING_SECRET`) and redeploy.

Auth is email OTP (`signInWithOtp` + `verifyOtp`) via `@supabase/ssr` cookies. Google sign-in uses Supabase OAuth; enable the Google provider and add `/auth/callback` to the allowed redirect URLs.
Chat uses **Supabase Realtime channels** on `messages` inserts (no separate
socket server); demo mode falls back to `useQuery(refetchInterval)` polling.

## Payments

- **Paystack**: server-side `transaction/initialize` + `transaction/verify`
  (the verify call is the only source of truth for paid status).
- Demo sandbox harness simulates `approve (200)`, `require 3DS`, `decline (402)`.

## Ticket security model

QR payloads are `owltside://t/<code>?s=<hmac>` where the HMAC signs
`code + floor(now/30s)` — the signature rotates every 30 s so screenshots
expire. In live mode the signature is computed/verified server-side
(`QR_SIGNING_SECRET`); the gate scanner recomputes the same window.

## Caching

`src/lib/state/query.svelte.ts` is a tiny TanStack-Query-style cache:
stale-while-revalidate (`staleTime`), polling (`refetchInterval`),
`invalidate(prefix)` with automatic refetch of active queries, and deduped
in-flight requests. Effects are guarded so they always converge (no infinite
`$effect` loops). SSR loaders render first paint; the cache refreshes on the
client. API routes add HTTP `cache-control: max-age … stale-while-revalidate`.

## Structure

```
src/
├─ routes/
│  ├─ +page.svelte                 splash / launch gate
│  ├─ auth/{login,signup,verify}   email OTP flow
│  ├─ api/…                        JSON endpoints for client refresh + PWA caching
│  └─ (app)/
│     ├─ home                      feed: spotlight, Embla rails, trending
│     ├─ explore                   list / map / calendar + filter sheet
│     ├─ events/[slug]             detail, agenda, tiers, sticky checkout dock
│     ├─ checkout                  Paystack + sandbox harness + promo codes
│     ├─ tickets, tickets/[id]     wallet, rotating HMAC QR, transfer/refund
│     ├─ inbox, inbox/[id]         realtime chat
│     ├─ notifications             activity hub
│     ├─ profile                   stats, calendar popover, edit sheet
│     ├─ users/[handle]            community profiles + follow
│     ├─ settings                  identity, prefs, sign-out
│     └─ organizer/…               console, create wizard, scan, events/[id]
├─ lib/
│  ├─ components/                  reusable: Carousel (Embla), Sheet, EventCard,
│  │                                QrPass, TopBar, BottomNav, Chips, Toasts…
│  ├─ state/                       query cache, persisted prefs, toasts
│  ├─ server/                      datasource (demo ⇄ supabase), paystack, seed
│  └─ utils/                       money, dates, HMAC QR, .ics
supabase/sql/                      paste-in-order schema for Supabase
static/                            manifest, service worker, icons, logo
tests/                             vitest unit + component tests
```

## PWA

`static/manifest.webmanifest` + `static/sw.js` (cache-first hashed assets,
network-first navigation with offline shell fallback), install prompt on the
home banner, safe-area insets and a standalone dark theme.

## Testing

`npm run test:unit` — 34 tests: money/fee maths, date + HMAC-window maths,
QR signing/rotation, query cache semantics (staleness, invalidation, dedupe),
demo datasource behaviours (filters, capacity, orders), organizer logic
(event creation, gate check-in verified/duplicate/invalid, console stats, CSV
export) and component renders (EventCard, Chip, Avatar, useQuery probe).

## Organizer side

`/organizer` console (live stats, check-in stream), `/organizer/create` 5-step
wizard (basics → tickets → agenda → gate ops → review & publish),
`/organizer/scan` gate scanner (staff-PIN activation, camera + manual code
entry, offline queue) and `/organizer/events/[id]` management (roster, CSV
export, orders, check-in log). Paste `supabase/sql/006_organizer.sql` for the
check-ins table, gate config and organizer RLS.


## Profile, discovery, and publishing updates

- The home-feed navigation is shared by every authenticated-app route through `AppHeader`.
  It uses the current saved profile and updates immediately after a photo crop, including
  on Notifications. Local photo/name drafts are scoped to the signed-in account.
- Follow/unfollow uses `profile_follows`, not localStorage. Counts are maintained by database
  triggers; a unique relationship key prevents duplicate follows. Apply migration **011**
  before deploying the frontend. It reconciles old display-only counts to actual relationships.
  Browser-only follows from earlier versions cannot be reliably attributed to an account and
  are deliberately not silently imported. Connection drawers load real users with pending,
  empty, error, and retry states. In zero-config demo mode these relationships are held in
  server memory (survive browser refresh, **not a server restart**); use Supabase for durability.
- Explore searches real event/venue records and profile names, handles, and cities. Venue
  results are grouped from actual events, not a separate invented venue directory.
- Event drafts start empty. Publishing requires an authenticated organizer, real event details,
  valid dates/ticket tiers, and a JPEG/PNG/WebP flyer. Uploads open the resize/crop sheet before
  use. The server decodes the bytes, rejects corrupt/oversized/tiny images, strips metadata,
  and normalizes the poster to a JPEG up to 1600 × 900. The validated image is persisted in
  `events.cover.src` and displayed consistently by `Cover`. Apply migration **012** for the
  database insert guard. Existing seed/legacy artwork is readable, but new events cannot use it.
  Unpublished drafts remain only on the current page; no fake autosave success is reported.
- Enhanced form buttons share pending feedback and double-submit prevention, including
  submit buttons rendered outside forms (sheet footers). Network-driven follow/request,
  scanner, and cache actions also expose pending states.

Regression checks: `npm run check`, `npm test`, `npm run build`, and
`npm run test:e2e -- tests/e2e/app-regressions.spec.ts` (requires Playwright Chromium).
For an existing Chromium binary, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path.
