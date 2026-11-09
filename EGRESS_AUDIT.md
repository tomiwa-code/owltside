# Egress audit — why 11 users burned 8.89 GB, and what changed

**Status:** fixed in code + one SQL migration (`supabase/sql/036_egress_control.sql`).
**Severity:** critical (free-tier egress at 178 % of quota, project at risk of throttling).
**Scope:** `src/` (public app), `supabase/sql/`, deployment configuration.

---

## TL;DR

Three things multiplied together:

1. **The header polled three full list endpoints every 8–20 seconds** on every page,
   for every signed-in tab — ~23,700 requests per tab per day.
2. **Those payloads were unbounded and fat.** `/api/conversations` returned *every*
   conversation the account ever had, each with **two full profile rows including
   base64 image data URLs**. `/api/notifications` returned the entire notification
   history. A single response could be hundreds of kilobytes.
3. **`getProfileEvents()` selected every event in the database** (with organizer join)
   and filtered by organizer/speaker in JavaScript — on `/users/[handle]` and `/profile`.

`11 MAU × 1–2 open tabs × ~24k polls/day × 100–300 KB = tens of GB/month.`
The 5 GB free-tier allowance is gone in about two user-days of an idle open tab.

Every item below is fixed in this branch. The biggest single lever was not "poll
less" — it was **stop shipping images inside JSON rows** and **stop returning
unbounded collections**.

---

## 1. Infinite re-renders, duplicate fetches and polling storms

### 1.1 `useQuery` ignored visibility, staleness and failures
`src/lib/state/query.svelte.ts`

Before: `setInterval(() => void refetch(), interval)` — an unconditional network
call every tick, even in a hidden tab, even when the data was still fresh. A
failing endpoint also re-armed the "initial fetch" effect on every `isFetching`
flip, so one broken response became a retry loop (found while running the test
suite: it exhausted a 2 GB heap).

After:

- polling **pauses while `document.visibilityState === 'hidden'`**
  (`refetchIntervalInBackground` opts back in), and refetches once on return;
- ticks are **staleness-gated** — `refetchIfStale()` never touches the network
  inside `staleTime`;
- **exponential backoff** after a failure (15 s → 5 min), so a broken endpoint
  cannot spin;
- `queryClient.ensure()` returns fresh cache instead of fetching, and
  `queryClient.fetch()` still dedupes concurrent callers — page transitions and
  repeated mounts no longer re-download;
- `persist: true` mirrors a key into `localStorage` (used for the event
  catalogue) so a reload or cold PWA start renders from disk;
- the server never reads or writes the module cache (`browser` guard), so one
  request can't leak another user's rows into an SSR render;
- seeding from `data` only happens when the cache is empty, so an older SSR
  snapshot can never clobber newer client data.

### 1.2 The header polled three heavyweight endpoints
`src/lib/components/AppHeader.svelte`

| Endpoint | Before | After |
| --- | --- | --- |
| `/api/conversations` | every **8 s** | realtime + **5 min** fallback |
| `/api/message-requests` | every **10 s** | realtime + **5 min** fallback |
| `/api/notifications` | every **20 s** | realtime + **5 min** fallback |
| badge counters | — | **`/api/badges`, every 60 s, ~60 bytes** |

A new `GET /api/badges` returns `{ unread, inboxUnread, requests }` (counters
only). When a counter is ahead of the cached list, the header refreshes that list
once — with a 60 s cooldown so a mismatch can never become a loop.

Realtime was already wired (`subscribeTable`, `subscribeIncomingMessages`); the
polling simply never deferred to it. Polling is now the *fallback*, with a 5 min
cadence when a socket is available.

### 1.3 Chat thread polled the whole thread every 4 seconds
`src/routes/(app)/inbox/[id]/+page.svelte`

`refetchInterval: 4_000` on `/api/conversations/:id/messages` while a Realtime
`postgres_changes` subscription for the same conversation was already active:
**900 full-thread downloads per hour, per open chat**. Now: realtime is the
transport, polling is a 60 s safety net, and the endpoint returns only the newest
50 messages (`?before=<iso>` pages backwards).

Other cadences reduced: notifications hub 30 s → 5 min, inbox 20 s → 5 min,
organizer dashboard/console 10 s → 2 min.

### 1.4 Every navigation re-downloaded the inbox and notification stream
`src/routes/(app)/+layout.server.ts`

The `(app)` layout ran on *every* navigation and fetched
`getNotifications()` + `getConversations()` + `getIncomingMessageRequests()`
just to compute two integers. It now calls `getBadgeCounts()`
(`inbox_badge_counts()` RPC from migration 036, with a three-query fallback) and
transfers counters instead of rows.

### 1.5 Framework assets triggered auth + profile reads
`src/hooks.server.ts`

`handle()` runs for every request. It now short-circuits `/_app/*`, icons,
`robots.txt`, manifest and the service worker before the session lookup, so a
page load no longer performs `auth.getUser()` + a profile read per JS chunk.

---

## 2. Missing caching / over-fetching

### 2.1 No server-side cache for the public catalogue
`src/lib/server/datasource.ts`

`listEvents()` is identical for every visitor and only changes on an organizer or
admin write. It now goes through a 30 s in-process memo (`cached()`), invalidated
by `invalidatePublicCache()` on create/update/delete. A traffic burst — or a bot
crawl — collapses into one Postgres read.

`getEvent(slug)` gets a 15 s memo for the same reason (event URLs are the most
shared links on the site).

### 2.2 The explore page fetched the catalogue twice
`src/routes/(app)/explore/+page.server.ts`

`Promise.all([listEvents(filters), listEvents()])` — two full reads, two full
payloads, every filter change. Now one read plus `filterEventList()` in memory.

### 2.3 `getProfileEvents()` scanned the entire events table
`src/lib/server/datasource.ts`

Before: `select('*, organizer:profiles(*)')` with **no filter**, then JS-side
filtering by organizer/speaker. After: two bounded, indexed queries —
`.eq('organizer_id', profileId)` and `.contains('speakers', [{ id: profileId }])`
(GIN index added in 036) — merged and de-duplicated. `/users/[handle]` and
`/profile` no longer download every event on the platform.

### 2.4 No HTTP caching for feeds
- `/api/events` now sends `cache-control: public, max-age=60, s-maxage=300,
  stale-while-revalidate=600` **and a strong ETag** (304s cost zero DB work).
- `/home`, `/explore` and anonymous event pages send public cache headers; signed-in
  renders stay `private, must-revalidate`.
- Feeds are cached on device for 5 minutes and mirrored to `localStorage` for 6 hours.

---

## 3. Payload size

### 3.1 `SELECT *` everywhere
`src/lib/server/datasource.ts` now uses explicit column lists:
`PROFILE_CARD_COLUMNS`, `PROFILE_FULL_COLUMNS`, `EVENT_CARD_COLUMNS`,
`EVENT_DETAIL_COLUMNS`, `NOTIFICATION_COLUMNS`, `CONVERSATION_COLUMNS`,
`MESSAGE_COLUMNS`, `TICKET_COLUMNS`, `ORDER_COLUMNS`, `CHECKIN_COLUMNS`,
`MESSAGE_REQUEST_COLUMNS`. `select('*')` is gone from every public read.

### 3.2 Card vs detail event payload
`toEvent(row, organizer, mode)` — feeds get `mode: 'card'`: no `speakers`,
`agenda`, `faqs`, `policies`, and a 280-character description teaser. The event
page still gets the full `detail` payload. `EVENT_CARD_COLUMNS` keeps only what a
card renders (`tiers` for price, `gates` for the filter, `cover`, counts).

### 3.3 Inline base64 images rode along in every payload
This was the single largest contributor. Avatars/banners are stored in
`profiles.avatar_url` / `banner_url` and posters in `events.cover->>src` as
`data:` URLs (see `007_profile_editing.sql`, `012_event_posters.sql`). Those
blobs were re-sent inside **every** conversation row (twice), event card,
message request and notification poll.

New `src/lib/server/media.ts`:

- `toProfile()` / `toCoverArt()` rewrite a `data:` URL to
  `/api/media/{avatar|banner}/{handle}` or `/api/media/poster/{slug}?v=<fingerprint>`;
  external URLs pass through untouched;
- the new routes read **only the image column**, return real image bytes with
  `cache-control: public, max-age=604800, s-maxage=31536000, immutable` and an
  ETag (304 on repeat);
- the `v` fingerprint changes when the image changes, so `immutable` stays correct;
- toProfile's media URL means an avatar is downloaded **once per device**, not once
  per conversation row, per poll, per page.

Migration 036 adds `check` constraints (`not valid`, so existing rows are
grandfathered) that reject new inline images above 96 KB (avatar), 192 KB
(banner) and 320 KB (poster).

### 3.4 Unbounded collections
| Query | Before | After |
| --- | --- | --- |
| `getConversations` | all threads, 2 full profiles each | newest **50**, card profiles |
| `getNotifications` | entire history | newest **50**, `?limit`/`?offset` |
| `getMessages` | entire thread | newest **50**, `?before` cursor |
| `getTickets` | entire wallet | **200**, explicit columns |
| `getIncomingMessageRequests` | all pending | **50** |
| `searchProfiles` | 30 full rows | **20** card rows |
| `getConnections` | every follow | **100** |
| `getOrganizer` | `*` events + `*` tickets/orders/checkins | explicit columns, **100** events |
| `listEvents` | 120 events, full payload | **60** card events (`?limit` capped at 60) |

`GET /api/events` also rejects `limit > 60` so it cannot be used as a bulk export.

---

## 4. Abusive scraping / bot traffic

### 4.1 CAPTCHA on public writes
New `src/lib/server/captcha.ts` (Cloudflare Turnstile, no user puzzle) and
`src/lib/components/Turnstile.svelte` (renders only when
`PUBLIC_TURNSTILE_SITE_KEY` is set). Enforced server-side on:

- `POST /api/reports` (guest-accessible),
- `POST /api/message-requests`,
- the login OTP action (`?/sendCode`),
- signup (`?/create`).

Verification happens **before** any database write, so a bot cannot bypass it by
calling the API directly. Unset keys = check skipped (development/demo); a
Turnstile outage never blocks real users (fail-open, rate limiting still applies).
CSP was extended for `challenges.cloudflare.com`.

### 4.2 Rate limits tightened
`src/hooks.server.ts`

| Route | Limit |
| --- | --- |
| `POST /api/{reports,message-requests,push/subscribe}` | 10 / min / IP |
| `GET /api/events` | 60 / min |
| `GET /api/profiles/search` | 30 / min |
| `GET /api/{badges,notifications,conversations,message-requests}` | 120 / min |
| `GET /api/media/*` | 600 / min (one-off, then browser cache) |
| anonymous `/home`, `/explore`, `/events/*`, `/users/*` | 180 / min |
| everything else under `/api/` | 120 / min |

### 4.3 Crawler guidance + public caching
`static/robots.txt` disallows the private app and `/api/`, and blocks
Ahrefs/Semrush/MJ12. Combined with the new cache headers, well-behaved crawlers
cost the database nothing.

### 4.4 Cheaper cost of a cold cache
`/api/media/*` skips the session/profile lookup entirely (it only needs the
anonymous client), so serving images doesn't re-introduce the per-request auth
round trip.

---

## Database changes — `supabase/sql/036_egress_control.sql`

- Indexes for the newly scoped reads: unread-notification partial index,
  `conversations (user_id|peer_id, last_at desc)`, `messages (conversation_id,
  sent_at desc)`, partial `events (starts_at) where status='published'`, GIN on
  `events.speakers`, `lower(profiles.handle)`.
- `inbox_badge_counts()` — one round trip for the three header numbers
  (`security definer`, `authenticated` only).
- Inline-image size ceilings on profiles/events.
- `purge_old_notifications(retain_days)` — retention helper (schedule with
  pg_cron; see the comment in the file).

---

## Expected impact

Per signed-in tab, roughly:

| | Before | After |
| --- | --- | --- |
| Requests/hour (header + open page) | ~990–2,000 | ~60–120 |
| Conversation poll payload | 100–300 KB (`data:` avatars, all threads) | ~1.5 KB (50 threads, cached image URLs) |
| Chat poll payload | whole thread / 4 s | 50 messages / 60 s + realtime |
| Profile/event page reads | whole events table | scoped, indexed |
| Repeat feed view | re-read Postgres | 30 s memo + ETag 304 + device cache |

Order-of-magnitude: **~10× fewer requests and ~50–99× smaller responses.** The
8.89 GB should fall to well under 1 GB/month for the same usage; re-check the
Supabase usage graph after deploying and 24 h of real traffic.

---

## Verification checklist

1. Apply `supabase/sql/036_egress_control.sql` (SQL editor or `supabase db push`).
2. Set `PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` in production; redeploy.
3. Supabase → Reports → API: confirm `select` column lists and `limit` in the query
   log; `pg_stat_statements` should show no unfiltered `events` scans.
4. Browser DevTools → Network, on `/home` with the app open and idle for 2 minutes:
   expect `/api/badges` every ~60 s plus a handful of media requests (cached
   afterwards). No `/api/conversations` or `/api/notifications` traffic unless
   something actually arrives.
5. Hide the tab for 10 minutes: request count must stay flat (visibility pause).
6. `curl -I /api/events` → `cache-control: public, …` + `etag`; repeat with
   `If-None-Match` → `304`.
7. Run the suite: `npm test` (497 tests, including
   `tests/unit/egress-guardrails.test.ts`, which pins the card payload, the 304,
   the paging guard, the media URLs and the cache behaviour) and `npm run check`
   (0 errors).

---

## Follow-ups (not done here)

- **Move images to Supabase Storage.** The `/api/media/*` indirection makes this a
  drop-in swap later: write the upload to a bucket and store its public URL; the
  media routes become unnecessary and rows stop carrying blobs entirely.
- **Realtime for the organizer console** instead of the 2-minute fallback poll.
- **Server-side `pg_cron` retention** for `messages` older than N months.
- **Turn off `record_event_view()` for anonymous bots** (or debounce per IP) — it is
  one RPC write per event page view.
- Consider Supabase's **read replica / caching** for `listEvents()` once the memo
  TTL needs to shrink below 30 s.
