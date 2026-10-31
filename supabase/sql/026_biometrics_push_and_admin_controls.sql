-- 026 · Biometric WebAuthn credentials, Web Push subscriptions, account disablement, and event cascade cleanup.
-- Run after 001–025. Safe to re-run.

-- 1) Account status columns on public.profiles so disabled accounts are enforced at RLS as well as GoTrue ban_duration.
alter table public.profiles
  add column if not exists disabled boolean not null default false,
  add column if not exists disabled_reason text,
  add column if not exists disabled_at timestamptz;

-- 2) Ensure event deletion cleanly cascades tickets, orders, and message requests.
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public' and table_name = 'tickets' and constraint_name = 'tickets_event_id_fkey'
  ) then
    alter table public.tickets drop constraint tickets_event_id_fkey;
    alter table public.tickets
      add constraint tickets_event_id_fkey
      foreign key (event_id) references public.events (id) on delete cascade;
  end if;

  if exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public' and table_name = 'orders' and constraint_name = 'orders_event_id_fkey'
  ) then
    alter table public.orders drop constraint orders_event_id_fkey;
    alter table public.orders
      add constraint orders_event_id_fkey
      foreign key (event_id) references public.events (id) on delete cascade;
  end if;

  if exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public' and table_name = 'message_requests' and constraint_name = 'message_requests_event_id_fkey'
  ) then
    alter table public.message_requests drop constraint message_requests_event_id_fkey;
    alter table public.message_requests
      add constraint message_requests_event_id_fkey
      foreign key (event_id) references public.events (id) on delete cascade;
  end if;
end $$;

-- 3) WebAuthn platform biometric credentials (phone fingerprint / Face ID).
create table if not exists public.biometric_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  algorithm integer not null default -7,
  counter bigint not null default 0,
  device_label text not null default 'Biometric Passkey',
  transports text[] not null default '{internal}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists biometric_credentials_user_idx
  on public.biometric_credentials (user_id, created_at desc);

alter table public.biometric_credentials enable row level security;

drop policy if exists biometric_credentials_select_own on public.biometric_credentials;
create policy biometric_credentials_select_own on public.biometric_credentials
  for select using (user_id = auth.uid());

drop policy if exists biometric_credentials_insert_own on public.biometric_credentials;
create policy biometric_credentials_insert_own on public.biometric_credentials
  for insert with check (user_id = auth.uid());

drop policy if exists biometric_credentials_update_own on public.biometric_credentials;
create policy biometric_credentials_update_own on public.biometric_credentials
  for update using (user_id = auth.uid());

drop policy if exists biometric_credentials_delete_own on public.biometric_credentials;
create policy biometric_credentials_delete_own on public.biometric_credentials
  for delete using (user_id = auth.uid());

-- 4) Web Push subscriptions (W3C Push API / VAPID endpoints for phone OS notifications).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id, updated_at desc);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
