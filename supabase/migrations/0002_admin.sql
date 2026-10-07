-- StopSpotter — admin schema (Milestone 3)
--
-- Adds an admin role and the server-side functions the admin dashboard
-- needs to read data that's deliberately hidden from anon/authenticated in
-- 0001_init.sql (exact_location, owner_type, criteria_score/flags,
-- landowner_leads, status_history, moderation_reports beyond insert).
--
-- Why a separate `admins` table rather than an `is_admin` column on
-- `profiles`: profiles already has a "Users manage their own profile" FOR
-- ALL policy keyed on auth.uid() = id — an is_admin column there would let
-- any signed-in user grant themselves admin via that same policy. A
-- standalone table with NO anon/authenticated policies at all (service
-- role only) can't be self-granted; see docs/SETUP.md for how an admin
-- account is actually created (manual, one-time, via the Supabase
-- dashboard).
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- No policies for anon/authenticated — admins is service-role only, by
-- design (see comment above). current_user_is_admin() below is how every
-- other admin function checks it without needing a direct grant.

create or replace function public.current_user_is_admin ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid ());
$$;

revoke execute on function public.current_user_is_admin ()
from
  public;

grant
execute on function public.current_user_is_admin () to authenticated;

-- ── admin_list_nominations ───────────────────────────────────────────────
-- Full nomination detail (every column the public view and column grants
-- withhold), plus a vote count for the stop-list "vote count" filter/sort.
create or replace function public.admin_list_nominations ()
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
  vote_count bigint
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
    (select count(*) from public.votes v where v.nomination_id = n.id)
  from public.nominations n
  order by n.created_at desc;
end;
$$;

revoke execute on function public.admin_list_nominations ()
from
  public;

grant
execute on function public.admin_list_nominations () to authenticated;

-- ── admin_update_nomination_status ───────────────────────────────────────
-- The only way nominations.status ever changes — there's deliberately no
-- UPDATE policy on nominations for anon/authenticated (0001_init.sql), so
-- this is also where the Brevo webhook handler (Milestone 3, see
-- docs/SETUP.md) will eventually write through once that's wired up; for
-- now it's how the admin dashboard changes status manually.
create or replace function public.admin_update_nomination_status (
  p_nomination_id uuid,
  p_new_status text,
  p_note text default null,
  p_changed_by text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status text;
  v_changed_by text;
begin
  if not current_user_is_admin () then
    raise exception 'not authorized';
  end if;

  if p_new_status not in ('submitted', 'under_review', 'shortlisted', 'live', 'not_suitable') then
    raise exception 'invalid status: %', p_new_status;
  end if;

  select status into v_old_status from public.nominations where id = p_nomination_id;
  if v_old_status is null then
    raise exception 'nomination not found';
  end if;

  v_changed_by := coalesce(
    p_changed_by,
    (select email from auth.users where id = auth.uid ()),
    auth.uid ()::text
  );

  update public.nominations set status = p_new_status where id = p_nomination_id;

  insert into public.status_history (nomination_id, from_status, to_status, changed_by, note)
  values (p_nomination_id, v_old_status, p_new_status, v_changed_by, p_note);
end;
$$;

revoke execute on function public.admin_update_nomination_status (uuid, text, text, text)
from
  public;

grant
execute on function public.admin_update_nomination_status (uuid, text, text, text) to authenticated;

-- ── admin_list_status_history ────────────────────────────────────────────
create or replace function public.admin_list_status_history (p_nomination_id uuid)
returns table (
  id uuid,
  from_status text,
  to_status text,
  changed_by text,
  note text,
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
  select h.id, h.from_status, h.to_status, h.changed_by, h.note, h.created_at
  from public.status_history h
  where h.nomination_id = p_nomination_id
  order by h.created_at desc;
end;
$$;

revoke execute on function public.admin_list_status_history (uuid)
from
  public;

grant
execute on function public.admin_list_status_history (uuid) to authenticated;

-- ── admin_list_landowner_leads ───────────────────────────────────────────
-- A nomination can have more than one lead (the vote flow's "owner unknown"
-- case adds its own row rather than editing the original — see
-- 0001_init.sql), so this is per-nomination rather than one-to-one.
create or replace function public.admin_list_landowner_leads (p_nomination_id uuid)
returns table (
  id uuid,
  owner_name_or_org text,
  how_known text,
  contact text,
  happy_to_be_contacted boolean,
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
  select l.id, l.owner_name_or_org, l.how_known, l.contact, l.happy_to_be_contacted, l.created_at
  from public.landowner_leads l
  where l.nomination_id = p_nomination_id
  order by l.created_at desc;
end;
$$;

revoke execute on function public.admin_list_landowner_leads (uuid)
from
  public;

grant
execute on function public.admin_list_landowner_leads (uuid) to authenticated;

-- ── Moderation queue ──────────────────────────────────────────────────────
-- "Flagged free text + pins + reports" per docs/BUILD_PLAN.md's Milestone 3
-- scope — but the automatic AI moderation check it also lists is NOT
-- implemented (no content-moderation API wired up; genuinely open, see
-- docs/BUILD_PLAN.md). What exists today is the user-submitted report path
-- (moderation_reports), so that's what this queue surfaces; there is no
-- automatic flagging of free text or pins yet.
create or replace function public.admin_list_moderation_reports (p_include_resolved boolean default false)
returns table (
  id uuid,
  nomination_id uuid,
  reporter_id uuid,
  reason text,
  resolved boolean,
  created_at timestamptz,
  nomination_place_type text,
  nomination_council_area text,
  nomination_why_here text,
  nomination_status text
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
    r.id, r.nomination_id, r.reporter_id, r.reason, r.resolved, r.created_at,
    n.place_type, n.council_area, n.why_here, n.status
  from public.moderation_reports r
  join public.nominations n on n.id = r.nomination_id
  where p_include_resolved or not r.resolved
  order by r.created_at desc;
end;
$$;

revoke execute on function public.admin_list_moderation_reports (boolean)
from
  public;

grant
execute on function public.admin_list_moderation_reports (boolean) to authenticated;

create or replace function public.admin_resolve_moderation_report (p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not current_user_is_admin () then
    raise exception 'not authorized';
  end if;

  update public.moderation_reports set resolved = true where id = p_report_id;
end;
$$;

revoke execute on function public.admin_resolve_moderation_report (uuid)
from
  public;

grant
execute on function public.admin_resolve_moderation_report (uuid) to authenticated;
