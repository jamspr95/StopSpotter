-- StopSpotter — cookieless analytics (Milestone 2 item, picked back up once
-- a real backend existed to log events to)
--
-- No third-party analytics vendor — this is a self-hosted event log: no
-- cookies, no cross-site identifiers, just a fire-and-forget insert per
-- pageview/share/conversion, optionally tagged with a campaign captured
-- from the URL's utm_* params. Lets Jamie answer "did the Facebook post
-- actually drive nominations" without adding an external dependency.
create table public.analytics_events (
  id uuid primary key default gen_random_uuid (),
  event_type text not null check (
    event_type in ('pageview', 'share_click', 'nomination_submit', 'vote_submit')
  ),
  path text,
  campaign text,
  created_at timestamptz not null default now()
);

create index analytics_events_created_at_idx on public.analytics_events (created_at);
create index analytics_events_campaign_idx on public.analytics_events (campaign);

alter table public.analytics_events enable row level security;

create policy "Anyone can log an event"
  on public.analytics_events for insert
  with check (true);

-- Explicitly named (not "from public") from the start — see
-- 0003_grant_hardening.sql for why a plain "revoke ... from public"
-- wouldn't be enough on this platform: Supabase auto-grants full CRUD to
-- anon/authenticated on every new table at creation time, independent of
-- the PUBLIC pseudo-role.
revoke all on public.analytics_events from anon, authenticated;
grant insert on public.analytics_events to anon, authenticated;

-- Admin-only aggregate read — no raw per-event SELECT grant at all (a
-- path+timestamp log is still something worth keeping out of anon/
-- authenticated's reach, same reasoning as the other admin-only tables).
create or replace function public.admin_analytics_summary ()
returns table (
  event_type text,
  campaign text,
  event_count bigint
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
  select a.event_type, a.campaign, count(*)
  from public.analytics_events a
  group by a.event_type, a.campaign
  order by a.event_type, count(*) desc;
end;
$$;

revoke execute on function public.admin_analytics_summary ()
from
  public;

revoke execute on function public.admin_analytics_summary ()
from
  anon;

grant
execute on function public.admin_analytics_summary () to authenticated;
