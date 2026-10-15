-- Legacy seed artwork may remain readable. All NEW events must have an uploaded poster.
-- The server decodes/re-encodes the image before inserting; this is an additional DB guard.
create or replace function public.require_event_poster() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(new.cover->>'src', '') !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
     or length(coalesce(new.cover->>'src', '')) < 100 then
    raise exception 'Upload a valid event flyer or poster before publishing';
  end if;
  return new;
end $$;
drop trigger if exists require_event_poster on public.events;
create trigger require_event_poster before insert on public.events
for each row execute function public.require_event_poster();
