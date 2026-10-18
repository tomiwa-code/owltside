-- 015 · Tie conversations to the event their message request came from.
-- Run after 001–014. The chat inbox shows an "Event Brief" per thread; before
-- this migration every thread fell back to unrelated placeholder content.

-- The event this chat is about (from the accepted message request). Nullable:
-- threads not started from an event (e.g. support) have no brief.
alter table public.conversations
  add column if not exists event_id uuid references public.events (id) on delete set null;

-- Backfill existing threads from their latest accepted message request.
update public.conversations c
set event_id = mr.event_id
from (
  select distinct on (conversation_id) conversation_id, event_id
  from public.message_requests
  where conversation_id is not null
    and status = 'accepted'
  order by conversation_id, created_at desc
) mr
where c.id = mr.conversation_id
  and c.event_id is null;

-- Respond to message request RPC: stamp the request's event onto the
-- conversation when it is created, and re-stamp it when an existing thread is
-- reused so the brief always matches the event the message was sent from.
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
