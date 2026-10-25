-- 023 · Approval requests (refunds, payouts, verification details).
--
-- Anything that needs an administrator decision is written here as `pending` by
-- the public app and only changes state in the admin console
-- (admin/src/routes/api/approvals/[id]/decision). Admin writes use the Supabase
-- service-role key, which bypasses RLS and the status guard below.
--
-- Safe to re-run.

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  status text not null default 'pending',
  title text not null,
  summary text not null default '',
  amount numeric(12, 2),
  subject_id text,
  subject_label text,
  payload jsonb not null default '{}'::jsonb,
  decision_note text,
  decided_at timestamptz,
  decided_by text,
  created_at timestamptz not null default now()
);

alter table public.approval_requests drop constraint if exists approval_requests_kind_check;
alter table public.approval_requests add constraint approval_requests_kind_check
  check (kind in ('refund', 'payout', 'verification'));

alter table public.approval_requests drop constraint if exists approval_requests_status_check;
alter table public.approval_requests add constraint approval_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'cancelled'));

create index if not exists approval_requests_requester_idx
  on public.approval_requests (requester_id, created_at desc);

-- Reviewer queue: pending rows, oldest first.
create index if not exists approval_requests_queue_idx
  on public.approval_requests (kind, created_at) where status = 'pending';

-- One open request per subject (a ticket, a verification check) so a request
-- cannot be queued twice. Payouts are guarded by subject too: one open payout
-- per event/balance. Rejected or approved rows do not block a new request.
create unique index if not exists approval_requests_open_subject_idx
  on public.approval_requests (
    requester_id,
    kind,
    coalesce(subject_id, ''),
    coalesce(payload ->> 'check', '')
  )
  where status = 'pending' and kind in ('refund', 'verification');

alter table public.approval_requests enable row level security;

-- 1) Owners only: the public app reads exactly its own requests.
drop policy if exists approval_requests_select_own on public.approval_requests;
create policy approval_requests_select_own on public.approval_requests for select
  using (auth.uid() = requester_id);

-- 2) Owners may file a request, but never as already-decided.
drop policy if exists approval_requests_insert_own on public.approval_requests;
create policy approval_requests_insert_own on public.approval_requests for insert
  with check (auth.uid() = requester_id and status = 'pending');

-- 3) No client updates or deletes: only the admin console (service role)
--    decides, so users cannot approve their own refunds or verification.

-- 4) Guard the writable columns even for owners.
create or replace function public.guard_approval_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.requester_id <> auth.uid() then
    raise exception 'You can only submit your own approval requests';
  end if;
  if tg_op = 'UPDATE' and new.status <> old.status and auth.uid() is not null then
    raise exception 'Only an Owltside admin can decide an approval request';
  end if;
  return new;
end $$;

drop trigger if exists guard_approval_request on public.approval_requests;
create trigger guard_approval_request
  before insert or update on public.approval_requests
  for each row execute function public.guard_approval_request();

-- 5) Refund approval settles the pass. The ticket stays `valid` (and scan-able)
--    while the request is pending; this trigger flips it once approved.
create or replace function public.apply_approved_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'refund' and new.status = 'approved' and new.subject_id is not null then
    update public.tickets
      set status = 'refunded'
      where id::text = new.subject_id and status = 'valid';
  end if;
  return new;
end $$;

drop trigger if exists apply_approved_refund on public.approval_requests;
create trigger apply_approved_refund
  after update on public.approval_requests
  for each row
  when (new.status = 'approved' and old.status is distinct from 'approved')
  execute function public.apply_approved_refund();

-- 6) Keep the requester informed when a decision lands.
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
        when 'payout' then '/organizer'
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
