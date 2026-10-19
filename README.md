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
   - `013_ticket_transfer.sql` — ticket transfers and ownership history
   - `014_gate_staff_tokens.sql` — hash-only, expiring PINs for organizer-configured scanner gates
   - `015_conversation_events.sql` — links chats to the event they started from
   - `016_event_broadcast_notifications.sql` — broadcast RPC that delivers organizer
     announcements to every ticket owner
   - `017_profile_operating_identity.sql` — public operating identity on profiles,
     shown under a chat peer's name in conversation lists
   - `018_organizer_scanner_tokens.sql` — organizer-scoped terminal PIN so the
     ticket scanner arms (PIN → camera → scan) even before any event exists
   - `019_shared_staff_scanner.sql` — lets door staff use an organizer's shared
     PIN from their own account (token resolution + staff check-in RPCs)
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

`npm run test:unit` — money/fee maths, date + HMAC-window maths,
QR signing/rotation, query cache semantics (staleness, invalidation, dedupe),
demo datasource behaviours (filters, capacity, orders), organizer logic
(event creation, gate check-in verified/duplicate/invalid, console stats, CSV
export), gate-scanner readiness, phone-camera plumbing (availability,
constraint fallbacks, software QR decoding), broadcast announcements and
component renders (EventCard, Chip, Avatar, useQuery probe).

## Organizer side

`/organizer` console (live stats, check-in stream), `/organizer/create` 5-step
wizard (basics → tickets → agenda → gate ops → review & publish),
`/organizer/scan` gate scanner (staff-PIN activation, camera + manual code
entry, offline queue) and `/organizer/events/[id]` management (roster, CSV
export, orders, check-in log). Paste `supabase/sql/006_organizer.sql` for the
check-ins table, gate config and organizer RLS.

### Gate scanner readiness

The dashboard's **Open Ticket Scanner** entry point is always live. It links to
the first event that has a gate configured, otherwise to the first event, and
`/organizer/scan` never redirects away: with no event (or an event without a
gate) the terminal explains the three steps — create the event, add a gate,
generate the staff PIN — and links straight into the wizard. Only the PIN and
the gate itself wait for setup.

### Broadcast announcements

**Broadcast Announcement** in the console and on `/organizer/events/[id]` posts
a real announcement. The message is written to the notification hub of every
ticket owner of that event (valid and already checked-in passes), and the
organizer sees how many holders were reached. In live mode this uses
`broadcast_to_event_holders` — apply `supabase/sql/016_event_broadcast_notifications.sql`
so the RPC exists; without it the server falls back to inserting the
notifications directly.

### Phone camera scanning

Arming the gate scanner and tapping **Start camera** opens the phone's rear
camera and reads the ticket QR (`owltside://t/<code>?s=<signature>`). The
plumbing lives in `src/lib/utils/qr-scanner.ts`:

- `cameraAvailability()` reports whether the browser can open a camera at all
  (secure context, camera API, preview frame) before the organizer taps.
- `openCameraStream(video)` asks for the rear camera (`facingMode:
  environment`) and falls back to looser constraints when a device rejects
  them, so an `OverconstrainedError` no longer kills the camera. Failures are
  mapped to a readable reason: blocked permission, no camera, insecure
  connection, preview frame.
- `createQrDetector()` uses the browser's native `BarcodeDetector` when it
  exists and otherwise falls back to a software decoder (`jsqr`) that reads a
  downscaled frame from an offscreen canvas — iOS Safari and Firefox have no
  native detector and would otherwise open the camera without ever reading a
  code.
- A preview that refuses to autoplay (iOS asks for a tap) shows **Tap to start
  the camera preview** instead of a black box, and a dropped frame never stops
  the camera. Manual ticket-code entry stays available as the fallback.

`getUserMedia` only exists in a secure context: over plain `http://<lan-ip>`
the scanner says so and points at `https` or `localhost`.


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

### Switching your own role

Use **Profile → Switch role**, or **Settings → Operating Identity**, to choose
Attendee, Organizer, or Guest. The active role updates shared navigation and
organizer-route access. Your account, tickets, and profile are retained in Guest
mode, so you can switch back without signing in again. Role switching shows a
pending state, prevents concurrent submissions, and reports save failures without
changing the selected mode.

In live mode this preference is saved in Supabase Auth user metadata as
`operating_identity` and restored from the authenticated user on each request
(including another device). No new SQL migration is needed for role switching.
Demo mode uses the existing HTTP-only identity cookie. This is a view preference,
not an admin role: database ownership and RLS still control access to event data.

### Live Google sign-in configuration

Google uses a server-side PKCE exchange and an exact, same-origin callback at
`https://<your-app-host>/auth/callback` (no query string). In Supabase Authentication:

- Enable the Google provider and configure its client ID/secret there, not in browser code.
- Set **Site URL** to your canonical production URL and add the exact app callback
  to **Redirect URLs**; for `https://owltside.vercel.app`, that is
  `https://owltside.vercel.app/auth/callback`.
- Add callbacks for any preview/custom hosts you actually sign in from as well.
  Start and finish on the same host/browser; the PKCE verifier is a host-scoped cookie.
- In Google Cloud, the authorized redirect URI is the **Supabase provider callback**
  shown in the Google provider settings (`https://<project-ref>.supabase.co/auth/v1/callback`),
  not the Owltside `/auth/callback` URL. Make sure Google test users/publishing status
  permit the account attempting login.
- Ensure the deployed app has `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`
  for that same project, and deploy the branch containing these changes.

The callback reports exchange failures instead of silently opening a guest session.
Same-host returns to `/` are recovered if Supabase falls back to Site URL, but that
cannot repair a callback sent to a different host (where the verifier cookie is absent).
Never share callback codes, access/refresh tokens, provider secrets, or cookie values
when reporting a login error; share only the host, failing step, and visible error text.
