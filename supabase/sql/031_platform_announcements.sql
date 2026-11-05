-- 031 · Platform-wide announcements sent by the separate admin console.
-- Run after 030. Safe to re-run. One service-role-only RPC atomically stores
-- the send record and creates an unread notification for every public profile.

begin;

create table if not exists public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  recipient_count integer not null check (recipient_count >= 0),
  sent_by text not null check (char_length(btrim(sent_by)) between 1 and 160),
  sent_at timestamptz not null default clock_timestamp()
);

create index if not exists platform_announcements_sent_at_idx
  on public.platform_announcements (sent_at desc);

-- This is an admin delivery log, not a public content table. Public users only
-- read their own fanned-out row in public.notifications under the existing RLS.
alter table public.platform_announcements enable row level security;
revoke all on table public.platform_announcements from public, anon, authenticated;
grant select on table public.platform_announcements to service_role;

create or replace function public.send_platform_announcement(
  p_title text,
  p_body text,
  p_sent_by text
)
returns table (
  announcement_id uuid,
  title text,
  body text,
  recipient_count integer,
  sent_by text,
  sent_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := btrim(p_title);
  v_body text := btrim(p_body);
  v_announcement public.platform_announcements%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only an Owltside admin can send a platform announcement';
  end if;
  if v_title is null or v_title = '' or char_length(v_title) > 100 then
    raise exception 'Announcement title must contain between 1 and 100 characters';
  end if;
  if v_body is null or v_body = '' or char_length(v_body) > 2000 then
    raise exception 'Announcement message must contain between 1 and 2000 characters';
  end if;
  if nullif(btrim(p_sent_by), '') is null or char_length(btrim(p_sent_by)) > 160 then
    raise exception 'Admin actor is required';
  end if;

  insert into public.notifications (user_id, kind, title, body)
  select
    profile.id,
    'announcement',
    'Announcement · ' || v_title,
    v_body
  from public.profiles profile;

  -- Use the actual fan-out count so concurrent profile changes cannot make the
  -- delivery log disagree with the number of notifications written.
  get diagnostics v_announcement.recipient_count = row_count;
  insert into public.platform_announcements (title, body, recipient_count, sent_by)
  values (v_title, v_body, v_announcement.recipient_count, btrim(p_sent_by))
  returning * into v_announcement;

  return query
  select
    v_announcement.id,
    v_announcement.title,
    v_announcement.body,
    v_announcement.recipient_count,
    v_announcement.sent_by,
    v_announcement.sent_at;
end $$;

revoke all on function public.send_platform_announcement(text, text, text)
  from public, anon, authenticated;
grant execute on function public.send_platform_announcement(text, text, text)
  to service_role;

commit;
