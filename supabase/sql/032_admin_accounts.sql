-- 032 · Database-backed access list for the separate admin console.
-- Passwords belong to Supabase Auth (auth.users), NEVER this table.
-- Run after 031; safe to re-run. See admin/README.md for first-admin setup.
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

commit;
