-- 030 · Admin-owned verification and requests for updated identity / bank details.
-- Run after 029. Safe to re-run. The public app can submit details, never request
-- re-verification or decide a check. Historical approvals are retained.

begin;

alter table public.approval_requests drop constraint if exists approval_requests_status_check;
alter table public.approval_requests add constraint approval_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'cancelled', 'reverification_required'));

alter table public.approval_requests drop constraint if exists approval_requests_reverification_check;
alter table public.approval_requests add constraint approval_requests_reverification_check
  check (status <> 'reverification_required' or (
    kind = 'verification' and coalesce(payload ->> 'check', '') in ('identity', 'payoutAccount')
  ));

create index if not exists approval_requests_verification_latest_idx
  on public.approval_requests (requester_id, (payload ->> 'check'), created_at desc, id desc)
  where kind = 'verification';

-- A separate guard preserves migration 029's refund/payout protections.
create or replace function public.guard_verification_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check text;
  v_latest public.approval_requests%rowtype;
begin
  if new.kind <> 'verification' then return new; end if;
  v_check := coalesce(new.payload ->> 'check', '');
  if v_check not in ('phone', 'identity', 'payoutAccount') then
    raise exception 'Choose a valid verification check';
  end if;

  -- Serialize submissions, decisions and admin requests for this account.
  perform 1 from public.profiles where id = new.requester_id for update;
  if not found then raise exception 'User account not found'; end if;
  select * into v_latest from public.approval_requests
    where requester_id = new.requester_id and kind = 'verification'
      and payload ->> 'check' = v_check
    order by created_at desc, id desc limit 1;

  if tg_op = 'INSERT' then
    -- Neither caller-supplied timestamps nor subject IDs can bypass latest-state
    -- checks. Keep ordering monotonic even for legacy rows with future dates.
    new.created_at := greatest(clock_timestamp(), v_latest.created_at + interval '1 microsecond');
    new.subject_id := null;
    if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is not null then
      if new.status <> 'pending' then
        raise exception 'Only an Owltside admin can request or decide verification';
      end if;
      if v_latest.status = 'approved' then
        raise exception 'This check is already verified. Only an admin can request new verification details';
      end if;
      if v_latest.status = 'pending' then
        raise exception 'This request is already awaiting approval';
      end if;
      new.decision_note := null;
      new.decided_at := null;
      new.decided_by := null;
    end if;
  elsif new.status in ('approved', 'rejected') and old.status = 'pending' then
    if v_latest.id is distinct from old.id then
      raise exception 'This verification submission has been superseded';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_verification_lifecycle on public.approval_requests;
create trigger guard_verification_lifecycle
  before insert or update on public.approval_requests
  for each row execute function public.guard_verification_lifecycle();

-- Preserve the existing profile-tick rule (identity + payout account), but
-- evaluate the LATEST state, not whether an approval ever existed in history.
create or replace function public.sync_profile_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verified boolean;
begin
  if new.kind <> 'verification' or new.payload ->> 'check' not in ('identity', 'payoutAccount') then
    return new;
  end if;
  select coalesce(count(*) = 2 and bool_and(status = 'approved'), false)
    into v_verified
    from (
      select distinct on (payload ->> 'check') status
      from public.approval_requests
      where requester_id = new.requester_id and kind = 'verification'
        and payload ->> 'check' in ('identity', 'payoutAccount')
      order by payload ->> 'check', created_at desc, id desc
    ) latest;
  update public.profiles set verified = v_verified where id = new.requester_id;
  return new;
end $$;

drop trigger if exists sync_profile_verification on public.approval_requests;
create trigger sync_profile_verification
  after insert or update on public.approval_requests
  for each row execute function public.sync_profile_verification();

-- A profile is user-editable, but its verification mirror is not. Nested writes
-- from the trusted approval trigger above remain allowed; ordinary profile edits
-- cannot restore the tick while an admin is waiting for new details.
create or replace function public.guard_profile_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is not null
     and pg_trigger_depth() = 1 then
    if (tg_op = 'INSERT' and new.verified)
       or (tg_op = 'UPDATE' and new.verified is distinct from old.verified) then
      raise exception 'Only an Owltside admin can change profile verification';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_verification on public.profiles;
create trigger guard_profile_verification
  before insert or update on public.profiles
  for each row execute function public.guard_profile_verification();

-- Atomic, service-role-only operation: append an action-required record, revoke
-- the profile tick via the trigger above, and notify the user. This row is NOT
-- a pending submission and cannot be approved before the user supplies details.
create or replace function public.request_user_reverification(
  p_user_id uuid, p_check text, p_reason text, p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest public.approval_requests%rowtype;
  v_id uuid;
  v_label text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only an Owltside admin can request re-verification';
  end if;
  if p_check is null or p_check not in ('identity', 'payoutAccount') then
    raise exception 'Choose identity or payout account';
  end if;
  if nullif(btrim(p_reason), '') is null or length(btrim(p_reason)) > 1000 then
    raise exception 'Add a reason of up to 1000 characters for the user';
  end if;
  if nullif(btrim(p_actor), '') is null then raise exception 'Admin actor is required'; end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User account not found'; end if;
  select * into v_latest from public.approval_requests
    where requester_id = p_user_id and kind = 'verification' and payload ->> 'check' = p_check
    order by created_at desc, id desc limit 1;
  if v_latest.status = 'reverification_required' then
    raise exception 'Updated details have already been requested for this check';
  end if;
  if v_latest.status = 'pending' then
    raise exception 'This check already has a submission awaiting review';
  end if;
  if v_latest.status is distinct from 'approved' then
    raise exception 'Only an approved check can be requested again';
  end if;

  v_label := case p_check when 'identity' then 'Identity' else 'Payout account' end;
  insert into public.approval_requests (
    requester_id, kind, status, title, summary, subject_label, payload,
    decision_note, decided_at, decided_by
  ) values (
    p_user_id, 'verification', 'reverification_required',
    v_label || ' · updated details requested', btrim(p_reason), p_check,
    jsonb_build_object('check', p_check, 'previousRequestId', v_latest.id),
    btrim(p_reason), clock_timestamp(), btrim(p_actor)
  ) returning id into v_id;

  insert into public.notifications (user_id, kind, title, body, href)
  values (
    p_user_id, 'system', v_label || ' · updated details requested',
    btrim(p_reason) || ' Submit your details in Settings → Verification for admin approval.',
    '/settings?category=verification'
  );
  return v_id;
end $$;

revoke all on function public.request_user_reverification(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.request_user_reverification(uuid, text, text, text) to service_role;

-- Repair legacy profile flags without touching accounts that have no review history.
with latest as (
  select distinct on (requester_id, payload ->> 'check') requester_id, status
  from public.approval_requests
  where kind = 'verification' and payload ->> 'check' in ('identity', 'payoutAccount')
  order by requester_id, payload ->> 'check', created_at desc, id desc
), checks as (
  select requester_id, count(*) = 2 and bool_and(status = 'approved') as verified
  from latest group by requester_id
)
update public.profiles p set verified = c.verified from checks c where p.id = c.requester_id;

commit;
