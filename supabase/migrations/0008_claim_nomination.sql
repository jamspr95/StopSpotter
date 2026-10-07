-- StopSpotter — attach a signed-in user to a nomination that was already
-- auto-saved anonymously.
--
-- Nominations no longer wait for an explicit "submit without email" click
-- to be written — the app saves the draft the moment the question flow
-- finishes, before SignUpScreen ever asks for an email (see
-- saveNominationDraft / ensureNominationSaved in src/store/useAppStore.ts).
-- If the person goes on to confirm an email (magic link or SSO), this is
-- how that nomination gets attached to them afterwards — there's
-- deliberately no UPDATE policy on nominations for anon/authenticated
-- (0001_init.sql), so it has to be a SECURITY DEFINER RPC, same shape as
-- admin_update_nomination_status.
create or replace function public.claim_nomination (p_nomination_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'not authenticated';
  end if;

  -- Nomination ids aren't secret (returned from the insert, visible via
  -- public_nominations), so this guard isn't "is this really you" — it's
  -- "don't let a claim silently reassign a nomination someone already
  -- claimed".
  update public.nominations
  set
    user_id = auth.uid (),
    verified = true
  where
    id = p_nomination_id
    and user_id is null;
end;
$$;

-- "from public" alone isn't enough on this platform — Supabase's own
-- default-privilege grant hands anon/authenticated EXECUTE on every new
-- function at creation time, independent of the PUBLIC pseudo-role (see
-- 0003_grant_hardening.sql). Confirmed live: anon still had EXECUTE after
-- a plain "from public" revoke until these named revokes were added.
revoke execute on function public.claim_nomination (uuid)
from
  public;

revoke execute on function public.claim_nomination (uuid)
from
  anon,
  authenticated;

grant
execute on function public.claim_nomination (uuid) to authenticated;
