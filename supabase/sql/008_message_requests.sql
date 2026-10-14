-- 008 · First-contact requests for organizers.
-- Run after 001–007. New conversations and their initial request message are
-- created atomically only after the event organizer accepts the request.

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
create unique index if not exists message_requests_active_unique
  on public.message_requests (event_id, requester_id) where status in ('pending', 'accepted');

alter table public.message_requests enable row level security;

drop policy if exists message_requests_select on public.message_requests;
create policy message_requests_select on public.message_requests for select
  using (auth.uid() = requester_id or auth.uid() = organizer_id);

drop policy if exists message_requests_insert on public.message_requests;
create policy message_requests_insert on public.message_requests for insert
  with check (
    auth.uid() = message_requests.requester_id
    and exists (
      select 1 from public.events e
      where e.id = message_requests.event_id
        and e.organizer_id = message_requests.organizer_id
    )
  );

-- Messages may only be added by a participant to an existing conversation.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and auth.uid() in (c.user_id, c.peer_id)
    )
  );

create or replace function public.respond_to_message_request(p_request_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.message_requests%rowtype;
  v_conversation_id uuid;
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

  if p_accept then
    -- Reuse a prior conversation in either participant ordering if one exists.
    select id into v_conversation_id
    from public.conversations
    where (user_id = v_request.requester_id and peer_id = v_request.organizer_id)
       or (user_id = v_request.organizer_id and peer_id = v_request.requester_id)
    limit 1
    for update;

    if v_conversation_id is null then
      insert into public.conversations (user_id, peer_id, last_message, last_at, unread)
      values (v_request.requester_id, v_request.organizer_id, v_request.body, now(), 0)
      returning id into v_conversation_id;
    end if;

    insert into public.messages (conversation_id, sender_id, body)
    values (v_conversation_id, v_request.requester_id, v_request.body);

    update public.message_requests
    set status = 'accepted', conversation_id = v_conversation_id
    where id = p_request_id;
  else
    update public.message_requests
    set status = 'declined'
    where id = p_request_id;
  end if;

  return jsonb_build_object(
    'request_id', p_request_id,
    'status', case when p_accept then 'accepted' else 'declined' end,
    'conversation_id', v_conversation_id
  );
end;
$$;

revoke all on function public.respond_to_message_request(uuid, boolean) from public;
grant execute on function public.respond_to_message_request(uuid, boolean) to authenticated;
