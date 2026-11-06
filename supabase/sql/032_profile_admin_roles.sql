-- 032 · Unified admin role column on public.profiles for the Owltside Admin console.
-- Run after 031. Safe to re-run.
--
-- Default role is 'user'. To bootstrap the initial Super Admin, open Supabase
-- Table Editor → public.profiles and update your profile's `role` column to
-- 'superadmin' (inputs such as 'super admin' or 'super_admin' are normalized
-- automatically). Subsequent admins are assigned from Roles & Admins in the
-- Admin console via the server-side service role.

begin;

alter table public.profiles
  add column if not exists role text not null default 'user';

-- Normalize any pre-existing values before enforcing the check constraint.
update public.profiles
set role = case
  when regexp_replace(lower(btrim(coalesce(role, ''))), '[\s_-]+', '', 'g') = 'superadmin' then 'superadmin'
  when regexp_replace(lower(btrim(coalesce(role, ''))), '[\s_-]+', '', 'g') = 'admin' then 'admin'
  else 'user'
end
where role is distinct from 'user'
  and role not in ('admin', 'superadmin');

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('user', 'admin', 'superadmin'));

create index if not exists profiles_admin_role_idx
  on public.profiles (role, created_at asc)
  where role in ('admin', 'superadmin');

-- Normalize human inputs (e.g. 'super admin' in Table Editor -> 'superadmin')
-- and prevent anon/authenticated clients from escalating or altering `role`.
-- Trusted SQL / Table Editor sessions and the Admin server (service_role) are permitted.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text;
begin
  v_norm := regexp_replace(lower(btrim(coalesce(new.role, ''))), '[\s_-]+', '', 'g');
  if v_norm = '' or v_norm = 'user' then
    new.role := 'user';
  elsif v_norm = 'admin' then
    new.role := 'admin';
  elsif v_norm = 'superadmin' then
    new.role := 'superadmin';
  end if;

  if (coalesce(auth.role(), '') in ('anon', 'authenticated')
      or (coalesce(auth.role(), '') <> 'service_role' and auth.uid() is not null))
     and pg_trigger_depth() = 1 then
    if (tg_op = 'INSERT' and new.role <> 'user')
       or (tg_op = 'UPDATE' and new.role is distinct from old.role) then
      raise exception 'Only an Owltside Super Admin can change user roles';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists guard_profile_role on public.profiles;
create trigger guard_profile_role
  before insert or update on public.profiles
  for each row execute function public.guard_profile_role();

commit;
