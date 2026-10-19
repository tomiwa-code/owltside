-- 018 · Organizer-scoped scanner ("terminal") PINs. Only hashes are stored.
-- Run after 001–017. Gate PINs (014) are tied to an event gate, so before an
-- organizer creates their first event there was no PIN to arm the scanner
-- with and the terminal dead-ended at a setup panel. This table holds one
-- short-lived PIN per organizer that arms the scanner in standalone mode
-- (scans then validate against tickets from all of the organizer's events).
-- It also works as the organizer's own PIN at any of their event gates;
-- gate-specific PINs from 014 stay scoped to their single gate.

create table if not exists public.organizer_scanner_tokens (
  organizer_id uuid primary key references public.profiles(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.organizer_scanner_tokens enable row level security;

drop policy if exists "Organizer manages own scanner token" on public.organizer_scanner_tokens;
create policy "Organizer manages own scanner token" on public.organizer_scanner_tokens
  for all using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid());
