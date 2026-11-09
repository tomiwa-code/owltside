-- 036_egress_control.sql
--
-- Egress guardrails for the free tier.
--
-- The app was transferring 8.9 GB / 5 GB of egress with eleven monthly active
-- users. The application-level fixes live in the codebase (card-sized payloads,
-- paged queries, no per-second polling, cacheable media, CDN-friendly reads).
-- This migration is the database half of that work:
--
--   1. indexes that make the new *scoped* queries cheap (so they never fall
--      back to a sequential scan of `events`);
--   2. a single round-trip badge counter for the header;
--   3. hard limits on inline (base64) images, which are the largest single
--      payload in the schema and used to ride along in every feed/poll;
--   4. a retention helper so the notification table cannot grow forever.
--
-- Safe to run on an existing database: every statement is additive and
-- `if not exists`, constraints are added `not valid` so pre-existing rows are
-- grandfathered in, and functions are replaced idempotently.

-- ── 1. Indexes for the hot, now-scoped reads ───────────────────────────────

-- Unread badge: WHERE user_id = $1 AND read = false  (COUNT only)
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read = false;

-- Inbox list: the newest 50 threads per participant.
create index if not exists conversations_user_last_at_idx
  on public.conversations (user_id, last_at desc);
create index if not exists conversations_peer_last_at_idx
  on public.conversations (peer_id, last_at desc);

-- Thread view: newest page of a conversation (was fetching the whole thread).
create index if not exists messages_conv_sent_desc_idx
  on public.messages (conversation_id, sent_at desc);

-- Public catalogue: only published rows, ordered by start time.
create index if not exists events_published_starts_idx
  on public.events (starts_at)
  where status = 'published';

-- `speakers` is a jsonb array; profile pages look events up with
-- `.contains('speakers', [{"id": …}])`.
create index if not exists events_speakers_gin_idx
  on public.events using gin (speakers jsonb_path_ops);

-- Profile typeahead (handle / name / city ILIKE '%…%').
create index if not exists profiles_handle_lower_idx
  on public.profiles (lower(handle));

-- ── 2. Badge counters in one round trip ───────────────────────────────────

/**
 * Unread notifications + unread inbox + pending message requests for the
 * calling user. Replaces three client-side queries (and the full payloads the
 * request layout used to download on every navigation).
 */
create or replace function public.inbox_badge_counts()
returns table (unread integer, inbox_unread integer, requests integer)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as id
  ),
  notif as (
    select count(*)::int as n
    from public.notifications n, me
    where n.user_id = me.id and n.read = false
  ),
  conv as (
    select coalesce(sum(
      case when c.user_id = me.id then coalesce(c.unread, 0)
           else coalesce(c.peer_unread, 0) end
    ), 0)::int as n
    from public.conversations c, me
    where c.user_id = me.id or c.peer_id = me.id
  ),
  req as (
    select count(*)::int as n
    from public.message_requests r, me
    where r.organizer_id = me.id and r.status = 'pending'
  )
  select notif.n, conv.n + req.n, req.n from notif, conv, req;
$$;

revoke all on function public.inbox_badge_counts() from public;
grant execute on function public.inbox_badge_counts() to authenticated;

-- ── 3. Inline image size ceilings ─────────────────────────────────────────
--
-- Avatars, banners and posters may still be stored as data URLs (that keeps
-- uploads dependency-free), but a row is never allowed to smuggle a
-- multi-megabyte blob into every list response. New/updated rows are checked;
-- existing rows are grandfathered with `not valid` — re-save oversized images
-- through the profile/event editors (they are re-encoded to a small JPEG).

alter table public.profiles
  drop constraint if exists profiles_avatar_inline_size;
alter table public.profiles
  add constraint profiles_avatar_inline_size check (
    avatar_url is null
    or avatar_url not like 'data:%'
    or octet_length(avatar_url) <= 96 * 1024
  ) not valid;

alter table public.profiles
  drop constraint if exists profiles_banner_inline_size;
alter table public.profiles
  add constraint profiles_banner_inline_size check (
    banner_url is null
    or banner_url not like 'data:%'
    or octet_length(banner_url) <= 192 * 1024
  ) not valid;

alter table public.events
  drop constraint if exists events_poster_inline_size;
alter table public.events
  add constraint events_poster_inline_size check (
    cover is null
    or coalesce(cover->>'src', '') not like 'data:%'
    or octet_length(cover->>'src') <= 320 * 1024
  ) not valid;

-- ── 4. Notification retention ─────────────────────────────────────────────
--
-- Notifications are a stream, not an archive: the app renders the newest 50.
-- Schedule this daily (pg_cron) on the free tier:
--   select cron.schedule('owltside-notifications-retention', '15 3 * * *',
--                        $$select public.purge_old_notifications()$$);

create or replace function public.purge_old_notifications(retain_days integer default 120)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  -- Service-role / dashboard only: not callable by end users.
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and session_user <> 'postgres' then
    raise exception 'purge_old_notifications is a maintenance function';
  end if;
  delete from public.notifications
  where at < now() - make_interval(days => greatest(30, retain_days));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_old_notifications(integer) from public;

comment on function public.inbox_badge_counts() is
  'Header badge counters (unread notifications, unread inbox, pending requests) in one round trip.';
