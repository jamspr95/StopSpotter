-- StopSpotter — fix a datatype mismatch in admin_list_nominations
--
-- 0011_submitter_details.sql's admin_list_nominations declared its new
-- submitter_email OUT column as text and selected auth.users.email
-- straight through — but that column is actually character varying(255),
-- not text. Plain SQL coerces varchar -> text implicitly, but PL/pgSQL's
-- RETURN QUERY checks the query's column types against the function's
-- declared return type more strictly and doesn't, so every call failed
-- with 42804 (datatype_mismatch) the moment this ran for real (caught via
-- the live admin dashboard right after deploy — a direct SQL exercise of
-- the underlying join during testing didn't hit this, since that wasn't
-- going through RETURN QUERY). Fix is just an explicit cast at the
-- source; the function's declared return shape is unchanged, so this is
-- a plain CREATE OR REPLACE, no drop/rename needed.
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
  vote_count bigint,
  area_label text,
  submitter_email text,
  submitter_first_name text,
  submitter_was_claimed boolean
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
    n.submitter_was_claimed
  from public.nominations n
  left join auth.users au on au.id = n.user_id
  left join public.profiles p on p.id = n.user_id
  order by n.created_at desc;
end;
$$;
