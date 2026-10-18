-- 016_event_broadcast_notifications.sql
-- Organizer broadcast announcements must land in the notification hub of every
-- ticket owner (including attendees who already checked in and hold a 'used'
-- pass). Deployments that only applied 001–015 never received the broadcast RPC
-- because it shipped with 000_full_schema.sql, so this migration installs it.

alter table public.notifications add column if not exists href text;

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
