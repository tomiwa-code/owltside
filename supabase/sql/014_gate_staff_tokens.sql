-- 014 · Short-lived staff authorization PINs for event gates. Only hashes are stored.
create table if not exists public.gate_staff_tokens (
  event_id uuid not null references public.events(id) on delete cascade,
  gate_name text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, gate_name)
);

alter table public.gate_staff_tokens enable row level security;

drop policy if exists "Organizer manages own gate staff tokens" on public.gate_staff_tokens;
create policy "Organizer manages own gate staff tokens" on public.gate_staff_tokens
  for all using (
    exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  ) with check (
    created_by = auth.uid() and exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );
