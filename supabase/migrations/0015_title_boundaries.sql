-- StopSpotter — title boundary data (HMLR INSPIRE Index Polygons for
-- England/Wales, Registers of Scotland Cadastral Parcels for Scotland)
--
-- Both are free, open-licensed bulk datasets with no live per-point API —
-- scripts/sync-title-boundaries-ew.mjs and -scotland.mjs (run on a
-- schedule, see .github/workflows/) download and load them in here.
-- Nothing in this migration populates the table itself.
--
-- What this is NOT: a reliable "who owns this" lookup. Both registries are
-- explicit that these polygons show the *indicative* extent of a
-- registered title, not the legal boundary (that's the paid title plan),
-- and neither dataset includes the owner's name at all — only a title
-- number. A match here means "a registered title exists roughly here",
-- nothing stronger. The admin UI's wording (see AdminStopDetailScreen/
-- AdminReviewScreen) is deliberately "no known owner" when there's no
-- match, not "unowned" — England & Wales alone has an estimated 10-14%
-- of land still unregistered (HM Land Registry's own published figures),
-- overwhelmingly older rural land, which is exactly the kind of land
-- StopSpotter's nominations skew toward. No match is a real, common,
-- actionable signal ("this needs a different ownership path — the local
-- council, Commons Registration, an old estate"), not an edge case.
create table public.title_boundaries (
  id uuid primary key default gen_random_uuid (),
  nation text not null check (nation in ('england_wales', 'scotland')),
  title_number text not null,
  -- Only set when the source file distinguishes it (HMLR's INSPIRE
  -- polygons cover freehold only; Scotland's cadastral parcels don't
  -- carry an equivalent field at all) — nullable rather than guessed.
  tenure text,
  geom geography (multipolygon, 4326) not null,
  -- Which source file this came from (a local authority name for
  -- England/Wales, a registration county for Scotland) — not used by any
  -- query, just lets a re-sync scope itself to "replace this source's
  -- rows" and gives something to grep in Table Editor when a lookup looks
  -- wrong.
  source_area text,
  updated_at timestamptz not null default now()
);

create index title_boundaries_geom_idx on public.title_boundaries using gist (geom);

-- The sync scripts upsert on this — a title number is unique within each
-- registry, and the two registries never share one, so (nation,
-- title_number) is a safe natural key for "replace this title's polygon
-- with the newer one" rather than ever accumulating duplicates.
create unique index title_boundaries_nation_title_idx on public.title_boundaries (nation, title_number);

-- RLS enabled, no policies at all — same as council_boundaries
-- (0001_init.sql): loaded and read only via service role (the sync
-- scripts) and the SECURITY DEFINER admin_list_nominations function
-- below, never a direct anon/authenticated grant. This data is
-- OGL-licensed and not inherently sensitive, but there's no public-app
-- use for it at all (admin triage only), so there's no reason to widen
-- access beyond that.
alter table public.title_boundaries enable row level security;

-- ── admin_list_nominations ───────────────────────────────────────────────
-- Adds two OUT columns — needs the same rename-based swap as every prior
-- shape change to this function (0009, 0011, 0014). _old_v1/v2/v3 are
-- already taken, so this one is _old_v4.
alter function public.admin_list_nominations () rename to admin_list_nominations_old_v4;

revoke execute on function public.admin_list_nominations_old_v4 ()
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
  coast_distance_m numeric,
  title_number text,
  title_tenure text
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
    n.road_access, n.ownership_confidence_detail, n.coast_distance_m,
    tb.title_number, tb.tenure
  from public.nominations n
  left join auth.users au on au.id = n.user_id
  left join public.profiles p on p.id = n.user_id
  left join lateral (
    select title_number, tenure
    from public.title_boundaries tb
    where st_contains(tb.geom::geometry, n.exact_location::geometry)
    limit 1
  ) tb on true
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
