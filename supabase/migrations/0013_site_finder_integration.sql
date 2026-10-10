-- StopSpotter — SiteFinder integration (one shared targets table)
--
-- Written on the SiteFinder side (jamspr95/sitefinder,
-- integration/stopspotter/0011_site_finder_integration.sql, branch
-- claude/jolly-cori-m0aetz) against a read-only clone of this repo's
-- 0001-0010 migrations, before this repo's own 0011/0012 existed —
-- renumbered to 0013 here rather than copied in verbatim as "0011" to
-- avoid colliding with 0011_submitter_details.sql /
-- 0012_admin_list_nominations_email_cast_fix.sql, which were applied live
-- first. Reviewed against the real, now-provisioned Supabase project
-- (dtohccqhupuaclwskvos) before being copied in — no schema conflicts
-- found; see 0014_site_finder_admin_and_public_view.sql for the two
-- follow-on changes that review surfaced (admin_list_nominations needs
-- the new columns too; the public view needs `source` so the map can
-- render a "Suggested by AireStop" marker, gated to shortlisted/live).
--
-- Implements the "Relationship to the site finder" section of
-- docs/PROJECT_PLAN.md: SiteFinder's automated land-scanning pipeline and
-- StopSpotter's own user nominations live in this one `nominations` table,
-- distinguished by `source` (already in 0001_init.sql's check constraint:
-- 'user' | 'site_finder' | 'both') rather than a second parallel table —
-- so every lead has a single record whichever tool found it, and a 200m
-- match between the two (find_nearby_nomination, already in
-- 0001_init.sql) can later flip a row's source to 'both'. That matching
-- logic itself is NOT built here — this migration is the shared table
-- only, not the merge pipeline (see scripts/import-sitefinder-candidates.mjs
-- for that).
--
-- Two problems to solve for a site_finder row, neither of which the
-- original schema (built for a human filling in the 8-question form)
-- anticipated:
--
--   1. Several NOT NULL columns (place_type, owner_type, nearest_house,
--      slope, room_for_five, water, pay_band) have no honest answer from
--      SiteFinder's pipeline - it never asks "would you stay here?" or
--      measures distance to the nearest house as a category, and
--      pay_band especially has no safe default: every value in
--      StopSpotter's own enum asserts something about willingness to pay
--      that nothing in SiteFinder supports. Relaxed to nullable, but only
--      for source != 'user' rows, via a conditional check constraint
--      rather than dropping NOT NULL outright - a human nomination must
--      still answer every question. (owner_type and slope DO get a real
--      SiteFinder-derived value most of the time - see
--      src/sitefinder/stopspotter_export.py on the SiteFinder side - but
--      the column itself must allow null for the rare case it can't.)
--   2. SiteFinder computes real data StopSpotter's schema has no column
--      for at all (0-1 score, per-component scores, slope %, capacity in
--      pitches, ownership confidence, road access, usable area, coast
--      distance). New nullable columns, all prefixed site_finder_ or
--      otherwise distinct from StopSpotter's own similarly-named fields,
--      so it's obvious at a glance which rows populate them.
--
-- Deliberately NOT attempted here: converting SiteFinder's 0-1 score into
-- nominations.criteria_score (StopSpotter's own 8-question point total,
-- roughly -2 to +7 per docs/BUILD_PLAN.md's scoring table). The two
-- scales measure different things, and forcing one into the other's
-- column would make results incomparable in a way the later "one
-- priority score" pass (docs/PROJECT_PLAN.md) needs to reconcile
-- deliberately, not by accident of which column happened to be reused —
-- done instead as an admin-dashboard-only, unpersisted ranking value, see
-- src/lib/priority.ts.
--
-- Also deliberately unchanged: column-level grants. The existing
-- `revoke all ... grant select (explicit column list)` block in
-- 0001_init.sql already withholds every column not named in that list
-- from anon/authenticated by default - these new columns simply aren't
-- in it, so they stay admin/service-role-only without any extra revoke
-- needed here.
alter table public.nominations
  add column site_finder_score numeric check (site_finder_score between 0 and 1),
  add column site_finder_component_scores jsonb,
  add column site_finder_flags text[] not null default '{}',
  add column usable_area_m2 numeric,
  add column capacity_pitches int,
  add column avg_slope_percent numeric,
  add column slope_source text,
  add column road_access text check (road_access in ('good', 'fair', 'poor', 'unknown')),
  add column ownership_confidence_detail text check (
    ownership_confidence_detail in ('high', 'medium', 'low', 'unknown')
  ),
  add column coast_distance_m numeric;

comment on column public.nominations.site_finder_score is
  'SiteFinder''s own 0-1 overall score (config/scoring.yaml in the SiteFinder repo) - not comparable to criteria_score, StopSpotter''s unrelated point-based scale. NULL for source=''user'' rows.';

comment on column public.nominations.ownership_confidence_detail is
  'SiteFinder''s own high/medium/low/unknown ownership confidence - distinct from criteria_score/ownership_hint, which cover StopSpotter''s own nomination flow.';

-- Drop the five form-specific NOT NULLs and replace with "required only
-- when a human filled in the form" - a site_finder row (and a
-- not-yet-merged 'both' row originating as a site_finder candidate before
-- any user confirms it) legitimately has none of these.
alter table public.nominations
  alter column place_type drop not null,
  alter column owner_type drop not null,
  alter column nearest_house drop not null,
  alter column slope drop not null,
  alter column room_for_five drop not null,
  alter column water drop not null,
  alter column pay_band drop not null;

alter table public.nominations
  add constraint nominations_user_source_requires_form_answers check (
    source != 'user'
    or (
      place_type is not null and owner_type is not null and nearest_house is not null
      and slope is not null and room_for_five is not null and water is not null
      and pay_band is not null
    )
  );

-- Initial status for a freshly-scanned, not-yet-triaged candidate.
-- Reuses the existing status enum's 'under_review' rather than adding a
-- new value - "awaiting admin triage" is what that value already means
-- for a user nomination too (docs/BUILD_PLAN.md's admin pipeline), and a
-- site_finder row needs exactly the same thing: a human decides whether
-- it's good enough to move to 'shortlisted'/'live', or 'not_suitable'.
comment on column public.nominations.status is
  'submitted/under_review/shortlisted/live/not_suitable - for source=''site_finder'' rows, the import script (scripts/import-sitefinder-candidates.mjs) sets the initial status to ''submitted'', same as any fresh human nomination (this table''s own default) - so it enters the exact same AdminReviewScreen swipe-triage queue, not a separate path. Everything after that is the same admin pipeline as any nomination. Only ''shortlisted''/''live'' site_finder rows are shown on the public map (see 0014_site_finder_admin_and_public_view.sql) - "released in small batches per area" per docs/PROJECT_PLAN.md.';
