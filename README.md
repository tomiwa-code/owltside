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
npm run build        # production build (adapter-node)
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
3. Set env vars (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`,
   `PAYSTACK_SECRET_KEY`, `QR_SIGNING_SECRET`) and redeploy.

Auth is email OTP (`signInWithOtp` + `verifyOtp`) via `@supabase/ssr` cookies.
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
