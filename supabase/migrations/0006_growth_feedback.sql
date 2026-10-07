-- StopSpotter — Support page "help us grow" quick feedback
--
-- Replaces the static "Coming soon: crowdfunder" placeholder with a tiny
-- insert-only form: tap one or more quick options and/or leave free text.
-- Same insert-only, admin-only-read shape as analytics_events/
-- moderation_reports — this is Jamie's signal on how to grow StopSpotter,
-- not something the submitting browser needs to read back.
create table public.growth_feedback (
  id uuid primary key default gen_random_uuid (),
  options text[] not null default '{}',
  message text,
  created_at timestamptz not null default now(),
  constraint growth_feedback_not_empty check (
    cardinality(options) > 0
    or message is not null
  )
);

create index growth_feedback_created_at_idx on public.growth_feedback (created_at);

alter table public.growth_feedback enable row level security;

create policy "Anyone can leave growth feedback"
  on public.growth_feedback for insert
  with check (true);

-- Explicitly named (not "from public") from the start — see
-- 0003_grant_hardening.sql: Supabase auto-grants full CRUD to anon/
-- authenticated on every new table at creation time, independent of the
-- PUBLIC pseudo-role, so "revoke ... from public" alone wouldn't clear it.
revoke all on public.growth_feedback from anon, authenticated;
grant insert on public.growth_feedback to anon, authenticated;
