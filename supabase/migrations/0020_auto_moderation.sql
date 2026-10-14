-- StopSpotter — automatic content moderation on "why here" free text
-- (the "Decide on an automatic moderation approach" item in the launch
-- checklist, and the still-open line in docs/BUILD_PLAN.md's Milestone 2/3
-- rows: "Automatic AI moderation check ... ⬜ Not implemented").
--
-- docs/BUILD_PLAN.md's own "Map visibility" table already specified the
-- intended behaviour: "Why here" text shows publicly "After moderation",
-- always visible to admin. Nothing enforced that until now — the public
-- view exposed why_here unconditionally the instant a nomination was
-- inserted, with zero moderation gate.
--
-- why_here_moderation defaults to 'clear', not 'pending' — a fail-OPEN
-- default, deliberately. The alternative (default 'pending', hidden until
-- a check clears it) would have made every nomination's text invisible
-- the moment this migration runs, forever, for anyone who hasn't yet
-- configured OPENAI_API_KEY as an edge function secret (see
-- supabase/functions/moderate-nomination-text and docs/SETUP.md §16) —
-- turning a missing optional secret into an outage of an existing,
-- already-working feature. Instead: text publishes immediately, same as
-- today, and the moderate-nomination-text function (called once, right
-- after insert, from useAppStore's ensureNominationSaved) flips this to
-- 'flagged' — hiding the text retroactively, usually within a second or
-- two of submission — only on an actual confirmed OpenAI moderation hit.
-- If OPENAI_API_KEY isn't set, that function no-ops and this column never
-- leaves 'clear': equivalent to today's total absence of automatic
-- moderation, not a new failure mode.
alter table public.nominations
add column why_here_moderation text not null default 'clear' check (
  why_here_moderation in ('clear', 'flagged')
);

-- Same "create or replace view" pattern as 0009_area_label.sql/
-- 0014_site_finder_admin_and_public_view.sql — no drop needed to add a
-- case expression over an existing column.
create or replace view public.public_nominations
with (security_invoker = true) as
select
  id,
  st_y (public_location::geometry) as public_lat,
  st_x (public_location::geometry) as public_lng,
  council_area,
  place_type,
  nearby,
  case
    when why_here_moderation = 'flagged' then null
    else why_here
  end as why_here,
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

-- admin_list_nominations (0012's version, still current) selects
-- n.why_here straight off the base table with no case expression — admin
-- always sees the real text regardless of moderation status, matching
-- that same "Map visibility" table's "Always" column for admin. No change
-- needed there.
