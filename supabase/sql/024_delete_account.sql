-- 024 · Self-service account deletion.
--
-- Deleting an auth user needs an elevated key, which must never reach the public
-- app. This SECURITY DEFINER function runs as its owner (postgres) so the signed
-- in user can delete their own account without exposing the service-role key.
-- The public app calls it through `supabase.rpc('delete_own_account')`.
--
-- Safe to re-run.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in to delete your account';
  end if;

  -- Open review requests are cancelled rather than paid out or refunded.
  update public.approval_requests
    set status = 'cancelled',
        decision_note = 'Cancelled — the requester deleted their account.',
        decided_at = now()
    where requester_id = uid and status = 'pending';

  delete from public.profiles where id = uid;
  -- Cascades remove tickets, orders, notifications and conversations.
  delete from auth.users where id = uid;
end $$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
