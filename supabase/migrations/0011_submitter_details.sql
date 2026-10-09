-- StopSpotter — submitter details on the admin review card
--
-- Design spec update (admin tracking, review page): every site's admin
-- view should show the nominator's email, first name if given, and a way
-- to see the other sites that same submitter has suggested with each
-- one's status — "a reliable spotter or a one-off" at a glance. Admin-only,
-- never public.
--
-- Email/first name are read live (auth.users/profiles joined by user_id)
-- rather than copied onto the nomination row, so they always reflect the
-- current account rather than a stale snapshot. That alone can't tell
-- "never had a submitter" (user_id always null) apart from "had one, the
-- account's since been deleted" (user_id went null via the nominations
-- table's own `on delete set null`, 0001_init.sql) — both look identical
-- once the account is gone. submitter_was_claimed is a one-way flag for
-- exactly that: set once in claim_nomination and never cleared, so it
-- survives the user_id going null.
alter table public.nominations
add column submitter_was_claimed boolean not null default false;

-- Backfill: anything that already has a user_id was obviously claimed.
update public.nominations
set
  submitter_was_claimed = true
where
  user_id is not null;

create or replace function public.claim_nomination (p_nomination_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'not authenticated';
  end if;

  update public.nominations
  set
    user_id = auth.uid (),
    verified = true,
    submitter_was_claimed = true
  where
    id = p_nomination_id
    and user_id is null;
end;
$$;

revoke execute on function public.claim_nomination (uuid)
from
  public;

revoke execute on function public.claim_nomination (uuid)
from
  anon,
  authenticated;

grant
execute on function public.claim_nomination (uuid) to authenticated;

-- ── admin_list_nominations ───────────────────────────────────────────────
-- Adds three OUT columns, which CREATE OR REPLACE can't do for a
-- table-returning function — needs a real drop. Tried a plain DROP
-- FUNCTION first; it timed out against this project again (same as
-- 0009_area_label.sql, confirmed via pg_stat_activity showing nothing
-- blocked — not a lock, this command category just misbehaves here), and
-- the whole migration rolled back cleanly rather than partially applying.
-- Same rename-based workaround as 0009: _old_v1 is already taken by that
-- migration's swap, so this one is _old_v2.
alter function public.admin_list_nominations () rename to admin_list_nominations_old_v2;

revoke execute on function public.admin_list_nominations_old_v2 ()
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
    au.email,
    p.first_name,
    n.submitter_was_claimed
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
