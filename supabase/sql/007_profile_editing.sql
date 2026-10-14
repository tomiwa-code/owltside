-- Profile customization and username change cooldown.
-- Apply after 001_schema.sql and existing migrations.
alter table public.profiles
  add column if not exists banner_url text,
  add column if not exists interests text[] not null default '{}',
  add column if not exists username_changed_at timestamptz;
