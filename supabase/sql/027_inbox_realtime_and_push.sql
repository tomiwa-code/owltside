-- 027 · Realtime streaming for inbox conversations & organizer message requests.
-- Run after 001–026. Idempotent if tables are already in `supabase_realtime`.

do $$
begin
  begin
    alter publication supabase_realtime add table public.conversations;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.message_requests;
  exception when duplicate_object then
    null;
  end;
end;
$$;
