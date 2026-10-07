-- StopSpotter — initial schema (Milestone 2)
--
-- Maps onto the data model in docs/BUILD_PLAN.md, with two differences worth
-- noting in that doc too:
--   1. "users" is implemented as `profiles`, a 1:1 extension of Supabase
--      Auth's own `auth.users` (which already holds email + verification
--      state) rather than a duplicate users table.
--   2. Exact coordinates, ownership/criteria detail and landowner leads are
--      kept out of anon/authenticated SELECT via column-level grants (see
--      the "Column privileges" section), not just RLS row filters — RLS
--      alone can't hide a column on an otherwise-readable row.
--
-- Run this against a fresh Supabase project with the Postgres/PostGIS
-- extensions it already ships with enabled (see docs/SETUP.md).

create extension if not exists postgis;

-- ── profiles ─────────────────────────────────────────────────────────────
-- One row per verified (or pending-verification) Supabase Auth user.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  source text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users manage their own profile"
  on public.profiles for all
  using (auth.uid () = id)
  with check (auth.uid () = id);

-- RLS policies only filter rows within what a role's base grant already
-- allows — without this, Postgres denies the operation before the policy
-- is even evaluated. Every table below needs one of these.
grant select, insert, update, delete on public.profiles to authenticated;

-- ── consents ─────────────────────────────────────────────────────────────
-- Insert-only — never updated or overwritten, so the list stays defensible.
create table public.consents (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('news', 'support')),
  granted boolean not null,
  wording_version text not null,
  created_at timestamptz not null default now()
);

create index consents_user_id_idx on public.consents (user_id);

alter table public.consents enable row level security;

create policy "Users insert their own consents"
  on public.consents for insert
  with check (auth.uid () = user_id);

create policy "Users read their own consents"
  on public.consents for select
  using (auth.uid () = user_id);

grant select, insert on public.consents to authenticated;

-- No update/delete grant or policy for anon/authenticated — consents are append-only.
-- ── nominations ──────────────────────────────────────────────────────────
create table public.nominations (
  id uuid primary key default gen_random_uuid (),
  user_id uuid references auth.users (id) on delete set null,
  exact_location geography (point, 4326) not null,
  public_location geography (point, 4326) not null,
  council_area text,
  place_type text not null check (
    place_type in (
      'unused_land',
      'grass_field',
      'lay_by',
      'car_park',
      'other'
    )
  ),
  owner_type text not null check (
    owner_type in (
      'council',
      'public_body',
      'business',
      'private_individual',
      'i_own_it',
      'dont_know'
    )
  ),
  nearest_house text not null check (
    nearest_house in (
      'under_20m',
      '20_50m',
      'over_50m',
      'not_sure'
    )
  ),
  slope text not null check (slope in ('flat', 'gentle_slope', 'steep')),
  room_for_five text not null check (room_for_five in ('yes', 'not_sure', 'no')),
  nearby text[] not null default '{}',
  water text not null check (
    water in ('toilet_block', 'water_tap', 'both', 'dont_know')
  ),
  why_here text check (char_length(why_here) <= 280),
  pay_band text not null check (
    pay_band in ('free_only', 'up_to_10', '10_15', '15_20', '20_plus')
  ),
  criteria_score int not null default 0,
  criteria_flags text[] not null default '{}',
  ownership_hint text,
  status text not null default 'submitted' check (
    status in (
      'submitted',
      'under_review',
      'shortlisted',
      'live',
      'not_suitable'
    )
  ),
  verified boolean not null default false,
  source text not null default 'user' check (source in ('user', 'site_finder', 'both')),
  created_at timestamptz not null default now()
);

create index nominations_public_location_idx on public.nominations using gist (public_location);

create index nominations_exact_location_idx on public.nominations using gist (exact_location);

create index nominations_status_idx on public.nominations (status);

create index nominations_user_id_idx on public.nominations (user_id);

-- 50 nominations/user/day — docs/BUILD_PLAN.md anti-gaming cap.
--
-- security definer: this trigger fires for every insert, including anon's
-- and authenticated's own — and neither role has SELECT on user_id or
-- created_at (see the column grants later in this file). Without definer
-- rights the count query below fails with "permission denied" and blocks
-- every insert, not just the 51st.
create or replace function public.enforce_nomination_rate_limit ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    if (
      select count(*) from public.nominations
      where user_id = new.user_id
        and created_at > now() - interval '1 day'
    ) >= 50 then
      raise exception 'Daily nomination limit reached';
    end if;
  end if;
  return new;
end;
$$;

create trigger nominations_rate_limit before insert on public.nominations
for each row
execute function public.enforce_nomination_rate_limit ();

alter table public.nominations enable row level security;

-- Anyone (including anonymous nominations) can submit a nomination.
create policy "Anyone can insert a nomination"
  on public.nominations for insert
  with check (true);

-- Row-level read access stays open; the sensitive columns (exact_location,
-- owner_type, criteria_score, criteria_flags, ownership_hint) are hidden via
-- column privileges below rather than a second, narrower table/view.
create policy "Public can read nominations"
  on public.nominations for select
  using (true);

-- ── landowner_leads ──────────────────────────────────────────────────────
-- Admin-only data — see column privileges; no SELECT grant to anon/authenticated at all.
create table public.landowner_leads (
  id uuid primary key default gen_random_uuid (),
  nomination_id uuid not null references public.nominations (id) on delete cascade,
  owner_name_or_org text,
  how_known text check (
    how_known in (
      'i_own_it',
      'i_know_them',
      'public_information',
      'dont_know'
    )
  ),
  contact text,
  happy_to_be_contacted boolean,
  created_at timestamptz not null default now()
);

create index landowner_leads_nomination_id_idx on public.landowner_leads (nomination_id);

alter table public.landowner_leads enable row level security;

create policy "Anyone can insert a landowner lead"
  on public.landowner_leads for insert
  with check (true);

grant insert on public.landowner_leads to anon, authenticated;

-- No select/update/delete grant or policy for anon/authenticated — admin (service role) only.
-- ── votes ────────────────────────────────────────────────────────────────
create table public.votes (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  nomination_id uuid not null references public.nominations (id) on delete cascade,
  pay_band text not null check (
    pay_band in ('free_only', 'up_to_10', '10_15', '15_20', '20_plus')
  ),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, nomination_id) -- one vote per user per nomination (anti-gaming)
);

create index votes_nomination_id_idx on public.votes (nomination_id);

alter table public.votes enable row level security;

create policy "Authenticated users insert their own vote"
  on public.votes for insert
  with check (auth.uid () = user_id);

-- Row-level read is open; user_id is hidden from anon/authenticated via
-- column privileges so a vote count/pay-share can be read without exposing
-- who voted for what.
create policy "Public can read votes"
  on public.votes for select
  using (true);

-- ── status_history ───────────────────────────────────────────────────────
-- Admin/pipeline-only (written by the Brevo webhook handler — see
-- docs/BUILD_PLAN.md "Sales pipeline (Brevo CRM)"). No anon/authenticated
-- policies at all; service role only.
create table public.status_history (
  id uuid primary key default gen_random_uuid (),
  nomination_id uuid not null references public.nominations (id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by text,
  note text,
  created_at timestamptz not null default now()
);

create index status_history_nomination_id_idx on public.status_history (nomination_id);

alter table public.status_history enable row level security;

-- ── moderation_reports ───────────────────────────────────────────────────
create table public.moderation_reports (
  id uuid primary key default gen_random_uuid (),
  nomination_id uuid not null references public.nominations (id) on delete cascade,
  reporter_id uuid references auth.users (id) on delete set null,
  reason text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.moderation_reports enable row level security;

create policy "Anyone can report a stop"
  on public.moderation_reports for insert
  with check (true);

grant insert on public.moderation_reports to anon, authenticated;

-- No select grant or policy — reports are admin-only (service role).
-- ── council_boundaries ───────────────────────────────────────────────────
-- Empty until the ONS local authority boundary data is loaded — see
-- docs/SETUP.md "Load council boundaries". council_area_for_point()
-- returns null until then, and the app falls back to its placeholder label.
create table public.council_boundaries (
  id uuid primary key default gen_random_uuid (),
  name text not null,
  geom geography (multipolygon, 4326) not null
);

create index council_boundaries_geom_idx on public.council_boundaries using gist (geom);

create or replace function public.council_area_for_point (pt geography)
returns text
language sql
stable
as $$
  select name from public.council_boundaries
  where st_contains(geom::geometry, pt::geometry)
  limit 1;
$$;

-- council_boundaries has RLS enabled with no policies at all (service role
-- only to load/manage it); council_area_for_point() is SECURITY DEFINER so
-- the public RPC below can still read it without a direct table grant.
alter table public.council_boundaries enable row level security;

alter function public.council_area_for_point (geography) security definer
set
  search_path = public;

-- Postgres grants EXECUTE on every new function to PUBLIC (i.e. every role,
-- anon included) by default — revoke that before granting it back
-- explicitly, or the "to anon, authenticated" below is decorative.
revoke execute on function public.council_area_for_point (geography)
from
  public;

grant
execute on function public.council_area_for_point (geography) to anon,
authenticated;

-- ── find_nearby_nomination ───────────────────────────────────────────────
-- Server-side duplicate-pin check (200m) — docs/BUILD_PLAN.md "Interaction
-- rules". exact_location isn't in anon/authenticated's column grant (see
-- below), so the client can't do this check itself against a fetched list —
-- this RPC is the only way to run it.
create or replace function public.find_nearby_nomination (pt geography, radius_m int default 200)
returns table (id uuid, place_type text, status text)
language sql
stable
as $$
  select n.id, n.place_type, n.status
  from public.nominations n
  where st_dwithin(n.exact_location, pt, radius_m)
  order by st_distance(n.exact_location, pt)
  limit 1;
$$;

alter function public.find_nearby_nomination (geography, int) security definer
set
  search_path = public;

revoke execute on function public.find_nearby_nomination (geography, int)
from
  public;

grant
execute on function public.find_nearby_nomination (geography, int) to anon,
authenticated;

-- ── get_my_nominations / get_my_votes ────────────────────────────────────
-- "My Stops" needs a user's own full submissions — including columns
-- (exact_location, owner_type, criteria_score, user_id) that the public
-- column grants below deliberately withhold from everyone. Postgres column
-- privileges are role-wide, not row-conditional, so there's no grant that
-- means "only this column on rows you own" — a SECURITY DEFINER function
-- filtered to auth.uid() is the standard way to do that instead.
create or replace function public.get_my_nominations ()
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
  created_at timestamptz
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
    ownership_hint, status, verified, created_at
  from public.nominations
  where user_id = auth.uid ();
$$;

alter function public.get_my_nominations () security definer
set
  search_path = public;

revoke execute on function public.get_my_nominations ()
from
  public;

grant
execute on function public.get_my_nominations () to authenticated;

create or replace function public.get_my_votes ()
returns table (
  id uuid,
  nomination_id uuid,
  pay_band text,
  verified boolean,
  created_at timestamptz
)
language sql
stable
as $$
  select id, nomination_id, pay_band, verified, created_at
  from public.votes
  where user_id = auth.uid ();
$$;

alter function public.get_my_votes () security definer
set
  search_path = public;

revoke execute on function public.get_my_votes ()
from
  public;

grant
execute on function public.get_my_votes () to authenticated;

-- ── Column privileges ────────────────────────────────────────────────────
-- RLS controls which ROWS a role can see; it can't hide a COLUMN on a row
-- the role is otherwise allowed to read. Exact coordinates, ownership
-- detail and criteria scoring stay admin-only (service role, which bypasses
-- grants and RLS both) via explicit column grants instead.
revoke all on public.nominations
from
  anon,
  authenticated;

grant insert on public.nominations to anon,
authenticated;

-- Column grant on the base table itself (kept narrow — no exact_location,
-- owner_type, criteria_score/flags or ownership_hint) so SELECT * still
-- fails cleanly rather than silently widening later. The app reads through
-- the view below instead: PostgREST returns a `geography` column as raw
-- WKB hex, not something the browser can use, and the view decomposes
-- public_location into plain lat/lng floats server-side. With
-- security_invoker on, the view enforces this same grant (and RLS) for
-- whichever role queries it — it doesn't bypass either.
grant
select
  (
    id,
    public_location,
    council_area,
    place_type,
    nearby,
    why_here,
    pay_band,
    status,
    verified,
    created_at
  ) on public.nominations to anon,
  authenticated;

create view public.public_nominations
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
  created_at
from
  public.nominations;

-- security_invoker means this view runs with the QUERYING role's own RLS,
-- same as querying the table directly — it doesn't widen access, it just
-- reshapes the columns that policy already allows that role to read.
grant
select
  on public.public_nominations to anon,
  authenticated;

revoke all on public.votes
from
  anon,
  authenticated;

grant insert on public.votes to authenticated;

grant
select
  (id, nomination_id, pay_band, verified, created_at) on public.votes to anon,
  authenticated;
