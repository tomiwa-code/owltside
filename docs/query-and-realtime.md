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

SvelteKit server loads still run first. Their payload is passed to the screen and
becomes the query's `initialData`, with `initialDataUpdatedAt` set to load time.
That is the main load-time win: the browser paints server HTML and then *does
not* repeat those requests on mount.

```
+layout.server.ts ─┐
+page.server.ts   ─┴─► page.data ─► createAppQuery(() => …QueryOptions(page.data.x))
                                             │
                                   initialData + staleTime
                                             ▼
                                    shared QueryClient
                                             ▲
                          WebSocket patches ─┘ (messages, notifications, badges)
```

`(app)/+layout.server.ts` resolves the profile, follow graph and badge counters
with `Promise.all`, so navigation pays one parallel round trip rather than three
serial ones.

## Keys and freshness

Keys live in `src/lib/query/keys.ts`. TanStack requires arrays, so each logical
key is a single-element array (`['conversations:mine']`); prefix invalidation
matches the first segment.

| Query | Key | staleTime | Background refresh |
| --- | --- | --- | --- |
| Event catalogue | `events:all` | 5 min | focus / reconnect; mirrored to localStorage for 6 h |
| Conversations | `conversations:mine` | 60 s | socket; 60 s poll only when no socket |
| Thread | `messages:<id>` | 60 s | socket append; 60 s poll only when no socket |
| Message requests | `message-requests:mine` | 60 s | socket; 120 s poll only when no socket |
| Notifications | `notifications:mine` | 60 s | socket; 120 s poll only when no socket |
| Badges | `badges:mine` | 60 s | socket; 60 s poll only when no socket |
| Tickets | `tickets:mine` | 15 s | focus / reconnect |
| Organizer ledger | `organizer:me` | 45 s | 120 s poll (sales are not published) |
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
3. In the page, `createAppQuery(() => ({ ...xQueryOptions(data.x), enabled: browser }))`.
4. If it is a list the server already loads, pass that payload so hydration does
   not refetch.

After a mutation, prefer a targeted `queryClient.invalidate('domain:')` (or
`invalidatePrefix(keyFamilies.x)`) over `invalidateAll()`.

## Tests

`tests/setup.ts` clears the shared client before every case, so a mocked
response in one test cannot satisfy the next one. Use `tests/QueryProbe.svelte`
for component-level query behaviour and `tests/unit/realtime-sync.test.ts` for
the socket bridge.
