-- 017 · Public operating identity on profiles.
-- Run after 001–016. Until now the identity a user picked in Settings lived
-- only in their private auth metadata, so nobody else could see it and the
-- inbox labeled every non-verified chat peer "Speaker". This column mirrors
-- the choice onto the (already public-readable) profile row so conversation
-- lists can show the peer's chosen Attendee / Guest / Organizer identity.

alter table public.profiles
  add column if not exists operating_identity text not null default 'attendee'
  check (operating_identity in ('attendee', 'guest', 'organizer'));

-- Backfill from the preference each account already saved in auth metadata.
update public.profiles p
set operating_identity = u.raw_user_meta_data->>'operating_identity'
from auth.users u
where u.id = p.id
  and u.raw_user_meta_data->>'operating_identity' in ('attendee', 'guest', 'organizer');

-- No policy changes needed: profiles are already public-readable
-- (profiles_select) and owners may update their own row (profiles_update).
