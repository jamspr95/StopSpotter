-- StopSpotter — admin visibility into "help us grow" submissions
--
-- growth_feedback (0006/0007) has always been write-only: anon/authenticated
-- can insert, but there was no SELECT policy or admin RPC to read it back,
-- and nothing to mark a row as dealt with. The Support page's crowdfund
-- option is meant to be followed up in Brevo CRM, and the other two options
-- need a human to actually read and act on the free text — neither is
-- possible without a read path and somewhere to track progress, so this
-- adds both, following the same admin_list_*/current_user_is_admin()
-- pattern as 0002_admin.sql.
--
-- crm_synced is deliberately generic ("has this row been pushed into
-- Brevo"), not crowdfund-specific — there's no automated Brevo contact sync
-- yet (see docs/SETUP.md §10a), so for now this is a manual checkbox an
-- admin ticks after adding someone in Brevo by hand. actioned is separate
-- from crm_synced because a "helpful position"/"idea" submission can be
-- read and actioned without ever touching Brevo.

alter table public.growth_feedback
  add column actioned boolean not null default false,
  add column crm_synced boolean not null default false;

-- ── admin_list_growth_feedback ───────────────────────────────────────────
create or replace function public.admin_list_growth_feedback ()
returns table (
  id uuid,
  options text[],
  message text,
  email text,
  actioned boolean,
  crm_synced boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not current_user_is_admin () then
    raise exception 'not authorized';
  end if;

  return query
  select g.id, g.options, g.message, g.email, g.actioned, g.crm_synced, g.created_at
  from public.growth_feedback g
  order by g.created_at desc;
end;
$$;

revoke execute on function public.admin_list_growth_feedback ()
from
  public;

grant
execute on function public.admin_list_growth_feedback () to authenticated;

revoke execute on function public.admin_list_growth_feedback ()
from
  anon;

-- ── admin_update_growth_feedback ─────────────────────────────────────────
-- Both flags are independently optional (null = leave unchanged) so the
-- admin screen can toggle just one without needing to know the other's
-- current value.
create or replace function public.admin_update_growth_feedback (
  p_id uuid,
  p_actioned boolean default null,
  p_crm_synced boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not current_user_is_admin () then
    raise exception 'not authorized';
  end if;

  update public.growth_feedback
  set
    actioned = coalesce(p_actioned, actioned),
    crm_synced = coalesce(p_crm_synced, crm_synced)
  where id = p_id;

  if not found then
    raise exception 'growth feedback row not found';
  end if;
end;
$$;

revoke execute on function public.admin_update_growth_feedback (uuid, boolean, boolean)
from
  public;

grant
execute on function public.admin_update_growth_feedback (uuid, boolean, boolean) to authenticated;

revoke execute on function public.admin_update_growth_feedback (uuid, boolean, boolean)
from
  anon;
