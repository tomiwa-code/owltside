-- Owltside schema — paste into the Supabase SQL editor in order (001 → 005).
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique,
  name text not null,
  avatar_color text not null default '#8083ff',
  avatar_url text,
  bio text,
  link text,
  city text,
  verified boolean not null default false,
  followers integer not null default 0,
  following integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null,
  tags text[] not null default '{}',
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue text not null,
  city text not null,
  cover jsonb not null,
  description text not null default '',
  organizer_id uuid not null references public.profiles (id),
  speakers jsonb not null default '[]',
  agenda jsonb not null default '[]',
  tiers jsonb not null default '[]',   -- [{id,name,price,sold,capacity,benefits}]
  faqs jsonb not null default '[]',
  policies text[] not null default '{}',
  featured boolean not null default false,
  trending_rank integer,
  views_today integer not null default 0,
  attendees integer not null default 0,
  live boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists events_starts_at_idx on public.events (starts_at);
create index if not exists events_category_idx on public.events (category);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique,          -- EV-XXXX-XXXX-XXXX
  event_id uuid not null references public.events (id),
  event_slug text not null,
  event_title text not null,
  event_starts_at timestamptz not null,
  venue text not null,
  tier_name text not null,
  holder_name text not null,
  status text not null default 'valid' check (status in ('valid','used','refunded','transferred')),
  purchased_at timestamptz not null default now(),
  price numeric not null default 0,
  cover jsonb not null
);
create index if not exists tickets_owner_idx on public.tickets (owner_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  event_id uuid not null references public.events (id),
  reference text not null unique,     -- Paystack reference
  total numeric not null default 0,
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  gateway text not null default 'paystack',
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  tier_id text not null,
  qty integer not null check (qty > 0),
  unit_price numeric not null
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  peer_id uuid not null references public.profiles (id) on delete cascade,
  last_message text not null default '',
  last_at timestamptz not null default now(),
  unread integer not null default 0,
  unique (user_id, peer_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  body text not null,
  sent_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, sent_at);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'system',
  title text not null,
  body text not null,
  at timestamptz not null default now(),
  read boolean not null default false
);
