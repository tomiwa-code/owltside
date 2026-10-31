-- ==============================================================================
-- OWLTSIDE · COMPLETE SUPABASE DATABASE SETUP (ALL-IN-ONE)
-- Paste this entire file into the Supabase SQL Editor and click "Run".
-- ==============================================================================

create extension if not exists pgcrypto;

-- ── 1. TABLES ─────────────────────────────────────────────────────────────────

-- Profiles (linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique,
  name text not null,
  avatar_color text not null default '#8083ff',
  avatar_url text,
  banner_url text,
  bio text,
  link text,
  city text,
  interests text[] not null default '{}',
  username_changed_at timestamptz,
  operating_identity text not null default 'attendee'
    check (operating_identity in ('attendee', 'guest', 'organizer')),
  verified boolean not null default false,
  followers integer not null default 0,
  following integer not null default 0,
  created_at timestamptz not null default now()
);

-- Events
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
  gates jsonb not null default '[]',   -- [{id,name,modes,staff}]
  faqs jsonb not null default '[]',
  policies text[] not null default '{}',
  featured boolean not null default false,
  trending_rank integer,
  views_today integer not null default 0,
  attendees integer not null default 0,
  live boolean not null default false,
  -- Moderation: organizer submissions start pending and only become public
  -- once an admin publishes them (see 022_event_moderation.sql).
  status text not null default 'pending'
    check (status in ('draft', 'pending', 'published', 'rejected', 'suspended')),
  submitted_at timestamptz,
  moderation_note text,
  moderated_at timestamptz,
  moderated_by text,
  created_at timestamptz not null default now()
);
create index if not exists events_starts_at_idx on public.events (starts_at);
create index if not exists events_category_idx on public.events (category);
create index if not exists events_status_idx on public.events (status, starts_at);

-- Event-specific organizer promo codes (kept private from public event rows)
create table if not exists public.event_promos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,23}$'),
  percent numeric(5,2) not null check (percent >= 1 and percent <= 100),
  max_uses integer not null check (max_uses >= 1 and max_uses <= 1000000),
  uses_count integer not null default 0 check (uses_count >= 0 and uses_count <= max_uses),
  created_at timestamptz not null default now(),
  unique (event_id, code)
);
create index if not exists event_promos_event_id_idx on public.event_promos (event_id);

-- Tickets (Gate passes with rotating HMAC payload)
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique,          -- EV-XXXX-XXXX-XXXX
  event_id uuid not null references public.events (id) on delete cascade,
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
create index if not exists tickets_event_idx on public.tickets (event_id);

-- Orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  owner_name text not null default 'Attendee',
  event_id uuid not null references public.events (id) on delete cascade,
  reference text not null unique,     -- Paystack reference
  total numeric not null default 0,
  items_label text not null default '',
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  gateway text not null default 'paystack',
  created_at timestamptz not null default now()
);
create index if not exists orders_owner_idx on public.orders (owner_id);
create index if not exists orders_event_idx on public.orders (event_id);

-- Order Items
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  tier_id text not null,
  qty integer not null check (qty > 0),
  unit_price numeric not null
);

-- Gate Check-in Ledger
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

-- Conversations
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  peer_id uuid not null references public.profiles (id) on delete cascade,
  last_message text not null default '',
  last_at timestamptz not null default now(),
  unread integer not null default 0,
  peer_unread integer not null default 0,
  event_id uuid references public.events (id) on delete set null,
  unique (user_id, peer_id)
);

-- Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  sent_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, sent_at);

-- Message Requests (First contact with organizer)
create table if not exists public.message_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  conversation_id uuid references public.conversations (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint message_requests_not_self check (requester_id <> organizer_id)
);
create index if not exists message_requests_organizer_pending_idx
  on public.message_requests (organizer_id, created_at desc) where status = 'pending';
create index if not exists message_requests_requester_event_idx
  on public.message_requests (requester_id, event_id, created_at desc);

-- Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'system',
  title text not null,
  body text not null,
  href text,
  at timestamptz not null default now(),
  read boolean not null default false
);
create index if not exists notifications_user_idx on public.notifications (user_id, at desc);

-- Approval requests (refunds, payouts, verification details) — see 023.
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
  created_at timestamptz not null default now(),
  constraint approval_requests_kind_check check (kind in ('refund', 'payout', 'verification')),
  constraint approval_requests_status_check check (status in ('pending', 'approved', 'rejected', 'cancelled'))
);
create index if not exists approval_requests_requester_idx
  on public.approval_requests (requester_id, created_at desc);
create index if not exists approval_requests_queue_idx
  on public.approval_requests (kind, created_at) where status = 'pending';
create unique index if not exists approval_requests_open_subject_idx
  on public.approval_requests (
    requester_id,
    kind,
    coalesce(subject_id, ''),
    coalesce(payload ->> 'check', '')
  )
  where status = 'pending' and kind in ('refund', 'verification');
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
             then 'Cancelled during schema sync — payout was already approved for this event.'
           else 'Cancelled during schema sync — duplicate pending payout request for this event.'
         end
       ),
       decided_at = coalesce(ar.decided_at, now()),
       decided_by = coalesce(ar.decided_by, 'system:schema-sync')
  from ranked_payouts rp
 where ar.id = rp.id
   and rp.rn > 1;
create unique index if not exists approval_requests_payout_open_or_approved_idx
  on public.approval_requests (
    requester_id,
    coalesce(subject_id, '')
  )
  where kind = 'payout' and status in ('pending', 'approved');

-- Profile Follows (Persistent relationship graph)
create table if not exists public.profile_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists profile_follows_following_idx on public.profile_follows(following_id);

-- ── 2. ROW-LEVEL SECURITY (RLS) ──────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.profile_follows enable row level security;
alter table public.events enable row level security;
alter table public.event_promos enable row level security;
alter table public.tickets enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.checkins enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_requests enable row level security;
alter table public.notifications enable row level security;

-- Profiles: public read, user can insert/update own profile
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (true);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert with check (auth.uid() = id);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (auth.uid() = id);

-- Profile follows: public read, authenticated user manages own follows
drop policy if exists follows_read on public.profile_follows;
create policy follows_read on public.profile_follows for select using (true);

drop policy if exists follows_insert on public.profile_follows;
create policy follows_insert on public.profile_follows for insert to authenticated with check (auth.uid() = follower_id);

drop policy if exists follows_delete on public.profile_follows;
create policy follows_delete on public.profile_follows for delete to authenticated using (auth.uid() = follower_id);

grant select on public.profile_follows to anon, authenticated;
grant insert, delete on public.profile_follows to authenticated;

-- Events: only approved listings are public; organizers also see their own
-- pending/submitted events on the organizer dashboard.
drop policy if exists events_select on public.events;
create policy events_select on public.events for select
  using (status = 'published' or organizer_id = auth.uid());

drop policy if exists events_write on public.events;
create policy events_write on public.events for all using (auth.uid() = organizer_id) with check (auth.uid() = organizer_id);

-- Organizers can submit events for review but never publish them themselves.
create or replace function public.guard_event_moderation() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() = new.organizer_id then
    if tg_op = 'INSERT' then
      if new.status not in ('draft', 'pending') then
        raise exception 'Events are published after Owltside review. Submit the event and wait for approval.'
          using errcode = '42501';
      end if;
    elsif new.status is distinct from old.status and new.status not in ('draft', 'pending') then
      raise exception 'Only an Owltside admin can publish, reject or suspend an event.'
        using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' then
    if new.status = 'pending' and new.submitted_at is null then new.submitted_at := now(); end if;
  elsif new.status = 'pending' and old.status is distinct from 'pending' then
    new.submitted_at := coalesce(new.submitted_at, now());
  end if;
  return new;
end $$;
drop trigger if exists guard_event_moderation on public.events;
create trigger guard_event_moderation before insert or update on public.events
for each row execute function public.guard_event_moderation();

-- Ticket sales are only possible for approved (published) events that have not yet ended.
create or replace function public.require_published_event_for_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_event record;
  v_end_at timestamptz;
begin
  select id, status, starts_at, ends_at into v_event
  from public.events
  where id = new.event_id;

  if v_event.id is null or v_event.status <> 'published' then
    raise exception 'This event has not been approved for sale yet' using errcode = '42501';
  end if;

  v_end_at := coalesce(
    v_event.ends_at,
    ((date_trunc('day', v_event.starts_at at time zone 'Africa/Lagos') + interval '1 day' - interval '1 millisecond') at time zone 'Africa/Lagos')
  );

  if v_end_at <= now() then
    raise exception 'This event has ended — ticket sales are closed' using errcode = '42501';
  end if;

  return new;
end $$;
drop trigger if exists require_published_event_for_order on public.orders;
create trigger require_published_event_for_order before insert on public.orders
for each row execute function public.require_published_event_for_order();

-- Event promos: only the organizer who owns the event can read/manage them.
drop policy if exists event_promos_select on public.event_promos;
create policy event_promos_select on public.event_promos for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_promos.event_id and e.organizer_id = auth.uid()));

drop policy if exists event_promos_insert on public.event_promos;
create policy event_promos_insert on public.event_promos for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_promos.event_id and e.organizer_id = auth.uid()));

drop policy if exists event_promos_update on public.event_promos;
create policy event_promos_update on public.event_promos for update to authenticated
  using (exists (select 1 from public.events e where e.id = event_promos.event_id and e.organizer_id = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = event_promos.event_id and e.organizer_id = auth.uid()));

drop policy if exists event_promos_delete on public.event_promos;
create policy event_promos_delete on public.event_promos for delete to authenticated
  using (exists (select 1 from public.events e where e.id = event_promos.event_id and e.organizer_id = auth.uid()));

-- Tickets: owner reads, event organizer reads and updates (check-in)
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select
  using (
    auth.uid() = owner_id
    or exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );

drop policy if exists tickets_update_organizer on public.tickets;
create policy tickets_update_organizer on public.tickets for update
  using (
    exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );

drop policy if exists tickets_update_owner on public.tickets;
create policy tickets_update_owner on public.tickets for update
  using (auth.uid() = owner_id)
  with check (true);

-- Orders: owner reads, event organizer reads
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select
  using (
    auth.uid() = owner_id
    or exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );

drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items for select
  using (
    exists (select 1 from public.orders o where o.id = order_id and (o.owner_id = auth.uid() or exists (select 1 from public.events e where e.id = o.event_id and e.organizer_id = auth.uid())))
  );

-- Check-ins: organizer manages check-in stream
drop policy if exists checkins_select_organizer on public.checkins;
create policy checkins_select_organizer on public.checkins for select
  using (
    exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );

drop policy if exists checkins_insert_organizer on public.checkins;
create policy checkins_insert_organizer on public.checkins for insert
  with check (
    exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())
  );

-- Conversations & Messages: participants only
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select
  using (auth.uid() in (user_id, peer_id));

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations for update
  using (auth.uid() in (user_id, peer_id));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and auth.uid() in (c.user_id, c.peer_id)
  ));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and auth.uid() in (c.user_id, c.peer_id)
    )
  );

-- Message requests: requester & organizer
drop policy if exists message_requests_select on public.message_requests;
create policy message_requests_select on public.message_requests for select
  using (auth.uid() = requester_id or auth.uid() = organizer_id);

drop policy if exists message_requests_insert on public.message_requests;
create policy message_requests_insert on public.message_requests for insert
  with check (
    auth.uid() = requester_id
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.organizer_id = message_requests.organizer_id
    )
  );

-- Notifications: owner only
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select using (auth.uid() = user_id);

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update using (auth.uid() = user_id);

drop policy if exists notifications_insert_authenticated on public.notifications;
create policy notifications_insert_authenticated on public.notifications for insert with check (auth.uid() is not null);

-- ── 3. FUNCTIONS & TRIGGERS ──────────────────────────────────────────────────

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_handle text;
  v_name text;
  v_avatar text;
begin
  v_handle := coalesce(
    new.raw_user_meta_data->>'handle',
    new.raw_user_meta_data->>'preferred_username',
    split_part(new.email, '@', 1),
    'owl-' || left(new.id::text, 6)
  );
  if exists (select 1 from public.profiles where handle = v_handle and id <> new.id) then
    v_handle := v_handle || '_' || left(new.id::text, 6);
  end if;
  v_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1),
    'Explorer'
  );
  v_avatar := coalesce(
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'picture'
  );
  -- Provider details (e.g. Google) only fill gaps: an existing name/photo is never replaced.
  insert into public.profiles (id, handle, name, avatar_url)
  values (new.id, v_handle, v_name, v_avatar)
  on conflict (id) do update set
    name = case
      when coalesce(btrim(public.profiles.name), '') = '' then excluded.name
      else public.profiles.name
    end,
    avatar_url = case
      when coalesce(btrim(public.profiles.avatar_url), '') = '' then excluded.avatar_url
      else public.profiles.avatar_url
    end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep conversation previews fresh
create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.conversations
  set last_message = new.body,
      last_at = new.sent_at,
      unread = case when new.sender_id <> user_id then unread + 1 else unread end,
      peer_unread = case when new.sender_id <> peer_id then peer_unread + 1 else peer_unread end
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- Validate one event promo code without exposing the organizer's other codes.
create or replace function public.validate_event_promo(p_event_slug text, p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text := upper(regexp_replace(btrim(coalesce(p_code, '')), '\s+', '-', 'g'));
  v_promo public.event_promos%rowtype;
begin
  if v_code = '' then return null; end if;
  select ep.* into v_promo
  from public.event_promos ep
  join public.events e on e.id = ep.event_id
  where e.slug = p_event_slug and ep.code = v_code;
  if not found then return null; end if;
  if v_promo.uses_count >= v_promo.max_uses then
    return jsonb_build_object('valid', false, 'state', 'exhausted', 'code', v_promo.code);
  end if;
  return jsonb_build_object(
    'valid', true,
    'code', v_promo.code,
    'kind', 'pct',
    'value', v_promo.percent,
    'source', 'event'
  );
end;
$$;

grant execute on function public.validate_event_promo(text, text) to anon, authenticated;

-- Atomic order creation RPC
drop function if exists public.create_order(uuid, text, jsonb);
create or replace function public.create_order(
  p_owner uuid,
  p_event_slug text,
  p_items jsonb,
  p_promo_code text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_item jsonb;
  v_tier jsonb;
  v_gross numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_qty int;
  v_order_id uuid;
  v_reference text := 'OWT-' || extract(epoch from now())::bigint::text;
  v_tickets jsonb := '[]';
  v_code text;
  v_holder text;
  v_promo_code text := upper(regexp_replace(btrim(coalesce(p_promo_code, '')), '\s+', '-', 'g'));
  v_promo public.event_promos%rowtype;
  v_has_event_promo boolean := false;
  v_promo_percent numeric;
  v_promo_flat numeric := 0;
begin
  select * into v_event from public.events where slug = p_event_slug for update;
  if not found then raise exception 'Event not found'; end if;

  select name into v_holder from public.profiles where id = p_owner;

  if v_promo_code <> '' then
    select * into v_promo
    from public.event_promos
    where event_id = v_event.id and code = v_promo_code
    for update;
    if found then
      v_has_event_promo := true;
      if v_promo.uses_count >= v_promo.max_uses then
        raise exception 'That promo code has reached its usage limit';
      end if;
      v_promo_percent := v_promo.percent;
    elsif v_promo_code = 'TECHCOMMUNITY' then
      v_promo_flat := 5000;
    elsif v_promo_code = 'OWL10' then
      v_promo_percent := 10;
    else
      raise exception 'That promo code isn''t valid for this event';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'qty')::int;
    select t into v_tier from jsonb_array_elements(v_event.tiers) t where t->>'id' = v_item->>'tierId';
    if v_tier is null then raise exception 'Unknown tier'; end if;
    v_gross := v_gross + (v_tier->>'price')::numeric * v_qty;
  end loop;

  if v_promo_percent is not null then
    v_discount := round(v_gross * v_promo_percent / 100);
  elsif v_promo_flat > 0 then
    v_discount := least(v_promo_flat, v_gross);
  end if;
  v_total := greatest(0, v_gross - v_discount);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'qty')::int;
    select t into v_tier from jsonb_array_elements(v_event.tiers) t where t->>'id' = v_item->>'tierId';
    if v_tier is null then raise exception 'Unknown tier'; end if;
    if ((v_tier->>'capacity')::int - (v_tier->>'sold')::int) < v_qty then
      raise exception 'Not enough capacity';
    end if;

    -- bump sold count inside the tiers jsonb
    v_event.tiers := (
      select jsonb_agg(
        case when t->>'id' = v_tier->>'id'
          then jsonb_set(t, '{sold}', to_jsonb((t->>'sold')::int + v_qty))
          else t end
      ) from jsonb_array_elements(v_event.tiers) t
    );
    insert into public.orders (owner_id, event_id, reference, total, status, owner_name, items_label)
    values (p_owner, v_event.id, v_reference, v_total, 'paid', coalesce(v_holder, 'Attendee'), v_qty || 'x ' || (v_tier->>'name'))
    returning id into v_order_id;

    insert into public.order_items (order_id, tier_id, qty, unit_price)
    values (v_order_id, v_tier->>'id', v_qty, (v_tier->>'price')::numeric);

    for i in 1..v_qty loop
      v_code := 'EV-' || upper(substr(md5(random()::text), 1, 4)) || '-'
                     || upper(substr(md5(random()::text), 1, 4)) || '-'
                     || upper(substr(md5(random()::text), 1, 4));
      with ins as (
        insert into public.tickets
          (owner_id, code, event_id, event_slug, event_title, event_starts_at, venue, tier_name, holder_name, price, cover)
        values
          (p_owner, v_code, v_event.id, v_event.slug, v_event.title, v_event.starts_at, v_event.venue,
           v_tier->>'name', coalesce(v_holder, 'Holder'), (v_tier->>'price')::numeric, v_event.cover)
        returning *
      )
      select v_tickets || jsonb_agg(row_to_json(ins)) into v_tickets from ins;
    end loop;
  end loop;

  update public.events
    set tiers = v_event.tiers, attendees = attendees + jsonb_array_length(v_tickets)
    where id = v_event.id;

  if v_has_event_promo then
    update public.event_promos
      set uses_count = uses_count + 1
      where id = v_promo.id and uses_count < max_uses;
    if not found then
      raise exception 'That promo code has reached its usage limit';
    end if;
  end if;

  -- Notify buyer of confirmed pass
  insert into public.notifications (user_id, kind, title, body, href)
  values (
    p_owner,
    'ticket',
    'Pass confirmed · ' || v_event.title,
    'Your gate pass (' || jsonb_array_length(v_tickets) || 'x) is ready in your Ticket Wallet.',
    '/tickets'
  );

  -- Notify event organizer of ticket sale
  if v_event.organizer_id <> p_owner then
    insert into public.notifications (user_id, kind, title, body, href)
    values (
      v_event.organizer_id,
      'event',
      'New ticket order · ' || v_event.title,
      coalesce(v_holder, 'An attendee') || ' booked ' || jsonb_array_length(v_tickets) || ' pass(es) (' || v_reference || ').',
      '/organizer/events/' || v_event.id
    );
  end if;

  return jsonb_build_object(
    'orderId', v_order_id,
    'reference', v_reference,
    'total', v_total,
    'discount', v_discount,
    'promoCode', nullif(v_promo_code, ''),
    'tickets', v_tickets
  );
end;
$$;

grant execute on function public.create_order(uuid, text, jsonb, text) to authenticated;

-- Notify organizer when a new message request is created
create or replace function public.notify_new_message_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_name text;
  v_event_title text;
begin
  select name into v_requester_name from public.profiles where id = new.requester_id;
  select title into v_event_title from public.events where id = new.event_id;

  insert into public.notifications (user_id, kind, title, body, href)
  values (
    new.organizer_id,
    'social',
    'Message request · ' || coalesce(v_event_title, 'Event'),
    coalesce(v_requester_name, 'An attendee') || ': ' || left(new.body, 120),
    '/inbox'
  );
  return new;
end;
$$;

drop trigger if exists message_requests_notify_organizer on public.message_requests;
create trigger message_requests_notify_organizer
after insert on public.message_requests
for each row execute function public.notify_new_message_request();

-- Respond to message request RPC
create or replace function public.respond_to_message_request(p_request_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.message_requests%rowtype;
  v_conversation_id uuid;
  v_organizer_name text;
  v_event_title text;
begin
  select * into v_request
  from public.message_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Message request not found';
  end if;
  if auth.uid() is null or auth.uid() <> v_request.organizer_id then
    raise exception 'Only the event organizer can respond to this request';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This message request has already been answered';
  end if;

  select name into v_organizer_name from public.profiles where id = v_request.organizer_id;
  select title into v_event_title from public.events where id = v_request.event_id;

  if p_accept then
    select id into v_conversation_id
    from public.conversations
    where (user_id = v_request.requester_id and peer_id = v_request.organizer_id)
       or (user_id = v_request.organizer_id and peer_id = v_request.requester_id)
    limit 1
    for update;

    if v_conversation_id is null then
      insert into public.conversations (user_id, peer_id, last_message, last_at, unread, event_id)
      values (v_request.requester_id, v_request.organizer_id, v_request.body, now(), 0, v_request.event_id)
      returning id into v_conversation_id;
    else
      update public.conversations
      set event_id = v_request.event_id
      where id = v_conversation_id;
    end if;

    insert into public.messages (conversation_id, sender_id, body)
    values (v_conversation_id, v_request.requester_id, v_request.body);

    update public.message_requests
    set status = 'accepted', conversation_id = v_conversation_id
    where id = p_request_id;

    insert into public.notifications (user_id, kind, title, body, href)
    values (
      v_request.requester_id,
      'social',
      'Message request accepted · ' || coalesce(v_event_title, 'Event'),
      coalesce(v_organizer_name, 'The organizer') || ' accepted your request. You can now chat directly.',
      '/inbox/' || v_conversation_id
    );
  else
    update public.message_requests
    set status = 'declined'
    where id = p_request_id;

    insert into public.notifications (user_id, kind, title, body, href)
    values (
      v_request.requester_id,
      'social',
      'Message request update · ' || coalesce(v_event_title, 'Event'),
      coalesce(v_organizer_name, 'The organizer') || ' declined your message request.',
      '/events'
    );
  end if;

  return jsonb_build_object(
    'request_id', p_request_id,
    'status', case when p_accept then 'accepted' else 'declined' end,
    'conversation_id', v_conversation_id
  );
end;
$$;

grant execute on function public.respond_to_message_request(uuid, boolean) to authenticated;

-- Speaker invite notification trigger
create or replace function public.notify_event_speaker_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_speaker jsonb;
  v_profile_id uuid;
  v_role text;
  v_organizer_name text;
begin
  select name into v_organizer_name
  from public.profiles
  where id = new.organizer_id;

  for v_speaker in
    select speaker.value
    from jsonb_array_elements(coalesce(new.speakers, '[]'::jsonb)) as speaker(value)
  loop
    if v_speaker->>'invited' is distinct from 'true'
       or v_speaker->>'displayOnly' = 'true'
       or coalesce(v_speaker->>'id', '') = '' then
      continue;
    end if;

    begin
      v_profile_id := (v_speaker->>'id')::uuid;
    exception when invalid_text_representation then
      continue;
    end;

    if v_profile_id = new.organizer_id then
      continue;
    end if;

    v_role := coalesce(nullif(v_speaker->>'role', ''), 'speaker');
    insert into public.notifications (user_id, kind, title, body, href)
    select p.id,
           'event',
           'Invitation · ' || new.title,
           coalesce(v_organizer_name, 'The organizer') || ' invited you as ' || v_role || ' for this event.',
           '/events/' || new.slug
    from public.profiles p
    where p.id = v_profile_id;
  end loop;

  return new;
end;
$$;

drop trigger if exists events_notify_speaker_invites on public.events;
create trigger events_notify_speaker_invites
after insert on public.events
for each row execute function public.notify_event_speaker_invites();

-- Speaker invite response RPC
create or replace function public.respond_to_event_speaker_invite(p_event_slug text, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_status text;
  v_can_respond boolean;
  v_speaker_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to respond to this invitation';
  end if;
  if p_accept is null then
    raise exception 'Choose whether to accept or decline the invitation';
  end if;

  select * into v_event
  from public.events
  where slug = p_event_slug
  for update;

  if not found then
    raise exception 'Event not found';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(v_event.speakers, '[]'::jsonb)) as speaker(value)
    where speaker.value->>'id' = auth.uid()::text
      and speaker.value->>'invited' = 'true'
      and coalesce(speaker.value->>'displayOnly', 'false') <> 'true'
      and coalesce(speaker.value->>'inviteStatus', 'pending') = 'pending'
  ) into v_can_respond;

  if not v_can_respond then
    raise exception 'Speaker invitation not found or already answered';
  end if;

  v_status := case when p_accept then 'accepted' else 'declined' end;

  update public.events
  set speakers = (
    select coalesce(
      jsonb_agg(
        case
          when speaker.value->>'id' = auth.uid()::text
            and speaker.value->>'invited' = 'true'
            and coalesce(speaker.value->>'displayOnly', 'false') <> 'true'
            and coalesce(speaker.value->>'inviteStatus', 'pending') = 'pending'
          then speaker.value || jsonb_build_object('inviteStatus', v_status)
          else speaker.value
        end
        order by speaker.ordinality
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(coalesce(v_event.speakers, '[]'::jsonb)) with ordinality as speaker(value, ordinality)
  )
  where id = v_event.id;

  select name into v_speaker_name from public.profiles where id = auth.uid();

  if v_event.organizer_id <> auth.uid() then
    insert into public.notifications (user_id, kind, title, body, href)
    values (
      v_event.organizer_id,
      'event',
      'Speaker invite ' || v_status || ' · ' || v_event.title,
      coalesce(v_speaker_name, 'Invited speaker') || ' ' || v_status || ' your speaker invitation.',
      '/events/' || v_event.slug
    );
  end if;

  return jsonb_build_object('event_slug', p_event_slug, 'status', v_status);
end;
$$;

grant execute on function public.respond_to_event_speaker_invite(text, boolean) to authenticated;

-- Increment event views_today RPC
create or replace function public.record_event_view(p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.events
  set views_today = views_today + 1
  where slug = p_slug;
end;
$$;

grant execute on function public.record_event_view(text) to anon, authenticated;

-- Broadcast announcement to all ticket holders of an event
create or replace function public.broadcast_to_event_holders(p_event_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_count int := 0;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_body = '' then raise exception 'Enter a message to broadcast'; end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if auth.uid() is null or auth.uid() <> v_event.organizer_id then
    raise exception 'Only the event organizer can broadcast to ticket holders';
  end if;

  with recipients as (
    select distinct owner_id
    from public.tickets
    where event_id = p_event_id and status in ('valid', 'used')
  ), inserted as (
    insert into public.notifications (user_id, kind, title, body, href)
    select r.owner_id,
           'event',
           'Announcement · ' || v_event.title,
           v_body,
           '/events/' || v_event.slug
    from recipients r
    returning id
  )
  select count(*) into v_count from inserted;

  return jsonb_build_object('sent', v_count);
end;
$$;

grant execute on function public.broadcast_to_event_holders(uuid, text) to authenticated;

-- Atomic 1-to-1 ticket transfer RPC
create or replace function public.transfer_ticket(p_ticket_id uuid, p_recipient_handle text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_sender public.profiles%rowtype;
  v_recipient public.profiles%rowtype;
  v_ticket public.tickets%rowtype;
  v_cleaned text;
  v_code text;
begin
  if v_sender_id is null then
    raise exception 'Please sign in to transfer a ticket';
  end if;

  v_cleaned := lower(btrim(regexp_replace(coalesce(p_recipient_handle, ''), '^@+', '')));
  if v_cleaned = '' then
    raise exception 'Enter a valid recipient @handle';
  end if;

  select * into v_sender from public.profiles where id = v_sender_id;

  select * into v_recipient
  from public.profiles
  where lower(handle) = v_cleaned or lower(name) = v_cleaned
  limit 1;

  if not found then
    raise exception 'No member found with handle @%', v_cleaned;
  end if;

  if v_recipient.id = v_sender_id then
    raise exception 'You cannot transfer a ticket to yourself';
  end if;

  select * into v_ticket
  from public.tickets
  where id = p_ticket_id and owner_id = v_sender_id
  for update;

  if not found then
    raise exception 'Ticket not found';
  end if;

  if v_ticket.status <> 'valid' then
    raise exception 'Only active tickets can be transferred';
  end if;

  v_code := 'EV-' || upper(substr(md5(random()::text), 1, 4)) || '-'
                  || upper(substr(md5(random()::text), 1, 4)) || '-'
                  || upper(substr(md5(random()::text), 1, 4));

  update public.tickets
  set owner_id = v_recipient.id,
      holder_name = v_recipient.name,
      code = v_code,
      status = 'valid'
  where id = p_ticket_id and owner_id = v_sender_id and status = 'valid'
  returning * into v_ticket;

  insert into public.notifications (user_id, kind, title, body, href)
  values
    (
      v_recipient.id,
      'ticket',
      'Pass Transferred · ' || v_ticket.event_title,
      'A ' || v_ticket.tier_name || ' pass for ' || v_ticket.event_title || ' has been transferred to your wallet'
        || case when v_sender.handle is not null then ' by @' || v_sender.handle else '' end || '.',
      '/tickets/' || v_ticket.id
    ),
    (
      v_sender_id,
      'ticket',
      'Pass Transferred · ' || v_ticket.event_title,
      'Your ' || v_ticket.tier_name || ' pass for ' || v_ticket.event_title || ' was transferred to @' || v_recipient.handle || '.',
      '/tickets'
    );

  return to_jsonb(v_ticket);
end;
$$;

grant execute on function public.transfer_ticket(uuid, text) to authenticated;

-- ── 4. REALTIME CONFIGURATION ────────────────────────────────────────────────

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.checkins;

-- ── 5. SEED DATA (OPTIONAL STARTER DATA) ─────────────────────────────────────

drop trigger if exists protect_follow_counts on public.profiles;
drop trigger if exists require_event_poster on public.events;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'segun@owltside.app', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"handle":"seguna","full_name":"Segun Alakija"}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'femi@owltside.app', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"handle":"femiade","full_name":"Femi Adeyemi"}', now(), now()),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'drbello@owltside.app', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"handle":"drbello","full_name":"Dr. Amina Bello"}', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, handle, name, avatar_color, verified, followers, following, bio, city)
values
  ('11111111-1111-4111-8111-111111111111', 'seguna', 'Segun Alakija', '#494bd6', true, 0, 0, 'Building the Pulse summit series.', 'Lagos'),
  ('22222222-2222-4222-8222-222222222222', 'femiade', 'Femi Adeyemi', '#10b981', true, 0, 0, 'Promoter & selector.', 'Lagos'),
  ('33333333-3333-4333-8333-333333333333', 'drbello', 'Dr. Amina Bello', '#009eb9', true, 0, 0, 'Public-health technologist.', 'Abuja')
on conflict (id) do update set
  handle = excluded.handle,
  name = excluded.name,
  avatar_color = excluded.avatar_color,
  verified = excluded.verified,
  bio = excluded.bio,
  city = excluded.city;

insert into public.events (slug, title, category, tags, starts_at, venue, city, cover, description, organizer_id, tiers, featured, trending_rank, views_today, attendees, status)
values
  (
    'pulse-ai-summit-lagos', 'Pulse AI Summit Lagos', 'tech', '{AI,Summit,Networking}',
    now() + interval '9 days', 'Eko Convention Center', 'Victoria Island, Lagos',
    '{"from":"#312e81","to":"#7c3aed","icon":"brain-circuit"}',
    'A full day of applied-AI talks, live build sessions and investor office hours.',
    '11111111-1111-4111-8111-111111111111',
    '[{"id":"tier-regular","name":"Regular","price":45000,"sold":788,"capacity":800},{"id":"tier-vip","name":"VIP","price":120000,"sold":140,"capacity":200}]',
    true, null, 2310, 928, 'published'
  ),
  (
    'afrobeats-sound-sunset', 'Afrobeats & Sound Sunset', 'music', '{Afrobeats,Beach}',
    now() + interval '5 days', 'Landmark Beach', 'Oniru, Lagos',
    '{"from":"#b45309","to":"#7c2d12","icon":"audio-waveform"}',
    'Golden-hour sets from Lagos'' finest selectors.',
    '22222222-2222-4222-8222-222222222222',
    '[{"id":"tier-general","name":"General","price":15000,"sold":1140,"capacity":1300},{"id":"tier-vip","name":"VIP Deck","price":40000,"sold":190,"capacity":200}]',
    false, 4, 1870, 1330, 'published'
  )
on conflict (slug) do nothing;

-- ── 6. FOLLOW COUNTS, EVENT POSTERS & GATE STAFF TOKENS (011–014) ──────────────────────

create or replace function public.sync_follow_counts() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
  follower uuid := case when tg_op = 'INSERT' then new.follower_id else old.follower_id end;
  followed uuid := case when tg_op = 'INSERT' then new.following_id else old.following_id end;
begin
  perform id from public.profiles where id in (follower, followed) order by id for update;
  update public.profiles set following = greatest(0, following + delta) where id = follower;
  update public.profiles set followers = greatest(0, followers + delta) where id = followed;
  return null;
end $$;

drop trigger if exists sync_follow_counts on public.profile_follows;
create trigger sync_follow_counts after insert or delete on public.profile_follows
for each row execute function public.sync_follow_counts();

update public.profiles p set
  followers = (select count(*) from public.profile_follows where following_id = p.id),
  following = (select count(*) from public.profile_follows where follower_id = p.id);

create or replace function public.protect_follow_counts() returns trigger
language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() = 1 and (new.followers <> old.followers or new.following <> old.following) then
    raise exception 'Follow counts are managed by relationships';
  end if;
  return new;
end $$;

drop trigger if exists protect_follow_counts on public.profiles;
create trigger protect_follow_counts before update on public.profiles
for each row execute function public.protect_follow_counts();

create or replace function public.require_event_poster() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(new.cover->>'src', '') !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
     or length(coalesce(new.cover->>'src', '')) < 100 then
    raise exception 'Upload a valid event flyer or poster before publishing';
  end if;
  return new;
end $$;

drop trigger if exists require_event_poster on public.events;
create trigger require_event_poster before insert on public.events
for each row execute function public.require_event_poster();


-- Generated, hashed staff PINs are scoped to an event gate.
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
create policy "Organizer manages own gate staff tokens" on public.gate_staff_tokens for all using (exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())) with check (created_by = auth.uid() and exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid()));

-- Organizer-scoped scanner ("terminal") PINs: arm the scanner even before
-- any event exists. Generated, hashed, one active PIN per organizer.
create table if not exists public.organizer_scanner_tokens (
  organizer_id uuid primary key references public.profiles(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.organizer_scanner_tokens enable row level security;
drop policy if exists "Organizer manages own scanner token" on public.organizer_scanner_tokens;
create policy "Organizer manages own scanner token" on public.organizer_scanner_tokens for all using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());

-- Shared staff scanner access: a valid gate/terminal PIN is a bearer
-- credential door staff can use from their own account, even with no events
-- of their own. These security-definer functions resolve a PIN and perform
-- check-ins without exposing the organizer's rows through RLS.
create index if not exists gate_staff_tokens_hash_idx
  on public.gate_staff_tokens (token_hash);
create index if not exists organizer_scanner_tokens_hash_idx
  on public.organizer_scanner_tokens (token_hash);

create or replace function public.resolve_staff_scan_token(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gate record;
  v_gate_count integer := 0;
  v_terminal record;
  v_terminal_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select count(*) into v_gate_count
  from public.gate_staff_tokens t
  join public.events e on e.id = t.event_id
  where t.token_hash = p_token_hash
    and t.expires_at > now()
    and exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(coalesce(e.gates, '[]'::jsonb)) = 'array' then e.gates else '[]'::jsonb end
      ) g
      where g ->> 'name' = t.gate_name
    );

  if v_gate_count > 0 then
    select t.event_id, t.gate_name, e.title as event_title, e.organizer_id
    into v_gate
    from public.gate_staff_tokens t
    join public.events e on e.id = t.event_id
    where t.token_hash = p_token_hash
      and t.expires_at > now()
      and exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(coalesce(e.gates, '[]'::jsonb)) = 'array' then e.gates else '[]'::jsonb end
        ) g
        where g ->> 'name' = t.gate_name
      )
    limit 1;
  end if;

  select count(*) into v_terminal_count
  from public.organizer_scanner_tokens t
  where t.token_hash = p_token_hash
    and t.expires_at > now();

  if v_terminal_count > 0 then
    select t.organizer_id into v_terminal
    from public.organizer_scanner_tokens t
    where t.token_hash = p_token_hash
      and t.expires_at > now()
    limit 1;
  end if;

  if v_gate_count + v_terminal_count > 1 then
    return jsonb_build_object('kind', 'ambiguous');
  end if;

  if v_gate_count = 1 then
    return jsonb_build_object(
      'kind', 'gate',
      'eventId', v_gate.event_id,
      'gate', v_gate.gate_name,
      'eventTitle', v_gate.event_title,
      'organizerId', v_gate.organizer_id
    );
  end if;

  if v_terminal_count = 1 then
    return jsonb_build_object(
      'kind', 'terminal',
      'organizerId', v_terminal.organizer_id
    );
  end if;

  return null;
end;
$$;

revoke all on function public.resolve_staff_scan_token(text) from public;
grant execute on function public.resolve_staff_scan_token(text) to authenticated;

create or replace function public.staff_check_in_ticket(
  p_event_id uuid,
  p_gate text,
  p_ticket_code text,
  p_token_hash text,
  p_simulate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_ticket public.tickets%rowtype;
  v_has_ticket boolean := false;
  v_checkin public.checkins%rowtype;
  v_code text := nullif(btrim(coalesce(p_ticket_code, '')), '');
  v_result text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(coalesce(v_event.gates, '[]'::jsonb)) = 'array' then v_event.gates else '[]'::jsonb end
    ) g
    where g ->> 'name' = p_gate
  ) then
    raise exception 'Choose a gate configured for this event';
  end if;

  if not (
    exists (
      select 1 from public.gate_staff_tokens t
      where t.event_id = p_event_id
        and t.gate_name = p_gate
        and t.token_hash = p_token_hash
        and t.expires_at > now()
    )
    or exists (
      select 1 from public.organizer_scanner_tokens t
      where t.organizer_id = v_event.organizer_id
        and t.token_hash = p_token_hash
        and t.expires_at > now()
    )
  ) then
    raise exception 'Gate PIN is invalid or expired';
  end if;

  if coalesce(p_simulate, false) then
    select * into v_ticket
    from public.tickets
    where event_id = p_event_id
    order by (status = 'valid') desc, purchased_at, id
    limit 1
    for update;
    if not found then
      raise exception 'No tickets left to scan';
    end if;
    v_has_ticket := true;
    v_code := v_ticket.code;
  else
    if v_code is null then
      raise exception 'Invalid scan request';
    end if;
    select * into v_ticket
    from public.tickets
    where event_id = p_event_id and code = v_code
    for update;
    v_has_ticket := found;
  end if;

  if not v_has_ticket then
    v_result := 'invalid';
  elsif v_ticket.status = 'used' then
    v_result := 'duplicate';
  else
    update public.tickets set status = 'used' where id = v_ticket.id;
    v_result := 'verified';
  end if;

  insert into public.checkins (event_id, ticket_code, gate, at, holder, tier, result)
  values (
    p_event_id,
    v_code,
    p_gate,
    now(),
    coalesce(v_ticket.holder_name, 'Unknown pass'),
    coalesce(v_ticket.tier_name, '—'),
    v_result
  )
  returning * into v_checkin;

  return to_jsonb(v_checkin);
end;
$$;

revoke all on function public.staff_check_in_ticket(uuid, text, text, text, boolean) from public;
grant execute on function public.staff_check_in_ticket(uuid, text, text, text, boolean) to authenticated;

create or replace function public.staff_check_in_terminal(
  p_organizer_id uuid,
  p_ticket_code text,
  p_token_hash text,
  p_simulate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
  v_has_ticket boolean := false;
  v_checkin public.checkins%rowtype;
  v_code text := nullif(btrim(coalesce(p_ticket_code, '')), '');
  v_result text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not exists (
    select 1 from public.organizer_scanner_tokens t
    where t.organizer_id = p_organizer_id
      and t.token_hash = p_token_hash
      and t.expires_at > now()
  ) then
    raise exception 'Gate PIN is invalid or expired';
  end if;

  if coalesce(p_simulate, false) then
    select tk.* into v_ticket
    from public.tickets tk
    join public.events e on e.id = tk.event_id
    where e.organizer_id = p_organizer_id
    order by (tk.status = 'valid') desc, tk.purchased_at, tk.id
    limit 1
    for update of tk;
    if not found then
      raise exception 'No tickets left to scan';
    end if;
    v_has_ticket := true;
    v_code := v_ticket.code;
  else
    if v_code is null then
      raise exception 'Invalid scan request';
    end if;
    select tk.* into v_ticket
    from public.tickets tk
    join public.events e on e.id = tk.event_id
    where e.organizer_id = p_organizer_id and tk.code = v_code
    for update of tk;
    v_has_ticket := found;
  end if;

  if not v_has_ticket then
    return jsonb_build_object(
      'id', 'ck-' || v_code,
      'event_id', null,
      'ticket_code', v_code,
      'holder', 'Unknown pass',
      'tier', '—',
      'gate', 'Terminal',
      'at', now(),
      'result', 'invalid'
    );
  end if;

  if v_ticket.status = 'used' then
    v_result := 'duplicate';
  else
    update public.tickets set status = 'used' where id = v_ticket.id;
    v_result := 'verified';
  end if;

  insert into public.checkins (event_id, ticket_code, gate, at, holder, tier, result)
  values (
    v_ticket.event_id,
    v_code,
    'Terminal',
    now(),
    coalesce(v_ticket.holder_name, 'Unknown pass'),
    coalesce(v_ticket.tier_name, '—'),
    v_result
  )
  returning * into v_checkin;

  return to_jsonb(v_checkin);
end;
$$;

revoke all on function public.staff_check_in_terminal(uuid, text, text, boolean) from public;
grant execute on function public.staff_check_in_terminal(uuid, text, text, boolean) to authenticated;

-- ── Content reports (event listings & public profiles, migration 025) ──
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
  created_at timestamptz not null default now(),
  constraint content_reports_target_type_check check (target_type in ('event', 'profile')),
  constraint content_reports_status_check check (status in ('open', 'actioned', 'dismissed')),
  constraint content_reports_details_check check (char_length(details) between 10 and 1000)
);
create index if not exists content_reports_queue_idx
  on public.content_reports (status, created_at desc);
create index if not exists content_reports_target_idx
  on public.content_reports (target_type, target_id);
create unique index if not exists content_reports_open_unique_idx
  on public.content_reports (reporter_id, target_type, target_id, category)
  where status = 'open' and reporter_id is not null;

alter table public.content_reports enable row level security;

drop policy if exists content_reports_select_own on public.content_reports;
create policy content_reports_select_own on public.content_reports for select
  using (reporter_id is not null and auth.uid() = reporter_id);

drop policy if exists content_reports_insert_any on public.content_reports;
create policy content_reports_insert_any on public.content_reports for insert
  with check (
    status = 'open'
    and reviewer_name is null
    and review_note is null
    and reviewed_at is null
    and (reporter_id is null or auth.uid() = reporter_id)
  );

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

-- ── Approval requests: RLS + decision side effects (migration 023) ──
alter table public.approval_requests enable row level security;

drop policy if exists approval_requests_select_own on public.approval_requests;
create policy approval_requests_select_own on public.approval_requests for select
  using (auth.uid() = requester_id);

drop policy if exists approval_requests_insert_own on public.approval_requests;
create policy approval_requests_insert_own on public.approval_requests for insert
  with check (auth.uid() = requester_id and status = 'pending');

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

-- ── Self-service account deletion (migration 024) ──
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in to delete your account';
  end if;

  update public.approval_requests
    set status = 'cancelled',
        decision_note = 'Cancelled — the requester deleted their account.',
        decided_at = now()
    where requester_id = uid and status = 'pending';

  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
