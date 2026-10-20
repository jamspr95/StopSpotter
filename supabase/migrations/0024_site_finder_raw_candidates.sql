-- StopSpotter — fold SiteFinder's own search/review UI into this admin,
-- instead of two separate portals (Jamie, 20 Oct 2026). SiteFinder's
-- standalone Flask app (jamspr95/sitefinder's web/app.py) browses
-- *every* pipeline candidate — long before any human decides it's worth
-- pursuing — straight off local data/processed/<area>/sites.geojson
-- files, with no shared backend, no auth, and no connection to this
-- project's own admin triage. "Only approved sites need to enter [the]
-- SS database" (Jamie's own words) means the opposite of the existing
-- import flow: scripts/import-sitefinder-candidates.mjs writes every
-- candidate straight into `nominations`, so there was never a place to
-- preview one WITHOUT already committing it.
--
-- This is that place: a staging table every pipeline candidate lands in
-- (via a new sync script, mirroring the existing SiteFinder → StopSpotter
-- JSON hand-off), browsed/filtered/mapped from a new StopSpotter admin
-- screen, with an explicit Approve action that's the ONLY path into
-- `nominations` from here on — scripts/import-sitefinder-candidates.mjs
-- is superseded by admin_approve_site_finder_candidate() below, which
-- reimplements its exact matching/merge logic as a SECURITY DEFINER RPC
-- an authenticated admin can call directly (no service-role key in the
-- browser, same reasoning as every other admin_* RPC in this project).
create table public.site_finder_raw_candidates (
  id uuid primary key default gen_random_uuid (),
  -- Stable hash from SiteFinder's stopspotter_export.py (centroid+owner+
  -- property) — same id scheme as nominations.site_finder_candidate_id
  -- (0013/0022), so a re-synced candidate updates this SAME row rather
  -- than duplicating it, and so admin_approve_site_finder_candidate can
  -- recognise "this was already approved" across repeat pipeline runs.
  site_finder_candidate_id text not null,
  area_key text not null,
  area_label text not null,
  exact_location geography (point, 4326) not null,
  -- The real usable-area polygon SiteFinder's own map draws — never
  -- carried into `nominations` by the old import flow at all (only a
  -- centroid point survives there). Nullable: a handful of older/edge
  -- candidates may have no boundary if the pipeline's geometry step
  -- failed for them but everything else still computed.
  site_boundary geography (polygon, 4326),
  owner_type text check (
    owner_type in (
      'council',
      'public_body',
      'business',
      'private_individual',
      'i_own_it',
      'dont_know'
    )
  ),
  owner_name text,
  property_name text,
  ownership_confidence_detail text check (
    ownership_confidence_detail in ('high', 'medium', 'low', 'unknown')
  ),
  ownership_source text,
  score numeric check (score between 0 and 1),
  component_scores jsonb not null default '{}'::jsonb,
  flags text[] not null default '{}',
  -- The FULL reasons list, untruncated — unlike nominations.why_here
  -- (capped at 280 chars for a human's own free-text answer, see
  -- 0001_init.sql), this is an admin-only preview table with no such
  -- limit. admin_approve_site_finder_candidate joins and truncates this
  -- the same way SiteFinder's own stopspotter_export.py's _why_here()
  -- does, only once a candidate is actually approved into `nominations`.
  reasons text[] not null default '{}',
  usable_area_m2 numeric,
  capacity_pitches int,
  avg_slope_percent numeric,
  slope_source text,
  road_access text check (
    road_access in ('good', 'fair', 'poor', 'unknown')
  ),
  coast_distance_m numeric,
  -- Carried through for the first time here — to_nomination_row() never
  -- had a column for it, so the old import flow silently dropped it.
  utility_status text,
  nearby text[] not null default '{}',
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected')
  ),
  -- Set once an admin approves this candidate — the resulting
  -- `nominations` row. Lets a re-sync (the SAME real site, re-scanned by
  -- a later pipeline run) recognise it was already approved and refresh
  -- that nomination in place, rather than asking an admin to re-approve
  -- something they already decided on.
  approved_nomination_id uuid references public.nominations (id),
  rejected_reason text,
  reviewed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  -- Updated on every sync regardless of status — lets an admin see a
  -- rejected/approved candidate's underlying SiteFinder data is stale
  -- vs. fresh, even though status itself is never reset by a sync (see
  -- the sync script's own comment for why).
  last_synced_at timestamptz not null default now()
);

create unique index site_finder_raw_candidates_candidate_id_idx on public.site_finder_raw_candidates (site_finder_candidate_id);

create index site_finder_raw_candidates_status_idx on public.site_finder_raw_candidates (status);

comment on table public.site_finder_raw_candidates is 'Every SiteFinder pipeline candidate, synced from data/processed/<area>/sites.geojson via scripts/sync-sitefinder-raw-candidates.mjs — a preview staging area, not the live app data. admin_approve_site_finder_candidate() is the only path from here into nominations.';

-- Admin-only, via SECURITY DEFINER RPCs below — same pattern as
-- council_boundaries (0001_init.sql): RLS enabled, no policies at all,
-- so even a direct table grant would deny anon/authenticated outright.
alter table public.site_finder_raw_candidates enable row level security;

-- ── admin_list_site_finder_raw_candidates ───────────────────────────────
-- p_status default 'pending' — the admin screen's normal view (what's
-- worth deciding on right now); pass null to see everything, or
-- 'approved'/'rejected' to review past decisions.
create or replace function public.admin_list_site_finder_raw_candidates (p_status text default 'pending')
returns table (
  id uuid,
  site_finder_candidate_id text,
  area_key text,
  area_label text,
  exact_lat double precision,
  exact_lng double precision,
  site_boundary jsonb,
  owner_type text,
  owner_name text,
  property_name text,
  ownership_confidence_detail text,
  ownership_source text,
  score numeric,
  component_scores jsonb,
  flags text[],
  reasons text[],
  usable_area_m2 numeric,
  capacity_pitches int,
  avg_slope_percent numeric,
  slope_source text,
  road_access text,
  coast_distance_m numeric,
  utility_status text,
  nearby text[],
  status text,
  approved_nomination_id uuid,
  rejected_reason text,
  reviewed_at timestamptz,
  first_seen_at timestamptz,
  last_synced_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not current_user_is_admin () then
    raise exception 'not authorized';
  end if;

  return query
  select
    r.id, r.site_finder_candidate_id, r.area_key, r.area_label,
    st_y (r.exact_location::geometry), st_x (r.exact_location::geometry),
    case when r.site_boundary is null then null else to_jsonb (st_asgeojson (r.site_boundary)::json) end,
    r.owner_type, r.owner_name, r.property_name, r.ownership_confidence_detail, r.ownership_source,
    r.score, r.component_scores, r.flags, r.reasons,
    r.usable_area_m2, r.capacity_pitches, r.avg_slope_percent, r.slope_source, r.road_access, r.coast_distance_m,
    r.utility_status, r.nearby,
    r.status, r.approved_nomination_id, r.rejected_reason, r.reviewed_at, r.first_seen_at, r.last_synced_at
  from public.site_finder_raw_candidates r
  where p_status is null or r.status = p_status
  order by r.score desc nulls last;
end;
$$;

revoke execute on function public.admin_list_site_finder_raw_candidates (text)
from
  public,
  anon;

grant
execute on function public.admin_list_site_finder_raw_candidates (text) to authenticated;

-- ── admin_reject_site_finder_candidate ───────────────────────────────────
create or replace function public.admin_reject_site_finder_candidate (p_raw_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not current_user_is_admin () then
    raise exception 'not authorized';
  end if;

  update public.site_finder_raw_candidates
  set status = 'rejected', rejected_reason = p_reason, reviewed_at = now()
  where id = p_raw_id;

  if not found then
    raise exception 'candidate not found';
  end if;
end;
$$;

revoke execute on function public.admin_reject_site_finder_candidate (uuid, text)
from
  public,
  anon;

grant
execute on function public.admin_reject_site_finder_candidate (uuid, text) to authenticated;

-- ── admin_approve_site_finder_candidate ──────────────────────────────────
-- Reimplements scripts/import-sitefinder-candidates.mjs's importOne()
-- matching/merge logic exactly, as the one path from a raw candidate
-- into `nominations`:
--   1. Already approved once (approved_nomination_id set), OR a genuine
--      id match on nominations.site_finder_candidate_id → refresh that
--      SAME real site in place (every SiteFinder-owned field
--      overwritten, status left alone — an admin may have already
--      triaged it).
--   2. No id match, no nearby (200m) match → plain insert.
--   3. No id match, 200m match on another source='site_finder' row → a
--      genuinely DIFFERENT real site that happens to be this close (see
--      0022's own incident) — inserted as its own row, cluster_root_id
--      pointing at the other one.
--   4. No id match, 200m match on a source='user'/'both' row → merge:
--      source becomes 'both', every SiteFinder-owned field is always
--      refreshed, but owner_type/ownership_hint/why_here (the only three
--      SiteFinder can ever actually supply a value for) are only filled
--      in where the human's own answer is still null — never overwritten.
create or replace function public.admin_approve_site_finder_candidate (p_raw_id uuid)
returns table (nomination_id uuid, outcome text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw public.site_finder_raw_candidates;
  v_match_id uuid;
  v_nearby_id uuid;
  v_existing_source text;
  v_existing_cluster_root_id uuid;
  v_why_here text;
  v_council_area text;
  v_result_id uuid;
  v_outcome text;
  v_cut int;
begin
  if not current_user_is_admin () then
    raise exception 'not authorized';
  end if;

  select * into v_raw from public.site_finder_raw_candidates where id = p_raw_id;
  if v_raw.id is null then
    raise exception 'candidate not found';
  end if;

  -- Same truncation SiteFinder's own stopspotter_export.py's _why_here()
  -- does for a human-form-sized field — back off to the last complete
  -- "; "-joined reason that fits 280 chars, trailing ellipsis if cut.
  v_why_here := array_to_string(v_raw.reasons, '; ');
  if v_why_here = '' then
    v_why_here := null;
  elsif length(v_why_here) > 280 then
    v_why_here := left(v_why_here, 279);
    v_cut := length(v_why_here) - position('; ' in reverse(v_why_here)) - 1;
    if v_cut > 0 then
      v_why_here := left(v_why_here, v_cut);
    end if;
    v_why_here := v_why_here || '…';
  end if;

  v_council_area := public.council_area_for_point (v_raw.exact_location);

  -- 1. Same real site, already approved or a genuine id match.
  if v_raw.approved_nomination_id is not null then
    v_match_id := v_raw.approved_nomination_id;
  else
    select id into v_match_id
    from public.nominations
    where site_finder_candidate_id = v_raw.site_finder_candidate_id
    limit 1;
  end if;

  if v_match_id is not null then
    update public.nominations set
      council_area = v_council_area,
      owner_type = v_raw.owner_type,
      ownership_hint = coalesce(v_raw.owner_name, v_raw.property_name),
      why_here = v_why_here,
      site_finder_score = v_raw.score,
      site_finder_component_scores = v_raw.component_scores,
      site_finder_flags = v_raw.flags,
      usable_area_m2 = v_raw.usable_area_m2,
      capacity_pitches = v_raw.capacity_pitches,
      avg_slope_percent = v_raw.avg_slope_percent,
      slope_source = v_raw.slope_source,
      road_access = v_raw.road_access,
      ownership_confidence_detail = v_raw.ownership_confidence_detail,
      coast_distance_m = v_raw.coast_distance_m,
      site_finder_candidate_id = v_raw.site_finder_candidate_id
    where id = v_match_id;
    v_result_id := v_match_id;
    v_outcome := 'refreshed';
  else
    -- 2/3/4. No id match — 200m proximity decides insert/cluster/merge.
    select id into v_nearby_id from public.find_nearby_nomination (v_raw.exact_location, 200) limit 1;

    if v_nearby_id is null then
      insert into public.nominations (
        source, status, exact_location, public_location, council_area,
        owner_type, ownership_hint, nearby, why_here,
        site_finder_score, site_finder_component_scores, site_finder_flags,
        usable_area_m2, capacity_pitches, avg_slope_percent, slope_source,
        road_access, ownership_confidence_detail, coast_distance_m,
        site_finder_candidate_id
      ) values (
        'site_finder', 'submitted', v_raw.exact_location, v_raw.exact_location, v_council_area,
        v_raw.owner_type, coalesce(v_raw.owner_name, v_raw.property_name), v_raw.nearby, v_why_here,
        v_raw.score, v_raw.component_scores, v_raw.flags,
        v_raw.usable_area_m2, v_raw.capacity_pitches, v_raw.avg_slope_percent, v_raw.slope_source,
        v_raw.road_access, v_raw.ownership_confidence_detail, v_raw.coast_distance_m,
        v_raw.site_finder_candidate_id
      )
      returning id into v_result_id;
      v_outcome := 'inserted';
    else
      select source, cluster_root_id into v_existing_source, v_existing_cluster_root_id
      from public.nominations where id = v_nearby_id;

      if v_existing_source = 'site_finder' then
        insert into public.nominations (
          source, status, exact_location, public_location, council_area,
          owner_type, ownership_hint, nearby, why_here,
          site_finder_score, site_finder_component_scores, site_finder_flags,
          usable_area_m2, capacity_pitches, avg_slope_percent, slope_source,
          road_access, ownership_confidence_detail, coast_distance_m,
          site_finder_candidate_id, cluster_root_id
        ) values (
          'site_finder', 'submitted', v_raw.exact_location, v_raw.exact_location, v_council_area,
          v_raw.owner_type, coalesce(v_raw.owner_name, v_raw.property_name), v_raw.nearby, v_why_here,
          v_raw.score, v_raw.component_scores, v_raw.flags,
          v_raw.usable_area_m2, v_raw.capacity_pitches, v_raw.avg_slope_percent, v_raw.slope_source,
          v_raw.road_access, v_raw.ownership_confidence_detail, v_raw.coast_distance_m,
          v_raw.site_finder_candidate_id, coalesce(v_existing_cluster_root_id, v_nearby_id)
        )
        returning id into v_result_id;
        v_outcome := 'clustered';
      else
        update public.nominations set
          source = 'both',
          site_finder_candidate_id = v_raw.site_finder_candidate_id,
          site_finder_score = v_raw.score,
          site_finder_component_scores = v_raw.component_scores,
          site_finder_flags = v_raw.flags,
          usable_area_m2 = v_raw.usable_area_m2,
          capacity_pitches = v_raw.capacity_pitches,
          avg_slope_percent = v_raw.avg_slope_percent,
          slope_source = v_raw.slope_source,
          road_access = v_raw.road_access,
          ownership_confidence_detail = v_raw.ownership_confidence_detail,
          coast_distance_m = v_raw.coast_distance_m,
          owner_type = coalesce(owner_type, v_raw.owner_type),
          ownership_hint = coalesce(ownership_hint, coalesce(v_raw.owner_name, v_raw.property_name)),
          why_here = coalesce(why_here, v_why_here)
        where id = v_nearby_id
        returning id into v_result_id;
        v_outcome := 'merged';
      end if;
    end if;
  end if;

  update public.site_finder_raw_candidates set
    status = 'approved',
    approved_nomination_id = v_result_id,
    reviewed_at = now()
  where id = p_raw_id;

  return query select v_result_id, v_outcome;
end;
$$;

revoke execute on function public.admin_approve_site_finder_candidate (uuid)
from
  public,
  anon;

grant
execute on function public.admin_approve_site_finder_candidate (uuid) to authenticated;
