-- Real relationships are the source of truth; old seeded counters are not relationships.
create table if not exists public.profile_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists profile_follows_following_idx on public.profile_follows(following_id);
alter table public.profile_follows enable row level security;
drop policy if exists follows_read on public.profile_follows;
create policy follows_read on public.profile_follows for select using (true);
drop policy if exists follows_insert on public.profile_follows;
create policy follows_insert on public.profile_follows for insert to authenticated with check (auth.uid() = follower_id);
drop policy if exists follows_delete on public.profile_follows;
create policy follows_delete on public.profile_follows for delete to authenticated using (auth.uid() = follower_id);
grant select on public.profile_follows to anon, authenticated;
grant insert, delete on public.profile_follows to authenticated;

create or replace function public.sync_follow_counts() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
  follower uuid := case when tg_op = 'INSERT' then new.follower_id else old.follower_id end;
  followed uuid := case when tg_op = 'INSERT' then new.following_id else old.following_id end;
begin
  -- Lock in deterministic order to avoid deadlocks for reciprocal follows.
  perform id from public.profiles where id in (follower, followed) order by id for update;
  update public.profiles set following = greatest(0, following + delta) where id = follower;
  update public.profiles set followers = greatest(0, followers + delta) where id = followed;
  return null;
end $$;
drop trigger if exists sync_follow_counts on public.profile_follows;
create trigger sync_follow_counts after insert or delete on public.profile_follows
for each row execute function public.sync_follow_counts();

drop trigger if exists protect_follow_counts on public.profiles;
update public.profiles p set
  followers = (select count(*) from public.profile_follows where following_id = p.id),
  following = (select count(*) from public.profile_follows where follower_id = p.id);

-- Clients may edit their identity but not manufacture follower counts.
create or replace function public.protect_follow_counts() returns trigger
language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() = 1 and (new.followers <> old.followers or new.following <> old.following) then
    raise exception 'Follow counts are managed by relationships';
  end if;
  return new;
end $$;
drop trigger if exists protect_follow_counts on public.profiles;
create trigger protect_follow_counts before update on public.profiles
for each row execute function public.protect_follow_counts();
