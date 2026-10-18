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
  created_at timestamptz not null default now()
);
create index if not exists events_starts_at_idx on public.events (starts_at);
create index if not exists events_category_idx on public.events (category);

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

-- Events: public read, organizers manage their own
drop policy if exists events_select on public.events;
create policy events_select on public.events for select using (true);

drop policy if exists events_write on public.events;
create policy events_write on public.events for all using (auth.uid() = organizer_id) with check (auth.uid() = organizer_id);

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
      unread = case when new.sender_id <> user_id then unread + 1 else unread end
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- Atomic order creation RPC
create or replace function public.create_order(p_owner uuid, p_event_slug text, p_items jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_item jsonb;
  v_tier jsonb;
  v_total numeric := 0;
  v_qty int;
  v_order_id uuid;
  v_reference text := 'OWT-' || extract(epoch from now())::bigint::text;
  v_tickets jsonb := '[]';
  v_code text;
  v_holder text;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found then raise exception 'Event not found'; end if;

  select name into v_holder from public.profiles where id = p_owner;

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
    v_total := v_total + (v_tier->>'price')::numeric * v_qty;

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
    'tickets', v_tickets
  );
end;
$$;

grant execute on function public.create_order(uuid, text, jsonb) to authenticated;

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

insert into public.events (slug, title, category, tags, starts_at, venue, city, cover, description, organizer_id, tiers, featured, trending_rank, views_today, attendees)
values
  (
    'pulse-ai-summit-lagos', 'Pulse AI Summit Lagos', 'tech', '{AI,Summit,Networking}',
    now() + interval '9 days', 'Eko Convention Center', 'Victoria Island, Lagos',
    '{"from":"#312e81","to":"#7c3aed","icon":"brain-circuit"}',
    'A full day of applied-AI talks, live build sessions and investor office hours.',
    '11111111-1111-4111-8111-111111111111',
    '[{"id":"tier-regular","name":"Regular","price":45000,"sold":788,"capacity":800},{"id":"tier-vip","name":"VIP","price":120000,"sold":140,"capacity":200}]',
    true, null, 2310, 928
  ),
  (
    'afrobeats-sound-sunset', 'Afrobeats & Sound Sunset', 'music', '{Afrobeats,Beach}',
    now() + interval '5 days', 'Landmark Beach', 'Oniru, Lagos',
    '{"from":"#b45309","to":"#7c2d12","icon":"audio-waveform"}',
    'Golden-hour sets from Lagos'' finest selectors.',
    '22222222-2222-4222-8222-222222222222',
    '[{"id":"tier-general","name":"General","price":15000,"sold":1140,"capacity":1300},{"id":"tier-vip","name":"VIP Deck","price":40000,"sold":190,"capacity":200}]',
    false, 4, 1870, 1330
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
