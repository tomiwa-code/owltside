-- 021 · Per-participant chat read state.
-- Run after 001–020.
--
-- `conversations.unread` only ever counted messages the row owner (user_id)
-- had not opened, yet both participants read and cleared the same number: a
-- sender who opened a thread marked the receiver's messages read, and the
-- receiver saw the sender's count. Read state now has one counter per
-- participant, and opening a thread clears only the reader's counter. New
-- messages keep incrementing the recipient's counter until they open the
-- thread themselves.

alter table public.conversations
  add column if not exists peer_unread integer not null default 0;

create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.conversations
  set last_message = new.body,
      last_at = new.sent_at,
      unread = case when new.sender_id <> user_id then unread + 1 else unread end,
      peer_unread = case when new.sender_id <> peer_id then peer_unread + 1 else peer_unread end
  where id = new.conversation_id;
  return new;
end;
$$;
