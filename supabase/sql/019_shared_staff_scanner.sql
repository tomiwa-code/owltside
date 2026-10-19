-- 019 · Shared staff scanner access.
-- Run after 001–018. Gate PINs (014) and terminal PINs (018) are meant to be
-- handed to door staff, but verification was bound to the issuing organizer's
-- account: a helper signed into their own account (with no events of their
-- own) always got "PIN invalid or expired", because RLS hides the organizer's
-- token rows, tickets, and check-in ledger from everyone but the organizer.
-- These security-definer functions let any signed-in user who presents a
-- valid PIN resolve what it unlocks and check tickets in under it. The PIN
-- itself is the credential; issuing/rotating PINs stays organizer-only.

create index if not exists gate_staff_tokens_hash_idx
  on public.gate_staff_tokens (token_hash);
create index if not exists organizer_scanner_tokens_hash_idx
  on public.organizer_scanner_tokens (token_hash);

-- Resolve a PIN hash to the single scanner context it unlocks. Returns
-- {kind:'ambiguous'} when the same 6-digit code is active in more than one
-- place (new PINs are generated to avoid this; rotate to clear a clash).
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
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

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

revoke all on function public.resolve_staff_scan_token(text) from public;
grant execute on function public.resolve_staff_scan_token(text) to authenticated;

-- Check one ticket in at a specific event gate under a staff PIN. Accepts
-- that gate's own PIN or the event organizer's terminal PIN.
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
  v_event public.events%rowtype;
  v_ticket public.tickets%rowtype;
  v_has_ticket boolean := false;
  v_checkin public.checkins%rowtype;
  v_code text := nullif(btrim(coalesce(p_ticket_code, '')), '');
  v_result text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

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
    raise exception 'Gate PIN is invalid or expired';
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
    update public.tickets set status = 'used' where id = v_ticket.id;
    v_result := 'verified';
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

revoke all on function public.staff_check_in_ticket(uuid, text, text, text, boolean) from public;
grant execute on function public.staff_check_in_ticket(uuid, text, text, text, boolean) to authenticated;

-- Check one ticket in under an organizer's terminal PIN, resolving the code
-- against tickets from all of that organizer's events. Unknown codes return
-- the same invalid verdict shape as a gated scan without writing a check-in
-- (there is no event to attach one to).
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
  v_ticket public.tickets%rowtype;
  v_has_ticket boolean := false;
  v_checkin public.checkins%rowtype;
  v_code text := nullif(btrim(coalesce(p_ticket_code, '')), '');
  v_result text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if not exists (
    select 1 from public.organizer_scanner_tokens t
    where t.organizer_id = p_organizer_id
      and t.token_hash = p_token_hash
      and t.expires_at > now()
  ) then
    raise exception 'Gate PIN is invalid or expired';
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
    update public.tickets set status = 'used' where id = v_ticket.id;
    v_result := 'verified';
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

revoke all on function public.staff_check_in_terminal(uuid, text, text, boolean) from public;
grant execute on function public.staff_check_in_terminal(uuid, text, text, boolean) to authenticated;
