-- 022 · Event moderation queue.
--
-- Organizer submissions now land as `pending` and only become publicly visible
-- after an Owltside admin publishes them. Admin writes happen with the Supabase
-- service-role key (see admin/src/lib/server/moderation.ts), which bypasses RLS
-- and the owner guard below.
--
-- Safe to re-run.

-- 1) Review columns. The DO block only backfills the pre-existing catalogue,
--    so re-running this file never publishes events that are genuinely pending.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'status'
  ) then
    alter table public.events add column status text not null default 'pending';
    -- Everything in the catalogue at install time predates moderation: keep it live.
    update public.events set status = 'published';
  end if;
end $$;

alter table public.events add column if not exists status text not null default 'pending';
alter table public.events add column if not exists submitted_at timestamptz;
alter table public.events add column if not exists moderation_note text;
alter table public.events add column if not exists moderated_at timestamptz;
alter table public.events add column if not exists moderated_by text;

alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('draft', 'pending', 'published', 'rejected', 'suspended'));

create index if not exists events_status_idx on public.events (status, starts_at);
create index if not exists events_review_queue_idx
  on public.events (submitted_at) where status = 'pending';

-- 2) Public reads: approved listings plus an organizer's own events (so the
--    organizer dashboard can show pending submissions immediately).
drop policy if exists events_select on public.events;
create policy events_select on public.events for select
  using (status = 'published' or organizer_id = auth.uid());

-- 3) Organizers manage their own events, but cannot self-publish. RLS keeps the
--    row scope; the trigger below guards the status transition, because a
--    published event must still stay editable by its owner.
drop policy if exists events_write on public.events;
create policy events_write on public.events for all
  using (auth.uid() = organizer_id)
  with check (auth.uid() = organizer_id);

create or replace function public.guard_event_moderation() returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- auth.uid() is null for the service role (admin console) and for migrations.
  if auth.uid() is not null and auth.uid() = new.organizer_id then
    if tg_op = 'INSERT' then
      if new.status not in ('draft', 'pending') then
        raise exception 'Events are published after Owltside review. Submit the event and wait for approval.'
          using errcode = '42501';
      end if;
    elsif new.status is distinct from old.status
      and new.status not in ('draft', 'pending') then
      raise exception 'Only an Owltside admin can publish, reject or suspend an event.'
        using errcode = '42501';
    end if;
  end if;

  -- Stamp the submission time the first time an event enters the queue.
  if tg_op = 'INSERT' then
    if new.status = 'pending' and new.submitted_at is null then
      new.submitted_at := now();
    end if;
  elsif new.status = 'pending' and old.status is distinct from 'pending' then
    new.submitted_at := coalesce(new.submitted_at, now());
  end if;

  return new;
end $$;

drop trigger if exists guard_event_moderation on public.events;
create trigger guard_event_moderation before insert or update on public.events
for each row execute function public.guard_event_moderation();

-- 4) Pending events must not be purchasable even if a client calls create_order
--    directly with a slug it already knows. The checkout RPC is SECURITY DEFINER,
--    so guard at the orders table where every checkout path has to land.
create or replace function public.require_published_event_for_order() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.events e where e.id = new.event_id and e.status = 'published'
  ) then
    raise exception 'This event has not been approved for sale yet'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists require_published_event_for_order on public.orders;
create trigger require_published_event_for_order before insert on public.orders
for each row execute function public.require_published_event_for_order();

comment on column public.events.status is
  'draft | pending | published | rejected | suspended — only published events appear in public feeds.';
