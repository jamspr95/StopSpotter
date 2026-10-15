-- StopSpotter — fix "nominations never show on the public map" (found
-- diagnosing the Cloudflare deploy, but unrelated to hosting: this is a
-- pre-existing schema bug that would have failed identically on GitHub
-- Pages the moment it ever ran with real Supabase credentials against a
-- row that reached the public view).
--
-- Root cause: public_nominations has security_invoker = true, so it
-- enforces the QUERYING role's own column grants on the underlying
-- nominations table — same as querying the table directly — for every
-- column the view's query touches, including ones only read inside a
-- WHERE/CASE expression, not just ones in its final output list.
-- Granting SELECT on the view itself (which every migration below did)
-- isn't enough on its own.
--
-- Two columns were missed this way as the view grew:
--   - area_label (0009_area_label.sql): added to the view's SELECT list,
--     but no `select (area_label) on nominations` grant alongside it.
--   - why_here_moderation (0020_auto_moderation.sql): read inside a CASE
--     expression (`case when why_here_moderation = 'flagged' then null
--     else why_here end`), same gap.
--
-- Reproduced directly: `set role anon; select * from
-- public.public_nominations;` raised `42501: permission denied for table
-- nominations` — exactly the 401 PostgREST returned to the deployed app
-- (Proxy-Status: PostgREST; error=42501), confirmed via a browser
-- devtools Network tab. Confirmed via information_schema.column_privileges
-- that every other column the view reads already had anon/authenticated
-- SELECT; granting area_label alone still 42501'd until why_here_moderation
-- was added too — re-ran the `set role anon` repro after each grant to
-- confirm.
grant
select
  (area_label, why_here_moderation) on public.nominations to anon,
  authenticated;
