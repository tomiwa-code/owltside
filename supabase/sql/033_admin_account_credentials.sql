-- 033 · Edit admin login credentials directly in public.admin_accounts.
-- Run as a trusted database operator after 032. Safe to re-run.
-- work_email is editable. security_password is WRITE-ONLY: enter a new password
-- and save; the trigger hashes it in Auth and replaces the input with NULL.
-- No confirmation email is sent: this is a privileged operator credential reset.
begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.admin_accounts
  add column if not exists work_email text,
  add column if not exists security_password text,
  add column if not exists session_version integer not null default 1;

update public.admin_accounts a
set work_email = lower(btrim(u.email))
from auth.users u
where u.id = a.user_id and a.work_email is null;

alter table public.admin_accounts alter column work_email set not null;
create unique index if not exists admin_accounts_work_email_idx
  on public.admin_accounts (lower(work_email));

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.admin_accounts'::regclass
                   and conname = 'admin_accounts_password_write_only') then
    alter table public.admin_accounts
      add constraint admin_accounts_password_write_only check (security_password is null);
  end if;
end;
$$;

create or replace function public.sync_admin_account_credentials()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_auth auth.users%rowtype;
  v_email_changed boolean;
  v_password_changed boolean := new.security_password is not null;
  v_hash text;
  v_crypto_schema text;
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'An admin Auth user ID cannot be changed; provision a separate account instead.';
  end if;

  select * into v_auth from auth.users where id = new.user_id for update;
  if not found then
    raise exception 'Create the Supabase Auth user before granting admin access.';
  end if;

  if (tg_op = 'INSERT' and new.work_email is null)
     or (tg_op = 'UPDATE' and new.work_email is not distinct from old.work_email) then
    -- A name/role-only edit must not undo an email changed through Auth.
    new.work_email := v_auth.email;
  end if;
  new.work_email := lower(btrim(new.work_email));
  if new.work_email is null or char_length(new.work_email) > 254
     or new.work_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid work email address.';
  end if;

  v_email_changed := new.work_email is distinct from lower(v_auth.email);
  if exists (select 1 from auth.users
             where lower(email) = new.work_email and id <> new.user_id) then
    raise exception 'That work email address belongs to another Auth user.';
  end if;

  if v_password_changed then
    -- bcrypt only considers the first 72 bytes; reject truncation, not silently
    -- a different password. Never include the supplied value in exceptions.
    if char_length(new.security_password) < 16
       or octet_length(new.security_password) > 72
       or btrim(new.security_password) = '' then
      raise exception 'Security password must be at least 16 characters and at most 72 bytes.';
    end if;
    -- pgcrypto can already be installed in public or extensions. Resolve its
    -- actual namespace instead of trusting a caller-controlled search_path.
    select n.nspname into v_crypto_schema
      from pg_extension e join pg_namespace n on n.oid = e.extnamespace
      where e.extname = 'pgcrypto';
    execute format('select %I.crypt($1, %I.gen_salt(''bf'', 12))',
                   v_crypto_schema, v_crypto_schema)
      into v_hash using new.security_password;
  end if;

  if v_email_changed or v_password_changed then
    update auth.users set
      email = new.work_email,
      encrypted_password = coalesce(v_hash, encrypted_password),
      email_confirmed_at = case when v_email_changed then now() else email_confirmed_at end,
      email_change = case when v_email_changed then '' else email_change end,
      email_change_token_new = case when v_email_changed then '' else email_change_token_new end,
      email_change_token_current = case when v_email_changed then '' else email_change_token_current end,
      updated_at = now()
    where id = new.user_id;

    update auth.identities set
      identity_data = identity_data || jsonb_build_object(
        'sub', new.user_id::text, 'email', new.work_email,
        'email_verified', v_email_changed or v_auth.email_confirmed_at is not null),
      updated_at = now()
    where user_id = new.user_id and provider = 'email';
    if not found then
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
      values (gen_random_uuid(), new.user_id, new.user_id::text, 'email',
              jsonb_build_object('sub', new.user_id::text, 'email', new.work_email,
                                'email_verified', v_email_changed or v_auth.email_confirmed_at is not null),
              now(), now());
    end if;
  end if;

  -- Never persist the plaintext input, even through INSERT ... RETURNING.
  new.security_password := null;
  if tg_op = 'INSERT' then
    new.session_version := 1;
  else
    new.session_version := old.session_version + case
      when v_email_changed or v_password_changed
        or new.work_email is distinct from old.work_email then 1 else 0 end;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_admin_account_credentials()
  from public, anon, authenticated, service_role;

drop trigger if exists sync_admin_account_credentials on public.admin_accounts;
create trigger sync_admin_account_credentials
  before insert or update on public.admin_accounts
  for each row execute function public.sync_admin_account_credentials();

comment on column public.admin_accounts.work_email is
  'Editable admin login email. Saving a changed email synchronizes Supabase Auth and its email identity; the trusted operator confirms ownership.';
comment on column public.admin_accounts.security_password is
  'Write-only password reset input (16+ characters, max 72 bytes). Save a new value to hash it in Supabase Auth; this column always returns NULL. Do not paste hashes.';
comment on column public.admin_accounts.session_version is
  'Managed by the credential trigger. Changing email or password invalidates existing admin console sessions.';

-- Keep the existing service-role-only access restrictions from 032.
commit;
