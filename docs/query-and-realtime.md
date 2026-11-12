# Data fetching and live updates

Two layers own runtime data:

1. **TanStack Query** (`src/lib/query/`) is the client cache. Every screen reads
   through it, so two components asking for the same resource share one entry,
   concurrent requests dedupe, and a remount inside the freshness window costs
   no network request.
2. **Supabase Realtime** (`src/lib/realtime.ts` + `src/lib/query/realtime-sync.ts`)
   is one WebSocket per signed-in session. It patches the same cache and falls
   back to a slow poll when no socket can be opened (demo mode).

## Where data comes from

Route data is loaded by **cache-aware universal loads** (`+page.ts`):

```
         first render (SSR)                    later tab switches (browser)
                 │                                      │
     fetch('/api/…') in-process               cachedValue(key, staleTime)
                 │                                      │
       +---------------- shared QueryClient ----------------+
                 │                                      │
       initialData / SSR HTML                no request, instant page data
```

On the server there is no browser cache, so the loader fetches through the API
(in-process, with cookies). In the browser the same loader first asks TanStack:
if the entry is fresh it returns it and **the navigation performs no data
request at all**; only a stale or cold entry is fetched, which also primes the
cache for the component that is about to mount.

`(app)/+layout.server.ts` still resolves the profile, follow graph and badge
counters with `Promise.all`. It deliberately does **not** read `url`, so
SvelteKit reuses its data across navigations instead of re-running it.

### Why tab switches used to refetch

SvelteKit re-runs a route's leaf `load` on every navigation. When all data came
from `+page.server.ts`, that meant a fresh database read and a new payload on
every Home → Explore → Tickets switch; TanStack only deduped requests the
components made *after* mount, so its cache was never in the navigation path.

Two things changed:

1. Data loads moved to `+page.ts` and consult the query cache first.
2. The organizer gate moved out of `(app)/+layout.server.ts` into
   `(app)/organizer/+layout.server.ts`. Reading `url` in the shared layout made
   its data invalid on every navigation, re-reading the profile, follow graph
   and badges each time.

The result: the `__data.json` payload for a tab is now only the (reused)
layout/auth data — ~60 bytes in the demo app — and a warm tab switch issues no
request at all.

### Detail routes follow the same rule

Every tab and sub-route is cache-first, not just the top-level ones:

| Route | Cache source |
| --- | --- |
| `/events/[slug]` | `events:<slug>` + `events:<slug>:message-request` (own endpoint, per user) |
| `/inbox/[id]` | `conversations:<id>`, `messages:<id>`, `conversations:mine` (desktop column) |
| `/tickets/[id]` | `tickets:mine` vault, refund state from `approvals:mine` |
| `/users/[handle]` | `users:<handle>` |
| `/organizer/events/[id]` | `organizer:event:<id>` (403 without an organizer identity) |
| `/organizer/scan`, `/organizer/create` | `organizer:me` + `approvals:mine` |
| `/checkout` | `events:<slug>`; gateway keys stay on the sibling `+page.server.ts` |

Three things are deliberately **not** routed through the cache:

- **`/checkout/success`** verifies the Paystack reference and mints tickets. It
  is a side effect, not a view, so it stays a server load that always redirects.
- **The event view counter** is a `POST /api/events/[slug]/view` fired from the
  page on mount. Counting a view in the load would count every tab switch.
- **The "message the organizer" state** lives under its own key. It is per-user
  and must never be baked into the shared, cacheable event payload; sending a
  request writes the new state into that key directly.

## Keys and freshness

Keys live in `src/lib/query/keys.ts`. TanStack requires arrays, so each logical
key is a single-element array (`['conversations:mine']`); prefix invalidation
matches the first segment.

| Query | Key | staleTime | Background refresh |
| --- | --- | --- | --- |
| Home feed | `events:all` | 5 min | focus / reconnect; mirrored to localStorage for 6 h |
| Explore catalogue | `events:catalogue` | 5 min | focus / reconnect; bounded 60-event pages, max 200 |
| Profile snapshot | `profile:me` | 60 s | focus / reconnect; invalidated after profile edits |
| Conversations | `conversations:mine` | 60 s | socket; 60 s poll only when no socket |
| Thread | `messages:<id>` | 60 s | socket append; 60 s poll only when no socket |
| Message requests | `message-requests:mine` | 60 s | socket; 120 s poll only when no socket |
| Notifications | `notifications:mine` | 60 s | socket; 120 s poll only when no socket |
| Badges | `badges:mine` | 60 s | socket; 60 s poll only when no socket |
| Tickets | `tickets:mine` | 15 s | focus / reconnect |
| Organizer ledger | `organizer:me` | 45 s | 120 s poll (sales are not published) |
| Organizer event manager | `organizer:event:<id>` | 45 s | refetch after each action |
| Event detail | `events:<slug>` | 60 s | focus / reconnect |
| Event message-request state | `events:<slug>:message-request` | 60 s | written after a request is sent |
| Conversation | `conversations:<id>` | 60 s | socket; 60 s poll only when no socket |
| Public profile | `users:<handle>` | 60 s | focus / reconnect |
| Approvals | `approvals:mine` | 60 s | socket; 120 s poll only when no socket |

The catalogue is also persisted under `owltside.query.v2:` so a cold PWA start
can render last visit's events while it revalidates.

## Realtime behaviour

`connectInboxSocket` opens six narrowly-scoped channels (messages, conversations,
message requests, notifications, approvals, plus read-state) authenticated with
the Supabase session. Row Level Security ensures a subscriber only receives its
own rows.

`startRealtimeSync` is mounted once, in the root layout, while a session exists.
Events are applied to the cache instead of triggering a fetch:

- **message INSERT** – appended to the open thread (deduped by id), the inbox row
  gets the new preview and `unread + 1` (peer messages only, only while the
  thread is closed), and `badges.inboxUnread` moves with it. The same message is
  forwarded to the OS notification tray; the push helper dedupes so the chat
  screen cannot double-notify.
- **notification INSERT** – prepended to the stream and `badges.unread + 1` when
  unread. Without a cached stream the key is invalidated instead.
- **conversation / message request / approval** – debounced (300 ms) prefix
  invalidation; these need data the client cannot reconstruct. The conversation
  UPDATE that trails a message insert is skipped because the local patch already
  applied it.
- **reconnect** – after a drop, active queries are invalidated once so missed
  events reconcile.

Pages no longer subscribe individually; sending a message refetches that thread
once, because the socket echo is not a delivery guarantee.

## Adding a screen

1. Add the key to `keys.ts` (never build one inline).
2. Add a `…QueryOptions(initialData)` factory in `options.ts` with its staleTime
   and poll policy.
3. Load the route data with a universal `+page.ts` using `cachedJson` /
   `cachedRequest` from `$lib/query/load.ts` — not a server load, which SvelteKit
   would re-run on every navigation. Keep `+page.server.ts` only for actions —
   or for values the browser may not compute (e.g. the Paystack public key on
   checkout, whose server load merges into the same `data`). Reading `params` or
   `url` in a universal load is fine: it only re-runs when that value changes.
4. In the page, `createAppQuery(() => ({ ...xQueryOptions(data.x), enabled: browser }))`.

After a mutation, invalidate the key **before** `update()`/`invalidateAll()` so
the re-run load cannot serve the value the action just replaced. Prefer a
targeted `queryClient.invalidate('domain:')` (or `invalidatePrefix(keyFamilies.x)`)
over `invalidateAll()`.

Plain `use:enhance` submissions are covered without extra work: `busyEnhance`
(`src/lib/utils/enhance.ts`) records a `markDataChanged()` timestamp whenever an
action succeeds or redirects, and `cachedValue` treats any entry written before
that timestamp as stale. So the load SvelteKit re-runs after the action refetches
even when the action touched a resource the screen never invalidation-listed —
which is what keeps detail pages (whose only refresh used to be `invalidateAll()`)
correct. The clock resets with the client (`queryClient.clearAll()`).

## Tests

`tests/setup.ts` clears the shared client before every case, so a mocked
response in one test cannot satisfy the next one. Use `tests/QueryProbe.svelte`
for component-level query behaviour and `tests/unit/realtime-sync.test.ts` for
the socket bridge.
