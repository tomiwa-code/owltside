-- Read-only troubleshooting for the separate admin login.
-- Run in Supabase SQL Editor in the SAME project configured on the admin host.
-- Does not reveal password hashes, reset passwords, or grant/restore access.
-- If admin_accounts does not exist, apply migration 032 first.
-- If you changed the work email, replace the email filter below with the new one.
-- No rows: that Auth email does not exist in this project.
select
  u.id as auth_user_id,
  u.email,
  u.email_confirmed_at is not null as email_confirmed,
  coalesce(u.encrypted_password <> '', false) as password_configured,
  exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  ) as email_identity_present,
  a.user_id is not null as admin_access_present,
  a.is_active as admin_access_active,
  a.role,
  a.tier
from auth.users u
left join public.admin_accounts a on a.user_id = u.id
where lower(u.email) = 'admin@owltside.com';
