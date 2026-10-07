-- StopSpotter — grant hardening (post-launch-setup finding)
--
-- Found by actually querying information_schema.table_privileges and
-- routine_privileges against the real Supabase project once it existed —
-- not something the local bare-Postgres verification in 0001/0002 could
-- have caught, because it doesn't exist on a vanilla Postgres instance.
--
-- Root cause: Supabase projects configure a database-level
-- `ALTER DEFAULT PRIVILEGES ... GRANT ... TO anon, authenticated,
-- service_role` for schema `public`, which auto-grants full table CRUD
-- and function EXECUTE to anon/authenticated AT CREATE TIME for anything
-- the `postgres` role creates there. `revoke ... from public` (used
-- throughout 0001/0002, correctly, for Postgres's OTHER standard
-- default — new functions are EXECUTABLE BY PUBLIC unless revoked) does
-- NOT undo this, because the grant is to the named roles directly, not to
-- the PUBLIC pseudo-role. Only a REVOKE that names anon/authenticated
-- explicitly removes it.
--
-- In every case here, RLS (or, for the admin_*/get_my_* functions, their
-- own current_user_is_admin()/auth.uid() check) was already correctly
-- denying real access — confirmed before this migration, by querying the
-- live grants directly rather than assuming the local verification
-- transferred unchanged. But the raw grants contradicted this project's
-- documented security model (several comments in 0001/0002 claim "no
-- grant — service role only", which was false until this migration), and
-- left no defence in depth: the moment anyone adds an RLS policy to one
-- of these tables without knowing the table grant was already this wide,
-- data could become genuinely exposed in a single policy change instead
-- of needing both a grant and a policy mistake.

revoke all on public.profiles from anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;

revoke all on public.consents from anon, authenticated;
grant select, insert on public.consents to authenticated;

revoke all on public.admins from anon, authenticated;

revoke all on public.landowner_leads from anon, authenticated;
grant insert on public.landowner_leads to anon, authenticated;

revoke all on public.status_history from anon, authenticated;

revoke all on public.moderation_reports from anon, authenticated;
grant insert on public.moderation_reports to anon, authenticated;

revoke all on public.council_boundaries from anon, authenticated;

revoke all on public.public_nominations from anon, authenticated;
grant select on public.public_nominations to anon, authenticated;

-- Functions: same issue — EXECUTE was auto-granted to anon at creation
-- time for every admin/"my data" function, even though each one is
-- authenticated-only. find_nearby_nomination and council_area_for_point
-- are untouched — those are intentionally callable by anon.
revoke execute on function public.current_user_is_admin () from anon;
revoke execute on function public.admin_list_nominations () from anon;
revoke execute on function public.admin_update_nomination_status (uuid, text, text, text) from anon;
revoke execute on function public.admin_list_status_history (uuid) from anon;
revoke execute on function public.admin_list_landowner_leads (uuid) from anon;
revoke execute on function public.admin_list_moderation_reports (boolean) from anon;
revoke execute on function public.admin_resolve_moderation_report (uuid) from anon;
revoke execute on function public.get_my_nominations () from anon;
revoke execute on function public.get_my_votes () from anon;

-- Trigger-only function, called by no one directly — this one kept
-- Postgres's OTHER standard default (new functions are executable by
-- PUBLIC unless revoked, the thing 0001/0002's own comments already
-- warn about) rather than the Supabase per-role default privilege, so it
-- needed "from public", not "from anon, authenticated", to actually
-- clear — both are included so the fix doesn't depend on remembering
-- which default a given function happened to pick up.
revoke execute on function public.enforce_nomination_rate_limit () from public;
revoke execute on function public.enforce_nomination_rate_limit () from anon, authenticated;

-- Performance advisor: auth.uid() in a USING/WITH CHECK clause is
-- re-evaluated per row; (select auth.uid()) evaluates it once per query
-- instead. Pure query-plan change, identical semantics (Supabase's own
-- documented recommendation).
alter policy "Users manage their own profile" on public.profiles
  using ((select auth.uid ()) = id)
  with check ((select auth.uid ()) = id);

alter policy "Users insert their own consents" on public.consents
  with check ((select auth.uid ()) = user_id);

alter policy "Users read their own consents" on public.consents
  using ((select auth.uid ()) = user_id);

alter policy "Authenticated users insert their own vote" on public.votes
  with check ((select auth.uid ()) = user_id);

-- NOT fixed, and why: PostGIS's own spatial_ref_sys table (and its
-- geography_columns/geometry_columns catalog views) picked up the same
-- default-privilege over-grant, but they're owned by `supabase_admin`,
-- not `postgres` — REVOKE silently has no effect on a grant made by a
-- different role than the one running this migration, and ALTER TABLE
-- (to add RLS) fails outright with "must be owner of table". This
-- appears to be a platform-wide characteristic of every Supabase+PostGIS
-- project, not something specific to this one, and isn't fixable from
-- the `postgres` role available here. Documented in docs/SETUP.md rather
-- than silently left unmentioned; the realistic exposure is a
-- denial-of-service-style risk to shared SRID metadata (not a data
-- leak), identical for any Supabase project with PostGIS enabled.
