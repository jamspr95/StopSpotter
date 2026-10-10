-- StopSpotter — surface the SiteFinder integration in the admin RPC and
-- the public map
--
-- Two follow-ons 0013_site_finder_integration.sql deliberately didn't
-- touch (that migration only adds columns/relaxes constraints on the base
-- table):
--
--   1. admin_list_nominations() needs the new site_finder_* columns too,
--      or the admin dashboard has no way to read them back out
--      (AdminStopDetailScreen/AdminReviewScreen's new "AireStop detail"
--      section, src/lib/db.ts's AdminNomination mapping).
--   2. public_nominations needs `source`, so MapScreen can render a
--      source='site_finder' candidate with its distinct "Suggested by
--      AireStop" marker instead of an indistinguishable blue pin. Adding
--      the column alone isn't enough on its own, though — a candidate
--      still under admin triage (status='under_review'/'submitted')
--      should never reach the public map at all: docs/PROJECT_PLAN.md's
--      "released in small batches per area" and "candidates passing hard
--      criteria appear as markers" both describe an admin-gated release,
--      not an always-on one. Enforced here with a WHERE clause on the
--      view itself (server-side, same philosophy as the column grants
--      below it - never rely on the client to hide something it was
--      handed), not left to MapScreen to filter client-side. A 'both' row
--      (a human already nominated the same spot) is never gated - a real
--      nomination's own visibility rules apply to it, same as any other
--      source='user' row, regardless of a SiteFinder match.

-- ── admin_list_nominations ───────────────────────────────────────────────
-- Adds ten OUT columns, which CREATE OR REPLACE can't do for a
-- table-returning function — needs a real drop. Same rename-based
-- workaround as every prior shape change to this function (0009, 0011) —
-- a plain DROP FUNCTION has repeatedly timed out against this project
-- (not a lock; pg_stat_activity/pg_locks confirmed empty mid-timeout each
-- time). _old_v1/_old_v2 are already taken, so this one is _old_v3.
alter function public.admin_list_nominations () rename to admin_list_nominations_old_v3;

revoke execute on function public.admin_list_nominations_old_v3 ()
from
  authenticated;

create function public.admin_list_nominations ()
returns table (
  id uuid,
  user_id uuid,
  exact_lat float,
  exact_lng float,
  public_lat float,
  public_lng float,
  council_area text,
  place_type text,
  owner_type text,
  nearest_house text,
  slope text,
  room_for_five text,
  nearby text[],
  water text,
  why_here text,
  pay_band text,
  criteria_score int,
  criteria_flags text[],
  ownership_hint text,
  status text,
  verified boolean,
  source text,
  created_at timestamptz,
  vote_count bigint,
  area_label text,
  submitter_email text,
  submitter_first_name text,
  submitter_was_claimed boolean,
  site_finder_score numeric,
  site_finder_component_scores jsonb,
  site_finder_flags text[],
  usable_area_m2 numeric,
  capacity_pitches int,
  avg_slope_percent numeric,
  slope_source text,
  road_access text,
  ownership_confidence_detail text,
  coast_distance_m numeric
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
  select
    n.id, n.user_id,
    st_y (n.exact_location::geometry), st_x (n.exact_location::geometry),
    st_y (n.public_location::geometry), st_x (n.public_location::geometry),
    n.council_area, n.place_type, n.owner_type, n.nearest_house, n.slope,
    n.room_for_five, n.nearby, n.water, n.why_here, n.pay_band,
    n.criteria_score, n.criteria_flags, n.ownership_hint, n.status,
    n.verified, n.source, n.created_at,
    (select count(*) from public.votes v where v.nomination_id = n.id),
    n.area_label,
    au.email::text,
    p.first_name,
    n.submitter_was_claimed,
    n.site_finder_score, n.site_finder_component_scores, n.site_finder_flags,
    n.usable_area_m2, n.capacity_pitches, n.avg_slope_percent, n.slope_source,
    n.road_access, n.ownership_confidence_detail, n.coast_distance_m
  from public.nominations n
  left join auth.users au on au.id = n.user_id
  left join public.profiles p on p.id = n.user_id
  order by n.created_at desc;
end;
$$;

revoke execute on function public.admin_list_nominations ()
from
  public;

revoke execute on function public.admin_list_nominations ()
from
  anon,
  authenticated;

grant
execute on function public.admin_list_nominations () to authenticated;

-- ── public_nominations ───────────────────────────────────────────────────
-- "create or replace view" (appending a trailing column) same as
-- 0009_area_label.sql's swap — no drop needed for this one.
grant
select
  (source) on public.nominations to anon,
  authenticated;

create or replace view public.public_nominations
with (security_invoker = true) as
select
  id,
  st_y (public_location::geometry) as public_lat,
  st_x (public_location::geometry) as public_lng,
  council_area,
  place_type,
  nearby,
  why_here,
  pay_band,
  status,
  verified,
  created_at,
  area_label,
  source
from
  public.nominations
where
  source != 'site_finder'
  or status in ('shortlisted', 'live');

grant
select
  on public.public_nominations to anon,
  authenticated;
