-- 010 · Let an invited profile accept or decline its event role.
-- Accepted roles are kept in the event's speaker JSON for public profiles.

create or replace function public.respond_to_event_speaker_invite(p_event_slug text, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_status text;
  v_can_respond boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in to respond to this invitation';
  end if;
  if p_accept is null then
    raise exception 'Choose whether to accept or decline the invitation';
  end if;

  select * into v_event
  from public.events
  where slug = p_event_slug
  for update;

  if not found then
    raise exception 'Event not found';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(v_event.speakers, '[]'::jsonb)) as speaker(value)
    where speaker.value->>'id' = auth.uid()::text
      and speaker.value->>'invited' = 'true'
      and coalesce(speaker.value->>'displayOnly', 'false') <> 'true'
      and coalesce(speaker.value->>'inviteStatus', 'pending') = 'pending'
  ) into v_can_respond;

  if not v_can_respond then
    raise exception 'Speaker invitation not found or already answered';
  end if;

  v_status := case when p_accept then 'accepted' else 'declined' end;

  update public.events
  set speakers = (
    select coalesce(
      jsonb_agg(
        case
          when speaker.value->>'id' = auth.uid()::text
            and speaker.value->>'invited' = 'true'
            and coalesce(speaker.value->>'displayOnly', 'false') <> 'true'
            and coalesce(speaker.value->>'inviteStatus', 'pending') = 'pending'
          then speaker.value || jsonb_build_object('inviteStatus', v_status)
          else speaker.value
        end
        order by speaker.ordinality
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(coalesce(v_event.speakers, '[]'::jsonb)) with ordinality as speaker(value, ordinality)
  )
  where id = v_event.id;

  return jsonb_build_object('event_slug', p_event_slug, 'status', v_status);
end;
$$;

revoke all on function public.respond_to_event_speaker_invite(text, boolean) from public;
grant execute on function public.respond_to_event_speaker_invite(text, boolean) to authenticated;
