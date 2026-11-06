-- 032 · Database-backed access list for the separate admin console.
-- Passwords belong to Supabase Auth (auth.users), NEVER this table.
-- Run after 031 in Supabase SQL Editor as a trusted database operator.
-- Creates the initial login admin@owltside.com / owltside-admin-2026.
-- CHANGE THIS SHARED DEFAULT PASSWORD before using the console in production.
-- Re-running preserves existing passwords, role changes and suspensions.
begin;

create table if not exists public.admin_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  role text not null default 'Read-only Auditor'
    check (role in ('Super Admin', 'Trust & Safety Lead', 'Finance & Treasury',
                    'Event Operations', 'Support Agent', 'Read-only Auditor')),
  -- Generated so a role and its actual authorization tier cannot disagree.
  tier smallint generated always as (
    case role
      when 'Super Admin' then 0
      when 'Trust & Safety Lead' then 1
      when 'Finance & Treasury' then 1
      when 'Event Operations' then 2
      when 'Support Agent' then 2
      else 3
    end
  ) stored,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.admin_accounts is
  'Admin access list. user_id references Supabase Auth; no passwords stored here. Managed by trusted operators only.';

alter table public.admin_accounts enable row level security;
-- No client policies: public app users must never read or grant admin access.
revoke all on table public.admin_accounts from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_accounts to service_role;

-- Bootstrap the requested default account in Supabase Auth, not a public
-- password column or a login bypass. This bcrypt hash (cost 12) corresponds to
-- owltside-admin-2026. A precomputed hash avoids depending on pgcrypto's schema.
-- Existing users keep their password and confirmation state; reset through
-- Supabase Auth if needed. Existing access rows are never reactivated/promoted.
do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where lower(email) = 'admin@owltside.com';

  if v_user_id is null then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current, reauthentication_token,
      created_at, updated_at
    ) values (
      v_user_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'admin@owltside.com',
      '$2b$12$nHH9BsqdcQQR3NJSabDGpepw7VmmfbmUI3VFz2aKtKGHUcK1hyvVa',
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Owltside Admin"}'::jsonb,
      '', '', '', '', '', '', now(), now()
    );

    -- GoTrue uses an email identity alongside the Auth user for password login.
    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user_id, v_user_id::text, 'email',
      jsonb_build_object('sub', v_user_id::text, 'email', 'admin@owltside.com',
                         'email_verified', true, 'phone_verified', false),
      now(), now()
    );
  else
    raise notice 'admin@owltside.com already exists; its password and email confirmation are unchanged.';
  end if;

  insert into public.admin_accounts (user_id, name, role)
  values (v_user_id, 'Owltside Admin', 'Super Admin')
  on conflict (user_id) do nothing;
end;
$$;

commit;
