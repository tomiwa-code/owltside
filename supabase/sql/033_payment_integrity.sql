-- 033 · Payment integrity, ticket immutability and authorization hardening.
-- Run after 001–032 (or after 000_full_schema.sql). Safe to re-run.
--
-- Why this migration exists
-- -------------------------
-- Payment was enforced only in the SvelteKit checkout, while the database —
-- which is reachable from the browser with the public anon key — minted
-- `paid` orders and valid tickets with no knowledge of money at all. Any
-- signed-in user could call the order RPC directly and mint free tickets.
--
-- This migration makes the database the enforcement point:
--   * a pending order is created (and capacity reserved) by the buyer;
--   * tickets are minted ONLY by a service-role fulfilment step after the
--     gateway payment has been verified server-side, with amount and currency
--     checked against the order;
--   * a payment reference can be consumed exactly once (replays are no-ops);
--   * tickets and payout/refund amounts can no longer be edited by clients;
--   * scanner PINs are throttled, profile protection covers account status,
--     notifications can only be written for yourself, and check-in is atomic.

begin;

-- ── 1. Payment ledger ───────────────────────────────────────────────────────
-- Append-only record of money the gateway actually took. Every revenue and
-- settlement figure must come from here, never from mutable tier prices.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  order_id uuid references public.orders (id) on delete set null,
  owner_id uuid references public.profiles (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  amount_kobo bigint not null check (amount_kobo >= 0),
  currency text not null default 'NGN',
  status text not null check (status in ('success', 'failed', 'abandoned', 'reversed')),
  gateway text not null default 'paystack',
  gateway_response jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payments_order_idx on public.payments (order_id);
create index if not exists payments_event_idx on public.payments (event_id, status);
create index if not exists payments_owner_idx on public.payments (owner_id, created_at desc);

alter table public.payments enable row level security;

-- Buyers may read their own receipts. There is no client write path: rows are
-- written only by confirm_payment(), which is granted to service_role alone.
drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated
  using (owner_id = auth.uid());

revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

-- ── 2. Orders: money fields, idempotency, expiry ────────────────────────────
alter table public.orders add column if not exists amount_kobo bigint;
alter table public.orders add column if not exists currency text not null default 'NGN';
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists fulfilled_at timestamptz;
alter table public.orders add column if not exists idempotency_key text;
alter table public.orders add column if not exists event_slug text;
alter table public.orders add column if not exists expires_at timestamptz;
alter table public.orders add column if not exists promo_code text;

update public.orders
   set amount_kobo = round(total * 100)::bigint
 where amount_kobo is null;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'paid', 'failed', 'refunded', 'expired'));

-- One checkout attempt per idempotency key. Double submits and retries reuse
-- the same order/reference instead of creating a second chargeable order.
create unique index if not exists orders_idempotency_idx
  on public.orders (owner_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists orders_pending_expiry_idx
  on public.orders (expires_at)
  where status = 'pending';

create index if not exists orders_paid_event_idx
  on public.orders (event_id)
  where status = 'paid';

create index if not exists orders_reference_idx on public.orders (reference);

-- Tickets minted under an order can be retrieved exactly (idempotent fulfilment).
alter table public.tickets add column if not exists order_id uuid references public.orders (id) on delete set null;
create index if not exists tickets_order_idx on public.tickets (order_id);
create index if not exists tickets_code_idx on public.tickets (code);

-- ── 3. Scan-attempt throttling ──────────────────────────────────────────────
-- Six-digit bearer PINs need a hard ceiling on guesses. Buckets are 10-minute
-- windows per actor; the definer functions below call consume_scan_attempt().

create table if not exists public.scan_attempts (
  actor uuid not null,
  bucket bigint not null,
  count integer not null default 0 check (count >= 0),
  primary key (actor, bucket)
);

alter table public.scan_attempts enable row level security;
revoke all on public.scan_attempts from anon, authenticated;

create or replace function public.consume_scan_attempt(p_actor uuid, p_limit integer default 25)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket bigint := floor(extract(epoch from now()) / 600)::bigint;
  v_count integer;
begin
  if p_actor is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  insert into public.scan_attempts (actor, bucket, count)
  values (p_actor, v_bucket, 1)
  on conflict (actor, bucket)
    do update set count = public.scan_attempts.count + 1
  returning count into v_count;

  if v_count > greatest(1, p_limit) then
    raise exception 'Too many gate PIN attempts. Wait a few minutes and try again.'
      using errcode = '42501';
  end if;

  delete from public.scan_attempts
   where actor = p_actor and bucket < v_bucket - 144;

  return v_count;
end $$;

revoke all on function public.consume_scan_attempt(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_scan_attempt(uuid, integer) to service_role;

-- ── 4. Profile: protect account-status and username-change columns ──────────
-- `role` (032) and `verified` (030) already have guards. The same class of
-- self-service escalation existed for `disabled`, which is what the app's ban
-- check reads, and for `username_changed_at`, which enforces the 30-day
-- cooldown. Clients may still edit name/bio/city/link/interests/avatar.

create or replace function public.guard_profile_protected_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.disabled then
      raise exception 'Only an Owltside admin can disable an account';
    end if;
    return new;
  end if;

  if new.disabled is distinct from old.disabled
     or new.disabled_at is distinct from old.disabled_at
     or new.disabled_reason is distinct from old.disabled_reason then
    raise exception 'Only an Owltside admin can change account status';
  end if;

  if new.handle is distinct from old.handle then
    if new.handle is null or new.handle !~ '^[a-z0-9_]{3,24}$' then
      raise exception 'Usernames must be 3–24 characters: lowercase letters, numbers or underscores';
    end if;
    if old.username_changed_at is not null
       and now() < old.username_changed_at + interval '30 days' then
      raise exception 'Your username can only be changed once every 30 days';
    end if;
    -- The timestamp is owned by the server, never by the request payload.
    new.username_changed_at := now();
  elsif new.username_changed_at is distinct from old.username_changed_at then
    raise exception 'Username change timestamps are managed by the server';
  end if;

  return new;
end $$;

drop trigger if exists guard_profile_protected_fields on public.profiles;
create trigger guard_profile_protected_fields
  before insert or update on public.profiles
  for each row execute function public.guard_profile_protected_fields();

-- ── 5. Notifications: write only for yourself ───────────────────────────────
-- Cross-user notifications are produced by SECURITY DEFINER triggers, which
-- are unaffected by RLS. Open inserts let anyone spoof in-app alerts (and the
-- `href` they point at) for any other account.

drop policy if exists notifications_insert_authenticated on public.notifications;
drop policy if exists notifications_insert_self on public.notifications;
create policy notifications_insert_self on public.notifications
  for insert to authenticated
  with check (auth.uid() = user_id);

-- ── 6. Messages: sender must be a participant of the conversation ──────────
-- Migration 002 shipped a weaker policy than 000; re-assert the safe one so a
-- database built by the numbered migrations behaves like the consolidated one.

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and auth.uid() in (c.user_id, c.peer_id)
    )
  );

-- ── 7. Tickets are immutable to clients ────────────────────────────────────
-- The old policies let either owner or organizer update every column, so a
-- buyer could change tier, price, event or check-in status on their own pass.
-- All legitimate writes now go through SECURITY DEFINER functions (minting,
-- transfer_ticket, and the organizer/staff check-in RPCs), so table privileges
-- are revoked outright. This is enforced by PostgREST itself: without UPDATE
-- on public.tickets, a client PATCH cannot reach the table at all.

drop policy if exists tickets_update_owner on public.tickets;
drop policy if exists tickets_update_organizer on public.tickets;
create policy tickets_no_client_update on public.tickets for update to authenticated using (false) with check (false);
revoke update on public.tickets from anon, authenticated;
revoke delete on public.tickets from anon, authenticated;

-- ── 8. Organizer check-in: atomic and ownership-checked ────────────────────
-- Replaces the read-then-write pair in the app, which allowed two concurrent
-- scans to both observe `valid` and both return `verified`.

create or replace function public.organizer_check_in_ticket(
  p_event_id uuid,
  p_gate text,
  p_ticket_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := coalesce(auth.role(), '');
  v_actor_id uuid := auth.uid();
  v_event public.events%rowtype;
  v_ticket public.tickets%rowtype;
  v_checkin public.checkins%rowtype;
  v_had_ticket boolean := false;
  v_code text := nullif(btrim(coalesce(p_ticket_code, '')), '');
  v_gate text := nullif(btrim(coalesce(p_gate, '')), '');
  v_result text;
begin
  if v_actor_id is null and v_actor <> 'service_role' then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  if v_actor_id is not null then
    perform public.consume_scan_attempt(v_actor_id, 120);
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found';
  end if;

  if v_actor <> 'service_role' and v_event.organizer_id <> v_actor_id then
    raise exception 'Only the organizer can check tickets in for this event'
      using errcode = '42501';
  end if;

  if v_gate is null then
    raise exception 'Choose a gate';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(coalesce(v_event.gates, '[]'::jsonb)) = 'array' then v_event.gates else '[]'::jsonb end
    ) g
    where g ->> 'name' = v_gate
  ) then
    raise exception 'Choose a gate configured for this event';
  end if;

  if v_code is null then
    raise exception 'Invalid scan request';
  end if;

  select * into v_ticket
  from public.tickets
  where event_id = p_event_id and code = v_code
  for update;
  v_had_ticket := found;

  if not v_had_ticket then
    v_result := 'invalid';
  else
    -- Conditional update: exactly one concurrent scanner can flip the row.
    update public.tickets
       set status = 'used'
     where id = v_ticket.id and status = 'valid';

    if found then
      v_result := 'verified';
    else
      v_result := 'duplicate';
    end if;
  end if;

  insert into public.checkins (event_id, ticket_code, gate, at, holder, tier, result)
  values (
    p_event_id,
    v_code,
    v_gate,
    now(),
    case when v_had_ticket then coalesce(v_ticket.holder_name, 'Unknown pass') else 'Unknown pass' end,
    case when v_had_ticket then coalesce(v_ticket.tier_name, '—') else '—' end,
    v_result
  )
  returning * into v_checkin;

  return to_jsonb(v_checkin);
end $$;

revoke all on function public.organizer_check_in_ticket(uuid, text, text) from public, anon;
grant execute on function public.organizer_check_in_ticket(uuid, text, text) to authenticated, service_role;

-- ── 9. Staff scanner RPCs: same contracts, now throttled ───────────────────
-- These are bearer-PIN operations granted to `authenticated` (door staff sign
-- in with their own account). A 6-digit space is only safe if guesses are
-- capped, so every call consumes a per-actor attempt from section 3.

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
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Sign in required';
  end if;

  perform public.consume_scan_attempt(v_actor, 25);

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

revoke all on function public.resolve_staff_scan_token(text) from public, anon;
grant execute on function public.resolve_staff_scan_token(text) to authenticated, service_role;

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
  v_actor uuid := auth.uid();
  v_event public.events%rowtype;
  v_ticket public.tickets%rowtype;
  v_has_ticket boolean := false;
  v_checkin public.checkins%rowtype;
  v_code text := nullif(btrim(coalesce(p_ticket_code, '')), '');
  v_result text;
begin
  if v_actor is null then
    raise exception 'Sign in required';
  end if;

  perform public.consume_scan_attempt(v_actor, 120);

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
    raise exception 'Gate PIN is invalid or expired' using errcode = '42501';
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
    update public.tickets set status = 'used' where id = v_ticket.id and status = 'valid';
    v_result := case when found then 'verified' else 'duplicate' end;
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

revoke all on function public.staff_check_in_ticket(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.staff_check_in_ticket(uuid, text, text, text, boolean) to authenticated, service_role;

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
  v_actor uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_has_ticket boolean := false;
  v_checkin public.checkins%rowtype;
  v_code text := nullif(btrim(coalesce(p_ticket_code, '')), '');
  v_result text;
begin
  if v_actor is null then
    raise exception 'Sign in required';
  end if;

  perform public.consume_scan_attempt(v_actor, 120);

  if not exists (
    select 1 from public.organizer_scanner_tokens t
    where t.organizer_id = p_organizer_id
      and t.token_hash = p_token_hash
      and t.expires_at > now()
  ) then
    raise exception 'Gate PIN is invalid or expired' using errcode = '42501';
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
    update public.tickets set status = 'used' where id = v_ticket.id and status = 'valid';
    v_result := case when found then 'verified' else 'duplicate' end;
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

revoke all on function public.staff_check_in_terminal(uuid, text, text, boolean) from public, anon;
grant execute on function public.staff_check_in_terminal(uuid, text, text, boolean) to authenticated, service_role;

-- ── 10. Ticket transfer: match on handle only ──────────────────────────────
-- The old lookup was `handle = x OR name = x LIMIT 1`. Display names are
-- user-editable, so an attacker could rename themselves to a victim's handle
-- and receive tickets intended for that person.

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
  v_recent integer;
begin
  if v_sender_id is null then
    raise exception 'Please sign in to transfer a ticket';
  end if;

  v_cleaned := lower(btrim(regexp_replace(coalesce(p_recipient_handle, ''), '^@+', '')));
  if v_cleaned = '' or v_cleaned !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Enter a valid recipient @handle';
  end if;

  -- Transfers are a free way to move inventory; keep a daily ceiling.
  select count(*) into v_recent
  from public.notifications n
  where n.user_id = v_sender_id
    and n.kind = 'ticket'
    and n.title like 'Pass Transferred%'
    and n.at > now() - interval '1 day';
  if v_recent >= 25 then
    raise exception 'Too many transfers today. Contact support if you need to move more passes.';
  end if;

  select * into v_sender from public.profiles where id = v_sender_id;

  select * into v_recipient
  from public.profiles
  where lower(handle) = v_cleaned
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

  if v_ticket.event_starts_at < now() then
    raise exception 'This event has already started — passes can no longer be transferred';
  end if;

  v_code := 'EV-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-'
                  || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-'
                  || upper(substr(md5(gen_random_uuid()::text), 1, 4));

  update public.tickets
  set owner_id = v_recipient.id,
      holder_name = v_recipient.name,
      code = v_code,
      status = 'valid'
  where id = p_ticket_id and owner_id = v_sender_id and status = 'valid'
  returning * into v_ticket;

  if v_ticket.id is null then
    raise exception 'Ticket not found';
  end if;

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

revoke all on function public.transfer_ticket(uuid, text) from public, anon;
grant execute on function public.transfer_ticket(uuid, text) to authenticated, service_role;

-- ── 11. Checkout: pending order → verified fulfilment ──────────────────────

-- Release capacity held by checkouts that were abandoned.
create or replace function public.release_expired_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item record;
  v_count integer := 0;
begin
  for v_order in
    select id, event_id
      from public.orders
     where status = 'pending'
       and expires_at is not null
       and expires_at < now()
     limit 100
     for update skip locked
  loop
    for v_item in
      select tier_id, qty from public.order_items where order_id = v_order.id
    loop
      update public.events e
         set tiers = (
           select jsonb_agg(
             case when t ->> 'id' = v_item.tier_id
               then jsonb_set(t, '{sold}', to_jsonb(greatest(0, (t ->> 'sold')::int - v_item.qty)))
               else t
             end
           )
           from jsonb_array_elements(e.tiers) t
         )
       where e.id = v_order.event_id;
    end loop;

    update public.orders
       set status = 'expired'
     where id = v_order.id and status = 'pending';

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

revoke all on function public.release_expired_orders() from public, anon, authenticated;
grant execute on function public.release_expired_orders() to service_role;

-- Mint the tickets for an order that is already paid. Idempotent: a fulfilled
-- order returns the same tickets. Internal only (definer, never client-granted).
create or replace function public.mint_order_tickets(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_event public.events%rowtype;
  v_item record;
  v_tier jsonb;
  v_tickets jsonb := '[]'::jsonb;
  v_minted integer := 0;
  v_code text;
  v_holder text;
  v_i integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.fulfilled_at is not null then
    select coalesce(jsonb_agg(row_to_json(t) order by t.purchased_at, t.id), '[]'::jsonb)
      into v_tickets
      from public.tickets t
     where t.order_id = v_order.id;
    return v_tickets;
  end if;

  select * into v_event from public.events where id = v_order.event_id;
  select coalesce(nullif(btrim(name), ''), 'Holder') into v_holder
    from public.profiles where id = v_order.owner_id;

  for v_item in
    select oi.tier_id, oi.qty from public.order_items oi where oi.order_id = v_order.id
  loop
    select t into v_tier
      from jsonb_array_elements(v_event.tiers) t
     where t ->> 'id' = v_item.tier_id;

    for v_i in 1..v_item.qty loop
      v_code := 'EV-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-'
                     || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-'
                     || upper(substr(md5(gen_random_uuid()::text), 1, 4));

      insert into public.tickets (
        owner_id, code, event_id, event_slug, event_title, event_starts_at,
        venue, tier_name, holder_name, price, cover, order_id
      )
      values (
        v_order.owner_id,
        v_code,
        v_event.id,
        v_event.slug,
        v_event.title,
        v_event.starts_at,
        v_event.venue,
        coalesce(v_tier ->> 'name', 'General'),
        coalesce(v_holder, 'Holder'),
        coalesce((v_tier ->> 'price')::numeric, 0),
        v_event.cover,
        v_order.id
      );

      v_minted := v_minted + 1;
    end loop;
  end loop;

  update public.orders
     set status = 'paid',
         paid_at = coalesce(paid_at, now()),
         fulfilled_at = now()
   where id = v_order.id and status <> 'paid';

  update public.events
     set attendees = attendees + v_minted
   where id = v_event.id;

  -- Redeem the promo locked in at checkout (one order = one use).
  if nullif(btrim(coalesce(v_order.promo_code, '')), '') is not null then
    update public.event_promos
       set uses_count = uses_count + 1
     where event_id = v_order.event_id
       and code = v_order.promo_code
       and uses_count < max_uses;
  end if;

  select coalesce(jsonb_agg(row_to_json(t) order by t.purchased_at, t.id), '[]'::jsonb)
    into v_tickets
    from public.tickets t
   where t.order_id = v_order.id;

  if v_minted > 0 then
    insert into public.notifications (user_id, kind, title, body, href)
    values (
      v_order.owner_id,
      'ticket',
      'Pass confirmed · ' || v_event.title,
      'Your gate pass (' || v_minted || 'x) is ready in your Ticket Wallet.',
      '/tickets'
    );

    if v_event.organizer_id <> v_order.owner_id then
      insert into public.notifications (user_id, kind, title, body, href)
      values (
        v_event.organizer_id,
        'event',
        'New ticket order · ' || v_event.title,
        coalesce(v_holder, 'An attendee') || ' booked ' || v_minted || ' pass(es) (' || v_order.reference || ').',
        '/organizer/events/' || v_event.id
      );
    end if;
  end if;

  return v_tickets;
end $$;

revoke all on function public.mint_order_tickets(uuid) from public, anon, authenticated;
grant execute on function public.mint_order_tickets(uuid) to service_role;

-- Create a pending order and reserve capacity. The buyer is always
-- auth.uid(): there is no owner parameter to spoof.
create or replace function public.create_pending_order(
  p_event_slug text,
  p_items jsonb,
  p_promo_code text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_event public.events%rowtype;
  v_item jsonb;
  v_tier jsonb;
  v_qty int;
  v_total_qty int := 0;
  v_gross numeric := 0;
  v_discount numeric := 0;
  v_net numeric := 0;
  v_fee numeric := 0;
  v_grand numeric := 0;
  v_amount_kobo bigint := 0;
  v_order_id uuid;
  v_reference text;
  v_existing public.orders%rowtype;
  v_code text := upper(regexp_replace(btrim(coalesce(p_promo_code, '')), '\s+', '-', 'g'));
  v_promo public.event_promos%rowtype;
  v_promo_percent numeric;
  v_promo_flat numeric := 0;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_end_at timestamptz;
begin
  if v_owner is null then
    raise exception 'Sign in required to purchase tickets' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose at least one ticket';
  end if;

  -- Retries and double submits reuse the order already created for this key.
  if v_key is not null then
    select * into v_existing
      from public.orders
     where owner_id = v_owner and idempotency_key = v_key
     for update;

    if found then
      return jsonb_build_object(
        'orderId', v_existing.id,
        'reference', v_existing.reference,
        'total', v_existing.total,
        'amountKobo', v_existing.amount_kobo,
        'currency', v_existing.currency,
        'status', v_existing.status,
        'reused', true
      );
    end if;
  end if;

  -- Release inventory held by abandoned checkouts before taking more.
  perform public.release_expired_orders();

  select * into v_event from public.events where slug = p_event_slug for update;
  if not found then
    raise exception 'Event not found';
  end if;

  if v_event.status <> 'published' then
    raise exception 'This event has not been approved for sale yet' using errcode = '42501';
  end if;

  v_end_at := coalesce(
    v_event.ends_at,
    ((date_trunc('day', v_event.starts_at at time zone 'Africa/Lagos') + interval '1 day' - interval '1 millisecond') at time zone 'Africa/Lagos')
  );
  if v_end_at <= now() then
    raise exception 'This event has ended — ticket sales are closed' using errcode = '42501';
  end if;

  if v_code <> '' then
    select * into v_promo
      from public.event_promos
     where event_id = v_event.id and code = v_code
     for update;

    if found then
      if v_promo.uses_count >= v_promo.max_uses then
        raise exception 'That promo code has reached its usage limit';
      end if;
      v_promo_percent := v_promo.percent;
    elsif v_code = 'TECHCOMMUNITY' then
      v_promo_flat := 5000;
    elsif v_code = 'OWL10' then
      v_promo_percent := 10;
    else
      raise exception 'That promo code isn''t valid for this event';
    end if;
  end if;

  -- Validate quantities and price the order before writing anything.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := case
      when (v_item ->> 'qty') ~ '^[0-9]{1,2}$' then (v_item ->> 'qty')::int
      else 0
    end;
    if v_qty < 1 or v_qty > 6 then
      raise exception 'Choose between 1 and 6 tickets per order';
    end if;
    v_total_qty := v_total_qty + v_qty;

    select t into v_tier
      from jsonb_array_elements(v_event.tiers) t
     where t ->> 'id' = v_item ->> 'tierId';
    if v_tier is null then
      raise exception 'Unknown tier';
    end if;

    if (v_tier ->> 'sold')::int + v_qty > (v_tier ->> 'capacity')::int then
      raise exception 'Not enough capacity';
    end if;

    v_gross := v_gross + (v_tier ->> 'price')::numeric * v_qty;
  end loop;

  if v_total_qty > 6 then
    raise exception 'Choose between 1 and 6 tickets per order';
  end if;

  if v_promo_percent is not null then
    v_discount := round(v_gross * v_promo_percent / 100);
  elsif v_promo_flat > 0 then
    v_discount := least(v_promo_flat, v_gross);
  end if;

  -- Matches the checkout's long-standing maths: buyers pay the organiser share
  -- plus a platform fee of 5% + ₦100 per paid pass; free passes carry none.
  v_net := greatest(0, v_gross - v_discount);
  v_fee := case when v_gross <= 0 then 0 else round(v_gross * 0.05) + 100 * v_total_qty end;
  v_grand := greatest(0, v_gross + v_fee - v_discount);
  v_amount_kobo := round(v_grand * 100)::bigint;

  v_reference := 'OWT-' || upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 24));

  insert into public.orders (
    owner_id, event_id, reference, total, status, gateway,
    amount_kobo, currency, idempotency_key, event_slug, expires_at,
    owner_name, items_label, promo_code
  )
  values (
    v_owner,
    v_event.id,
    v_reference,
    v_net,
    'pending',
    'paystack',
    v_amount_kobo,
    'NGN',
    v_key,
    v_event.slug,
    now() + interval '20 minutes',
    coalesce((select name from public.profiles where id = v_owner), 'Attendee'),
    v_total_qty || ' pass(es)',
    nullif(v_code, '')
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'qty')::int;
    select t into v_tier
      from jsonb_array_elements(v_event.tiers) t
     where t ->> 'id' = v_item ->> 'tierId';

    insert into public.order_items (order_id, tier_id, qty, unit_price)
    values (v_order_id, v_tier ->> 'id', v_qty, (v_tier ->> 'price')::numeric);

    -- Reserve inventory now so two buyers cannot both take the last pass.
    v_event.tiers := (
      select jsonb_agg(
        case when t ->> 'id' = v_tier ->> 'id'
          then jsonb_set(t, '{sold}', to_jsonb((t ->> 'sold')::int + v_qty))
          else t
        end
      )
      from jsonb_array_elements(v_event.tiers) t
    );
  end loop;

  update public.events set tiers = v_event.tiers where id = v_event.id;

  return jsonb_build_object(
    'orderId', v_order_id,
    'reference', v_reference,
    'total', v_net,
    'amountKobo', v_amount_kobo,
    'currency', 'NGN',
    'discount', v_discount,
    'promoCode', nullif(v_code, ''),
    'status', 'pending',
    'reused', false
  );
end $$;

revoke all on function public.create_pending_order(text, jsonb, text, text) from public, anon;
grant execute on function public.create_pending_order(text, jsonb, text, text) to authenticated;

-- Fulfil a zero-value order (free pass or 100% promo) for its own owner.
create or replace function public.claim_free_order(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_tickets jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select * into v_order
    from public.orders
   where reference = p_reference
   for update;

  if not found or v_order.owner_id <> v_actor then
    raise exception 'Order not found' using errcode = '42501';
  end if;

  if v_order.status = 'paid' then
    select coalesce(jsonb_agg(row_to_json(t) order by t.purchased_at, t.id), '[]'::jsonb)
      into v_tickets
      from public.tickets t
     where t.order_id = v_order.id;
    return jsonb_build_object('orderId', v_order.id, 'tickets', v_tickets, 'reused', true);
  end if;

  if v_order.status <> 'pending' then
    raise exception 'This order can no longer be completed';
  end if;

  if coalesce(v_order.amount_kobo, 0) <> 0 then
    raise exception 'This order requires payment' using errcode = '42501';
  end if;

  v_tickets := public.mint_order_tickets(v_order.id);

  return jsonb_build_object('orderId', v_order.id, 'tickets', v_tickets, 'reused', false);
end $$;

revoke all on function public.claim_free_order(text) from public, anon;
grant execute on function public.claim_free_order(text) to authenticated, service_role;

-- Record a gateway payment and fulfil its order exactly once.
-- service_role only: the caller must already have verified the gateway
-- signature (webhook) or the transaction API response (redirect).
create or replace function public.confirm_payment(
  p_reference text,
  p_amount_kobo bigint,
  p_currency text default 'NGN',
  p_gateway_response jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_tickets jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the payment service can confirm a payment' using errcode = '42501';
  end if;

  if p_reference is null or btrim(p_reference) = '' then
    raise exception 'Payment reference is required';
  end if;

  -- Serialise concurrent confirmations (redirect + webhook) on the order row.
  select * into v_order from public.orders where reference = p_reference for update;
  if not found then
    raise exception 'Unknown order reference';
  end if;

  -- A reference can be consumed exactly once.
  select * into v_payment from public.payments where reference = p_reference;
  if found then
    if v_payment.status = 'success' and v_payment.order_id is not null then
      v_tickets := public.mint_order_tickets(v_payment.order_id);
      return jsonb_build_object(
        'ok', v_payment.status = 'success',
        'duplicate', true,
        'orderId', v_payment.order_id,
        'tickets', v_tickets
      );
    end if;
    return jsonb_build_object('ok', false, 'duplicate', true, 'orderId', v_order.id, 'tickets', '[]'::jsonb);
  end if;

  if coalesce(p_amount_kobo, 0) <> coalesce(v_order.amount_kobo, -1)
     or upper(coalesce(p_currency, 'NGN')) <> coalesce(v_order.currency, 'NGN') then
    -- The gateway took a different amount than the order asked for. Never
    -- mint on a mismatch: record it for reconciliation/refund.
    insert into public.payments (
      reference, order_id, owner_id, event_id, amount_kobo, currency, status, gateway, gateway_response, paid_at
    )
    values (
      p_reference, v_order.id, v_order.owner_id, v_order.event_id,
      greatest(0, coalesce(p_amount_kobo, 0)), upper(coalesce(p_currency, 'NGN')),
      'failed', 'paystack', coalesce(p_gateway_response, '{}'::jsonb), now()
    );
    update public.orders set status = 'failed' where id = v_order.id and status = 'pending';
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch', 'orderId', v_order.id, 'tickets', '[]'::jsonb);
  end if;

  insert into public.payments (
    reference, order_id, owner_id, event_id, amount_kobo, currency, status, gateway, gateway_response, paid_at
  )
  values (
    p_reference, v_order.id, v_order.owner_id, v_order.event_id,
    coalesce(p_amount_kobo, 0), upper(coalesce(p_currency, 'NGN')),
    'success', 'paystack', coalesce(p_gateway_response, '{}'::jsonb), now()
  );

  v_tickets := public.mint_order_tickets(v_order.id);

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'orderId', v_order.id,
    'tickets', v_tickets
  );
end $$;

revoke all on function public.confirm_payment(text, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_payment(text, bigint, text, jsonb) to service_role;

-- Buyer-initiated reconciliation for the redirect flow: the server has already
-- verified the transaction with Paystack, so record it and mint once.
create or replace function public.confirm_paid_order(
  p_reference text,
  p_amount_kobo bigint,
  p_currency text default 'NGN'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
begin
  if v_actor is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select * into v_order from public.orders where reference = p_reference for update;
  if not found or v_order.owner_id <> v_actor then
    raise exception 'Order not found' using errcode = '42501';
  end if;

  if v_order.status = 'paid' then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'orderId', v_order.id,
      'tickets', public.mint_order_tickets(v_order.id)
    );
  end if;

  if coalesce(p_amount_kobo, 0) <> coalesce(v_order.amount_kobo, -1)
     or upper(coalesce(p_currency, 'NGN')) <> coalesce(v_order.currency, 'NGN') then
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch', 'orderId', v_order.id, 'tickets', '[]'::jsonb);
  end if;

  if exists (select 1 from public.payments p where p.reference = p_reference) then
    return jsonb_build_object('ok', false, 'reason', 'already_used', 'orderId', v_order.id, 'tickets', '[]'::jsonb);
  end if;

  insert into public.payments (
    reference, order_id, owner_id, event_id, amount_kobo, currency, status, gateway, gateway_response, paid_at
  )
  values (
    p_reference, v_order.id, v_order.owner_id, v_order.event_id,
    coalesce(p_amount_kobo, 0), upper(coalesce(p_currency, 'NGN')),
    'success', 'paystack', '{}'::jsonb, now()
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'orderId', v_order.id,
    'tickets', public.mint_order_tickets(v_order.id)
  );
end $$;

revoke all on function public.confirm_paid_order(text, bigint, text) from public, anon;
grant execute on function public.confirm_paid_order(text, bigint, text) to authenticated, service_role;

-- ── 12. Retire the unrestricted order RPC ──────────────────────────────────
-- It accepted the buyer's id as a parameter, had no payment linkage, and was
-- executable by any signed-in user through PostgREST.

-- The only minting entry points are the two below; the legacy RPC is gone.
-- (020 already replaced the 3-argument version, so only this one remains.)
revoke all on function public.create_order(uuid, text, jsonb, text) from public, anon, authenticated;
drop function if exists public.create_order(uuid, text, jsonb, text);

-- ── 13. Approval amounts are computed, not supplied ───────────────────────

create or replace function public.event_payable_amount(p_event_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gross numeric := 0;
  v_refunds numeric := 0;
  v_payouts numeric := 0;
begin
  if p_event_id is null then
    return 0;
  end if;

  -- Only money the gateway actually took counts as revenue.
  select coalesce(sum(o.total), 0)
    into v_gross
    from public.orders o
    join public.payments p on p.order_id = o.id and p.status = 'success'
   where o.event_id = p_event_id;

  select coalesce(sum(t.price), 0)
    into v_refunds
    from public.approval_requests a
    join public.tickets t on t.id::text = a.subject_id
   where a.kind = 'refund'
     and a.status = 'approved'
     and t.event_id = p_event_id;

  select coalesce(sum(a.amount), 0)
    into v_payouts
    from public.approval_requests a
   where a.kind = 'payout'
     and a.status = 'approved'
     and a.subject_id = p_event_id::text;

  return greatest(0, v_gross - v_refunds - v_payouts);
end $$;

revoke all on function public.event_payable_amount(uuid) from public, anon, authenticated;
grant execute on function public.event_payable_amount(uuid) to service_role;

create or replace function public.guard_money_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
  v_payable numeric;
  v_latest_status text;
begin
  if coalesce(auth.role(), '') = 'service_role' or auth.uid() is null or tg_op <> 'INSERT' then
    return new;
  end if;

  if new.kind = 'refund' then
    select * into v_ticket from public.tickets where id::text = coalesce(new.subject_id, '');
    if not found then
      raise exception 'Ticket not found';
    end if;
    if v_ticket.owner_id <> new.requester_id then
      raise exception 'You can only refund your own ticket';
    end if;
    if v_ticket.status <> 'valid' then
      raise exception 'Only active tickets can be refunded';
    end if;
    -- The refund value is the immutable ticket price, never a request field.
    new.amount := v_ticket.price;
    new.subject_id := v_ticket.id::text;
    new.subject_label := coalesce(new.subject_label, v_ticket.code);
  elsif new.kind = 'payout' then
    -- Payouts require an approved payout account.
    select status into v_latest_status
      from public.approval_requests
     where requester_id = new.requester_id
       and kind = 'verification'
       and payload ->> 'check' = 'payoutAccount'
     order by created_at desc, id desc
     limit 1;

    if v_latest_status is distinct from 'approved' then
      raise exception 'Verify your payout account before requesting a payout';
    end if;

    v_payable := public.event_payable_amount(nullif(btrim(coalesce(new.subject_id, '')), '')::uuid);
    if v_payable <= 0 then
      raise exception 'There is no cleared balance to pay out yet';
    end if;
    -- The requested amount is advisory; the server amount wins.
    new.amount := round(v_payable, 2);
  end if;

  return new;
end $$;

drop trigger if exists guard_money_request on public.approval_requests;
create trigger guard_money_request
  before insert on public.approval_requests
  for each row execute function public.guard_money_request();

-- ── 14. Promo usage cannot be reset by the organizer ──────────────────────

create or replace function public.guard_event_promo_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and auth.uid() is not null
     and pg_trigger_depth() = 1 then
    if new.uses_count is distinct from old.uses_count then
      new.uses_count := old.uses_count;
    end if;
    if new.max_uses < old.uses_count then
      raise exception 'A promo code cannot have fewer uses than it has already redeemed';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_event_promo_usage on public.event_promos;
create trigger guard_event_promo_usage
  before update on public.event_promos
  for each row execute function public.guard_event_promo_usage();

commit;
