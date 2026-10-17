-- StopSpotter — stop losing SiteFinder candidates to false merges, and
-- give the public map one pin per combined group instead of one pin per
-- site.
--
-- Real bug (16 Oct 2026): the importer's only way to tell "this is the
-- same real site, re-scanned by a later SiteFinder run" apart from "this
-- is a different real site that happens to be within 200m" was distance
-- alone. It can't actually tell those apart - and didn't: two of the 19
-- real Edinburgh candidates imported that day were both within 200m of
-- each other and got silently collapsed into one row via the existing
-- "match on site_finder source -> refresh in place" path
-- (import-sitefinder-candidates.mjs), discarding one site's data before
-- any admin ever saw it. See the SiteFinder repo's CLAUDE.md ("combined
-- sites" ground rule) and docs/progress.md's "16 Oct 2026" entry.
--
-- Fix has two parts:
--   1. site_finder_candidate_id - a stable hash SiteFinder's own
--      stopspotter_export.py now computes (centroid + owner + property),
--      so the importer can recognise a genuine re-scan of the same site
--      without relying on distance at all.
--   2. cluster_root_id - set instead when a candidate matches a
--      DIFFERENT site_finder row by 200m proximity (no candidate_id
--      match): both rows stay fully independent and visible in the admin
--      dashboard - nothing is ever overwritten or hidden there - while
--      public_nominations (below) groups by it to show just one pin, in
--      the general area, rather than two pins on top of each other.
alter table public.nominations
  add column site_finder_candidate_id text;

create unique index nominations_site_finder_candidate_id_idx on public.nominations (site_finder_candidate_id)
where
  site_finder_candidate_id is not null;

comment on column public.nominations.site_finder_candidate_id is 'Stable hash from SiteFinder''s stopspotter_export.py (centroid+owner+property) - lets the importer refresh the SAME real site in place across pipeline re-runs, instead of relying on 200m proximity (which also matches genuinely distinct nearby sites). NULL for source=''user'' rows.';

alter table public.nominations
  add column cluster_root_id uuid references public.nominations (id);

comment on column public.nominations.cluster_root_id is 'Set on a source=site_finder row the importer matched (by 200m proximity) against a DIFFERENT site_finder candidate, not a re-scan of the same one. Points at the earliest row in the group. Both rows stay independently visible in the admin dashboard; public_nominations groups by this to show one pin per cluster. NULL for a site with no nearby match.';

-- Read in public_nominations' grouping below (via security_invoker) even
-- though it's never in the view's own output columns - needs the same
-- explicit grant any such column does (see 0021_grant_public_nominations_column_select.sql,
-- which fixed exactly this class of bug for area_label/why_here_moderation).
grant
select
  (cluster_root_id) on public.nominations to anon,
  authenticated;

-- ── public_nominations ───────────────────────────────────────────────────
-- Same visibility gate and why_here moderation CASE as 0014/0020, now
-- grouped by coalesce(cluster_root_id, id). A row with no cluster_root_id
-- (every 'user'/'both' row, and any site_finder row with no nearby match)
-- is its own singleton group, so nothing changes for the vast majority of
-- rows - the centroid of one point is that same point. Only an actual
-- combined group collapses to a single pin, at the centroid of whichever
-- of its members are themselves currently visible.
create or replace view public.public_nominations
with (security_invoker = true) as
with visible as (
  select
    n.id,
    n.source,
    n.status,
    n.council_area,
    n.place_type,
    n.nearby,
    n.why_here,
    n.why_here_moderation,
    n.pay_band,
    n.verified,
    n.created_at,
    n.area_label,
    n.public_location,
    coalesce(n.cluster_root_id, n.id) as group_id
  from
    public.nominations n
  where
    n.source != 'site_finder'
    or n.status in ('shortlisted', 'live')
),
grouped as (
  select
    group_id,
    count(*) as cluster_size,
    st_centroid (st_collect (public_location::geometry)) as centroid_geom,
    -- Deterministic pick of one member to represent the group's own
    -- fields (council_area, why_here, ...) - the group's root when it's
    -- itself visible, else whichever member sorts first by id.
    (array_agg (id order by (id = group_id) desc, id))[1] as representative_id
  from
    visible
  group by
    group_id
)
select
  g.representative_id as id,
  st_y (g.centroid_geom) as public_lat,
  st_x (g.centroid_geom) as public_lng,
  v.council_area,
  v.place_type,
  v.nearby,
  case
    when v.why_here_moderation = 'flagged' then null
    else v.why_here
  end as why_here,
  v.pay_band,
  v.status,
  v.verified,
  v.created_at,
  v.area_label,
  v.source,
  g.cluster_size
from
  grouped g
  join visible v on v.id = g.representative_id;

grant
select
  on public.public_nominations to anon,
  authenticated;
