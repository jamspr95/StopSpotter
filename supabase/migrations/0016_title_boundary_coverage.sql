-- StopSpotter — title boundary sync coverage, for the admin dashboard.
--
-- Until scripts/sync-title-boundaries-ew.mjs / -scotland.mjs have actually
-- run on a schedule (see .github/workflows/), public.title_boundaries is
-- empty — every nomination would show "no known owner" simply because
-- there's nothing to match against yet, not because a title genuinely
-- couldn't be found. The admin dashboard needs to tell those two cases
-- apart, so this exposes a tiny per-nation summary (row count + the newest
-- updated_at) rather than a per-nomination flag, since the distinction is
-- "has this nation's data ever been loaded at all", not something that
-- varies nomination to nomination.
create function public.admin_title_boundary_coverage ()
returns table (nation text, row_count bigint, last_synced_at timestamptz)
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
  select tb.nation, count(*), max(tb.updated_at)
  from public.title_boundaries tb
  group by tb.nation;
end;
$$;

revoke execute on function public.admin_title_boundary_coverage ()
from
  public;

revoke execute on function public.admin_title_boundary_coverage ()
from
  anon,
  authenticated;

grant
execute on function public.admin_title_boundary_coverage () to authenticated;
