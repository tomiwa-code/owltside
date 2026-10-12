-- 006 · Organizer console: gate check-ins, order labels, gate config.
-- Paste after 005_seed.sql. Safe to re-run? No — run once (uses create table if not exists + guarded alters).

-- 1) Gate config on events (wizard step 4 writes this; console reads gate names).
alter table public.events add column if not exists gates jsonb not null default '[]';

-- 2) Denormalised order labels so the organizer roster/orders tab renders without extra joins.
alter table public.orders add column if not exists owner_name text not null default 'Attendee';
alter table public.orders add column if not exists items_label text not null default '';

-- 3) Check-in ledger (every scan attempt, verified / duplicate / invalid).
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  ticket_code text not null,
  holder text not null default 'Unknown pass',
  tier text not null default '',
  gate text not null default 'Gate 1',
  at timestamptz not null default now(),
  result text not null check (result in ('verified','duplicate','invalid'))
);
create index if not exists checkins_event_idx on public.checkins (event_id, at desc);

alter table public.checkins enable row level security;

-- Anyone can be shown their own scan result client-side; reads/writes are organizer-only.
create policy checkins_select_organizer on public.checkins for select
  using (
    exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );

create policy checkins_insert_organizer on public.checkins for insert
  with check (
    exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );

-- 4) Organizer visibility over tickets & orders of their own events
--    (extends 002_rls.sql, which only granted owner-scoped reads).
create policy tickets_select_organizer on public.tickets for select
  using (
    exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );

-- Gate scanners mark tickets used.
create policy tickets_update_organizer on public.tickets for update
  using (
    exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );

create policy orders_select_organizer on public.orders for select
  using (
    exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );
