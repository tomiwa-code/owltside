-- 028_close_ended_events.sql
-- Enforce at the database trigger layer that ticket orders cannot be minted once
-- an event reaches its end date and time (or end of its event date in WAT when
-- ends_at is null).

create or replace function public.require_published_event_for_order() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_end_at timestamptz;
begin
  select id, status, starts_at, ends_at into v_event
  from public.events
  where id = new.event_id;

  if v_event.id is null or v_event.status <> 'published' then
    raise exception 'This event has not been approved for sale yet'
      using errcode = '42501';
  end if;

  v_end_at := coalesce(
    v_event.ends_at,
    ((date_trunc('day', v_event.starts_at at time zone 'Africa/Lagos') + interval '1 day' - interval '1 millisecond') at time zone 'Africa/Lagos')
  );

  if v_end_at <= now() then
    raise exception 'This event has ended — ticket sales are closed'
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists require_published_event_for_order on public.orders;
create trigger require_published_event_for_order before insert on public.orders
for each row execute function public.require_published_event_for_order();
