-- StopSpotter — a friendly "near <town/village>" label for the public
-- stop card, separate from the formal council/LPA area.
--
-- councilArea (council_area_for_point, Milestone 2) still needs real ONS
-- boundary data that isn't loaded yet, and is really only needed for
-- admin/LPA outreach — showing its "to be confirmed" placeholder on the
-- PUBLIC card just confused testers. area_label is a much simpler,
-- already-available substitute for that card: a reverse-geocoded town or
-- village name, resolved client-side (src/lib/geocode.ts) once at
-- nomination-save time and stored here, same privacy posture as
-- council_area (not sensitive — it's coarser than the public_location grid
-- already shown on the map).
alter table public.nominations add column area_label text;

-- ── public_nominations ───────────────────────────────────────────────────
-- "create or replace view" (not drop+create) — appending a trailing
-- column this way is one of the few shape changes Postgres allows without
-- a drop, and a plain DROP VIEW/DROP FUNCTION was timing out against this
-- project at migration time (see the two renames below) — not a lock, not
-- a slow query (confirmed via pg_stat_activity/pg_locks mid-timeout, both
-- empty), just that command category misbehaving against this project on
-- the day. create/alter and a rename-based swap both worked fine.
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
  area_label
from
  public.nominations;

grant
select
  on public.public_nominations to anon,
  authenticated;

-- ── get_my_nominations / admin_list_nominations ─────────────────────────
-- CREATE OR REPLACE FUNCTION can't add an OUT column to a TABLE-returning
-- function — that normally means drop-then-create, but DROP FUNCTION was
-- one of the commands timing out (see above). Worked around by renaming
-- the old function out of the way (ALTER FUNCTION ... RENAME, not a DROP)
-- and creating the new one under the original name. The renamed originals
-- (*_old_v1) are left in place rather than forced through a retry loop —
-- their EXECUTE grant is revoked below so they're inert and unreachable
-- from the app, just harmless dead functions. Worth a real DROP FUNCTION
-- cleanup once that command works again against this project; tracked in
-- docs/PROJECT_PLAN.md rather than silently left unmentioned.
alter function public.get_my_nominations () rename to get_my_nominations_old_v1;

revoke execute on function public.get_my_nominations_old_v1 ()
from
  authenticated;

create function public.get_my_nominations ()
returns table (
  id uuid,
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
  created_at timestamptz,
  area_label text
)
language sql
stable
as $$
  select
    id,
    st_y (exact_location::geometry),
    st_x (exact_location::geometry),
    st_y (public_location::geometry),
    st_x (public_location::geometry),
    council_area, place_type, owner_type, nearest_house, slope, room_for_five,
    nearby, water, why_here, pay_band, criteria_score, criteria_flags,
    ownership_hint, status, verified, created_at, area_label
  from public.nominations
  where user_id = auth.uid ();
$$;

alter function public.get_my_nominations () security definer
set
  search_path = public;

revoke execute on function public.get_my_nominations ()
from
  public;

revoke execute on function public.get_my_nominations ()
from
  anon,
  authenticated;

grant
execute on function public.get_my_nominations () to authenticated;

alter function public.admin_list_nominations () rename to admin_list_nominations_old_v1;

revoke execute on function public.admin_list_nominations_old_v1 ()
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
  area_label text
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
    n.area_label
  from public.nominations n
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
