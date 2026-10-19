-- 020 · Event-specific organizer promo codes.
-- Run after 001–019. The event wizard collected promo codes only into its
-- browser draft, so buyer checkout could never recognize them. Promo
-- definitions now live in a private table: organizers can manage their own
-- rows, while buyers validate one entered code through a security-definer
-- RPC that returns only that code's discount. `create_order` revalidates and
-- redeems the code atomically with the paid order.

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

create index if not exists event_promos_event_id_idx
  on public.event_promos (event_id);

alter table public.event_promos enable row level security;

drop policy if exists event_promos_select on public.event_promos;
create policy event_promos_select on public.event_promos
  for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_promos.event_id and e.organizer_id = auth.uid()
    )
  );

drop policy if exists event_promos_insert on public.event_promos;
create policy event_promos_insert on public.event_promos
  for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_promos.event_id and e.organizer_id = auth.uid()
    )
  );

drop policy if exists event_promos_update on public.event_promos;
create policy event_promos_update on public.event_promos
  for update to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_promos.event_id and e.organizer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_promos.event_id and e.organizer_id = auth.uid()
    )
  );

drop policy if exists event_promos_delete on public.event_promos;
create policy event_promos_delete on public.event_promos
  for delete to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_promos.event_id and e.organizer_id = auth.uid()
    )
  );

-- Validate one buyer-entered code without exposing the organizer's other
-- codes. Returns null for an unknown code and an explicit exhausted state
-- for a code that belongs to this event but has no purchases left.
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
  if v_code = '' then
    return null;
  end if;

  select ep.* into v_promo
  from public.event_promos ep
  join public.events e on e.id = ep.event_id
  where e.slug = p_event_slug and ep.code = v_code;

  if not found then
    return null;
  end if;

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

-- Replace the original three-argument order RPC with a backward-compatible
-- version whose promo argument defaults to null. The event and promo rows
-- are locked for the transaction so capacity and max promo purchases cannot
-- be oversold by concurrent checkouts.
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

  -- Price the whole order before inserting it so the stored order total is
  -- the discounted amount, not the pre-promo subtotal.
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

  -- One completed order consumes one promo use, regardless of ticket qty.
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
