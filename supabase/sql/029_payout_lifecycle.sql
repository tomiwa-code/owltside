-- 029 · Organizer payout request lifecycle & closed-event enforcement.
--
-- 1. Backfills `subject_id` from `payload ->> 'eventId'` on legacy payout rows
--    and cancels duplicate `pending` / `approved` payout rows per
--    `(requester_id, coalesce(subject_id, ''))` — keeping the most recent
--    `approved` row when any payout was already approved, otherwise the newest
--    `pending` row — so creating `approval_requests_payout_open_or_approved_idx`
--    succeeds cleanly on databases with pre-existing payout history.
-- 2. Enforces that organizer payout requests (`kind = 'payout'`) can only be
--    submitted for owned, approved events whose end timestamp (or WAT end of
--    start date) has passed.
-- 3. Enforces at the database layer that a payout request cannot be submitted
--    again while pending OR once approved (`approval_requests_payout_open_or_approved_idx`).
-- 4. Routes payout decision notifications directly to `/organizer?tab=past` and
--    publishes `public.approval_requests` to `supabase_realtime` so organizer
--    dashboards reflect Approved / Denied decisions live.
--
-- Safe to re-run.

-- 1) Normalize/backfill `subject_id` on legacy payout rows before deduplicating.
update public.approval_requests
   set subject_id = coalesce(
         nullif(btrim(subject_id), ''),
         nullif(btrim(payload ->> 'eventId'), '')
       )
 where kind = 'payout'
   and subject_id is distinct from coalesce(
         nullif(btrim(subject_id), ''),
         nullif(btrim(payload ->> 'eventId'), '')
       );

-- 2) Cancel duplicate open/approved payout rows per (requester_id, subject_id)
--    before creating the partial unique index. Any approved row always wins
--    over pending/older duplicates; otherwise the most recent pending row wins.
with ranked_payouts as (
  select
    id,
    first_value(status) over (
      partition by requester_id, coalesce(subject_id, '')
      order by
        case when status = 'approved' then 0 else 1 end asc,
        coalesce(decided_at, created_at) desc,
        created_at desc,
        id desc
    ) as kept_status,
    row_number() over (
      partition by requester_id, coalesce(subject_id, '')
      order by
        case when status = 'approved' then 0 else 1 end asc,
        coalesce(decided_at, created_at) desc,
        created_at desc,
        id desc
    ) as rn
  from public.approval_requests
  where kind = 'payout'
    and status in ('pending', 'approved')
)
update public.approval_requests ar
   set status = 'cancelled',
       decision_note = coalesce(
         nullif(ar.decision_note, ''),
         case
           when rp.kept_status = 'approved'
             then 'Cancelled during migration 029 — payout was already approved for this event.'
           else 'Cancelled during migration 029 — duplicate pending payout request for this event.'
         end
       ),
       decided_at = coalesce(ar.decided_at, now()),
       decided_by = coalesce(ar.decided_by, 'system:migration-029')
  from ranked_payouts rp
 where ar.id = rp.id
   and rp.rn > 1;

create unique index if not exists approval_requests_payout_open_or_approved_idx
  on public.approval_requests (
    requester_id,
    coalesce(subject_id, '')
  )
  where kind = 'payout' and status in ('pending', 'approved');

create or replace function public.guard_approval_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_end_ts timestamptz;
begin
  if auth.uid() is not null and new.requester_id <> auth.uid() then
    raise exception 'You can only submit your own approval requests';
  end if;
  if tg_op = 'UPDATE' and new.status <> old.status and auth.uid() is not null then
    raise exception 'Only an Owltside admin can decide an approval request';
  end if;
  if tg_op = 'INSERT' and new.kind = 'payout' then
    new.subject_id := nullif(btrim(new.subject_id), '');
    if new.subject_id is null then
      raise exception 'Choose a closed event to request a payout for';
    end if;
    select id, organizer_id, status, starts_at, ends_at
      into v_event
      from public.events
      where id::text = new.subject_id and organizer_id = new.requester_id;
    if v_event.id is null then
      raise exception 'Event not found';
    end if;
    v_end_ts := coalesce(
      v_event.ends_at,
      ((v_event.starts_at at time zone 'Africa/Lagos')::date + time '23:59:59.999')
        at time zone 'Africa/Lagos'
    );
    if coalesce(v_event.status, 'published') <> 'published' or v_end_ts > now() then
      raise exception 'Payout can only be requested after the event closes';
    end if;
    if exists (
      select 1
      from public.approval_requests ar
      where ar.requester_id = new.requester_id
        and ar.kind = 'payout'
        and ar.subject_id = new.subject_id
        and ar.status = 'approved'
    ) then
      raise exception 'Payout has already been approved for this event and cannot be requested again';
    end if;
    if exists (
      select 1
      from public.approval_requests ar
      where ar.requester_id = new.requester_id
        and ar.kind = 'payout'
        and ar.subject_id = new.subject_id
        and ar.status = 'pending'
    ) then
      raise exception 'A payout request is already awaiting approval for this event';
    end if;
  end if;
  if tg_op = 'UPDATE'
     and new.kind = 'payout'
     and new.status = 'approved'
     and old.status is distinct from 'approved'
  then
    if exists (
      select 1
      from public.approval_requests ar
      where ar.id <> new.id
        and ar.requester_id = new.requester_id
        and ar.kind = 'payout'
        and coalesce(ar.subject_id, '') = coalesce(new.subject_id, '')
        and ar.status = 'approved'
    ) then
      raise exception 'Payout has already been approved for this event';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_approval_request on public.approval_requests;
create trigger guard_approval_request
  before insert or update on public.approval_requests
  for each row execute function public.guard_approval_request();

create or replace function public.notify_approval_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('approved', 'rejected') and old.status = 'pending' then
    insert into public.notifications (user_id, kind, title, body, href)
    values (
      new.requester_id,
      'system',
      case when new.status = 'approved' then 'Approved · ' else 'Declined · ' end || new.title,
      coalesce(nullif(new.decision_note, ''), case when new.status = 'approved'
        then 'Your request was approved by the Owltside review team.'
        else 'Your request was declined by the Owltside review team.' end),
      case new.kind
        when 'refund' then '/tickets/' || coalesce(new.subject_id, '')
        when 'payout' then '/organizer?tab=past'
        else '/settings'
      end
    );
  end if;
  return new;
end $$;

drop trigger if exists notify_approval_decision on public.approval_requests;
create trigger notify_approval_decision
  after update on public.approval_requests
  for each row
  when (new.status in ('approved', 'rejected') and old.status = 'pending')
  execute function public.notify_approval_decision();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'approval_requests'
     )
  then
    alter publication supabase_realtime add table public.approval_requests;
  end if;
end $$;
