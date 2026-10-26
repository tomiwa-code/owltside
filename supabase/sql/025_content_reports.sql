-- 025 · Content reports (event listings & public profiles).
--
-- Anyone using the public app can flag an event listing or a profile. A report
-- lands as `open` and is only ever reviewed in the admin console
-- (admin/src/lib/server/reports.ts, which uses the service-role key). No client
-- can read other people's reports, update a report, or action the target.
--
-- Safe to re-run.

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id text not null,
  target_label text not null default '',
  category text not null,
  details text not null,
  reporter_id uuid references auth.users (id) on delete set null,
  status text not null default 'open',
  reviewer_name text,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.content_reports drop constraint if exists content_reports_target_type_check;
alter table public.content_reports add constraint content_reports_target_type_check
  check (target_type in ('event', 'profile'));

alter table public.content_reports drop constraint if exists content_reports_status_check;
alter table public.content_reports add constraint content_reports_status_check
  check (status in ('open', 'actioned', 'dismissed'));

alter table public.content_reports drop constraint if exists content_reports_details_check;
alter table public.content_reports add constraint content_reports_details_check
  check (char_length(details) between 10 and 1000);

create index if not exists content_reports_queue_idx
  on public.content_reports (status, created_at desc);

create index if not exists content_reports_target_idx
  on public.content_reports (target_type, target_id);

-- One open report per reporter + target + category. Guests (reporter_id null)
-- are de-duplicated by the API instead, because there is no identity to key on.
create unique index if not exists content_reports_open_unique_idx
  on public.content_reports (reporter_id, target_type, target_id, category)
  where status = 'open' and reporter_id is not null;

alter table public.content_reports enable row level security;

-- 1) A reporter can see the report they filed (so the app can say "already
--    reported"); nobody else can read the queue from a client.
drop policy if exists content_reports_select_own on public.content_reports;
create policy content_reports_select_own on public.content_reports for select
  using (reporter_id is not null and auth.uid() = reporter_id);

-- 2) Anyone (signed in or guest) may file a report, always as `open`.
drop policy if exists content_reports_insert_any on public.content_reports;
create policy content_reports_insert_any on public.content_reports for insert
  with check (
    status = 'open'
    and reviewer_name is null
    and review_note is null
    and reviewed_at is null
    and (reporter_id is null or auth.uid() = reporter_id)
  );

-- 3) No update or delete policies: only the admin console (service role)
--    reviews reports and records the outcome.

-- 4) Guard against a client spoofing someone else's identity on insert.
create or replace function public.guard_content_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.reporter_id is not null and new.reporter_id <> auth.uid() then
    raise exception 'You can only submit a report as yourself';
  end if;
  return new;
end $$;

drop trigger if exists guard_content_report on public.content_reports;
create trigger guard_content_report
  before insert on public.content_reports
  for each row execute function public.guard_content_report();

-- 5) Tell the reporter their report was received (guests get no notification).
create or replace function public.notify_report_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reporter_id is not null then
    insert into public.notifications (user_id, kind, title, body, href)
    values (
      new.reporter_id,
      'system',
      'Report received',
      'Thanks — our trust & safety team is reviewing the reported '
        || case new.target_type when 'event' then 'event listing' else 'user profile' end
        || '.',
      case new.target_type when 'event' then '/explore' else '/home' end
    );
  end if;
  return new;
end $$;

drop trigger if exists notify_report_received on public.content_reports;
create trigger notify_report_received
  after insert on public.content_reports
  for each row execute function public.notify_report_received();
