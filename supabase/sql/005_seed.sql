-- Starter seed so a fresh project isn't empty.
-- (The in-app demo mode mirrors this data 1:1 — see src/lib/server/demo/seed.ts.)
insert into public.profiles (id, handle, name, avatar_color, verified, followers, following, bio, city)
values
  ('11111111-1111-4111-8111-111111111111', 'seguna', 'Segun Alakija', '#494bd6', true, 5310, 190, 'Building the Pulse summit series.', 'Lagos'),
  ('22222222-2222-4222-8222-222222222222', 'femiade', 'Femi Adeyemi', '#10b981', true, 22100, 87, 'Promoter & selector.', 'Lagos'),
  ('33333333-3333-4333-8333-333333333333', 'drbello', 'Dr. Amina Bello', '#009eb9', true, 12400, 310, 'Public-health technologist.', 'Abuja')
on conflict (id) do nothing;

insert into public.events (slug, title, category, tags, starts_at, venue, city, cover, description, organizer_id, tiers, featured, trending_rank, views_today, attendees)
values
  (
    'pulse-ai-summit-lagos', 'Pulse AI Summit Lagos', 'tech', '{AI,Summit,Networking}',
    now() + interval '9 days', 'Eko Convention Center', 'Victoria Island, Lagos',
    '{"from":"#312e81","to":"#7c3aed","icon":"brain-circuit"}',
    'A full day of applied-AI talks, live build sessions and investor office hours.',
    '11111111-1111-4111-8111-111111111111',
    '[{"id":"tier-regular","name":"Regular","price":45000,"sold":788,"capacity":800},{"id":"tier-vip","name":"VIP","price":120000,"sold":140,"capacity":200}]',
    true, null, 2310, 928
  ),
  (
    'afrobeats-sound-sunset', 'Afrobeats & Sound Sunset', 'music', '{Afrobeats,Beach}',
    now() + interval '5 days', 'Landmark Beach', 'Oniru, Lagos',
    '{"from":"#b45309","to":"#7c2d12","icon":"audio-waveform"}',
    'Golden-hour sets from Lagos'' finest selectors.',
    '22222222-2222-4222-8222-222222222222',
    '[{"id":"tier-general","name":"General","price":15000,"sold":1140,"capacity":1300},{"id":"tier-vip","name":"VIP Deck","price":40000,"sold":190,"capacity":200}]',
    false, 4, 1870, 1330
  )
on conflict (slug) do nothing;
