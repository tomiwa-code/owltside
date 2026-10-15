-- Auto-create a profile on signup
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
  insert into public.profiles (id, handle, name, avatar_url)
  values (new.id, v_handle, v_name, v_avatar)
  on conflict (id) do update set
    name = coalesce(excluded.name, public.profiles.name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
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

-- Atomic order creation: checks capacity, mints tickets, returns the wallet payload.
-- p_items: [{ "tierId": "tier-vip", "qty": 2 }]
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

  return jsonb_build_object(
    'orderId', v_order_id,
    'reference', v_reference,
    'total', v_total,
    'tickets', v_tickets
  );
end;
$$;
