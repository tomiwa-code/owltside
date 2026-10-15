-- Row Level Security
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.tickets enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- profiles: everyone can read, owner updates/inserts themselves
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (auth.uid() = id);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert with check (auth.uid() = id);

-- events: public read; organisers manage their own
drop policy if exists events_select on public.events;
create policy events_select on public.events for select using (true);
drop policy if exists events_write on public.events;
create policy events_write on public.events for all using (auth.uid() = organizer_id);

-- tickets: owner only
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select using (auth.uid() = owner_id);
drop policy if exists tickets_update_owner on public.tickets;
create policy tickets_update_owner on public.tickets for update using (auth.uid() = owner_id) with check (true);

-- orders: owner only (writes happen through the create_order RPC with SECURITY DEFINER)
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select using (auth.uid() = owner_id);
drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.owner_id = auth.uid()));

-- conversations & messages: participants only
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
  with check (auth.uid() = sender_id);

-- notifications: owner only
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select using (auth.uid() = user_id);
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update using (auth.uid() = user_id);
drop policy if exists notifications_insert_authenticated on public.notifications;
create policy notifications_insert_authenticated on public.notifications for insert with check (auth.uid() is not null);
