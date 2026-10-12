-- Stream chat messages + notifications to the app (Supabase Realtime).
-- Requires replica identity for UPDATE/DELETE; INSERT-only streaming works as-is.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
