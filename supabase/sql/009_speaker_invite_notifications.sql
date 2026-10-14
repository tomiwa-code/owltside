-- 009 · Notify selected Owltside profiles when an organizer publishes an event.
-- Plain-name/display-only speakers are deliberately excluded.

alter table public.notifications add column if not exists href text;

create or replace function public.notify_event_speaker_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_speaker jsonb;
  v_profile_id uuid;
  v_role text;
  v_organizer_name text;
begin
  select name into v_organizer_name
  from public.profiles
  where id = new.organizer_id;

  for v_speaker in
    select speaker.value
    from jsonb_array_elements(coalesce(new.speakers, '[]'::jsonb)) as speaker(value)
  loop
    if v_speaker->>'invited' is distinct from 'true'
       or v_speaker->>'displayOnly' = 'true'
       or coalesce(v_speaker->>'id', '') = '' then
      continue;
    end if;

    begin
      v_profile_id := (v_speaker->>'id')::uuid;
    exception when invalid_text_representation then
      continue;
    end;

    if v_profile_id = new.organizer_id then
      continue;
    end if;

    v_role := coalesce(nullif(v_speaker->>'role', ''), 'speaker');
    insert into public.notifications (user_id, kind, title, body, href)
    select p.id,
           'event',
           'Speaker invitation · ' || new.title,
           coalesce(v_organizer_name, 'The organizer') || ' invited you as ' || v_role || ' for this event.',
           '/events/' || new.slug
    from public.profiles p
    where p.id = v_profile_id;
  end loop;

  return new;
end;
$$;

drop trigger if exists events_notify_speaker_invites on public.events;
create trigger events_notify_speaker_invites
after insert on public.events
for each row execute function public.notify_event_speaker_invites();
