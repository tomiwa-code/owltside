-- 013 · Atomic 1-to-1 ticket transfer with rotated QR code and notifications.

alter table public.notifications add column if not exists href text;

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

revoke all on function public.transfer_ticket(uuid, text) from public;
grant execute on function public.transfer_ticket(uuid, text) to authenticated;
