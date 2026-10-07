# StopSpotter — Backend Setup (Milestone 2)

This is what's needed to turn the Milestone 1 local-only prototype into a
real, persistent backend. None of it can be done from a coding session —
it needs a Supabase account and access to this repo's GitHub settings.

**Until you do this, the deployed app keeps working exactly as it does
today** — no backend configured means no network calls at all, same
Zustand + localStorage behaviour as Milestone 1. Nothing breaks by leaving
this for later.

---

## 1. Create a Supabase project

1. Sign up / log in at [supabase.com](https://supabase.com) and create a new project.
2. Pick a region close to the UK (e.g. `eu-west-2` London, if offered — otherwise the nearest EU region). Data residency matters here: this collects UK users' personal data (email) and site locations.
3. Save the database password somewhere safe — you won't need it for the app itself (that uses the anon key, below), but you'll need it if you ever connect directly with `psql`.

## 2. Run the schema migration

The full schema — tables, Row Level Security policies, the public-safe
view, and the helper functions — is in
[`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).
It's been verified against a real local Postgres + PostGIS instance
(not just written and hoped), so it should apply cleanly as-is.

In the Supabase dashboard: **SQL Editor → New query**, paste the entire
contents of that file, and run it. (If you'd rather use the Supabase CLI —
`supabase link` then `supabase db push` — that works too; the file is a
standard timestamped migration.)

This also enables the PostGIS extension — the first line of the file does
that itself, nothing to toggle manually first.

## 3. Get your API credentials

In the dashboard: **Settings → API**. You need two values:

- **Project URL** (e.g. `https://xxxxx.supabase.co`)
- **anon / public key** (safe to expose client-side — it has no access
  beyond what the migration's RLS policies and column grants allow)

Do **not** use the `service_role` key anywhere in this app — it bypasses
RLS entirely and must never reach the browser.

## 4. Set the environment variables

Two places need these two values:

**For local development** — copy `.env.example` to `.env.local` (already
gitignored) and fill in:
```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

**For the deployed GitHub Pages build** — in this repo's
**Settings → Secrets and variables → Actions → New repository secret**,
add both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The deploy
workflow (`.github/workflows/deploy.yml`) already reads them — nothing
else to change there. The next push (or a manual
**Actions → Deploy prototype to GitHub Pages → Run workflow**) picks them up.

## 5. Configure the magic-link redirect

Supabase only allows auth redirects to URLs you've explicitly allow-listed.
In the dashboard: **Authentication → URL Configuration**, add:

```
https://jamspr95.github.io/StopSpotter/spot/signup
```

(That's the exact URL the app passes as `emailRedirectTo` — see
`sendMagicLink` in `src/lib/db.ts`. If you add a custom domain later,
add that URL too rather than replacing this one, until the old one is
confirmed unused.)

The **Email** auth provider (magic link / OTP) is on by default for a new
Supabase project — nothing to enable there.

### A note on email sending

Supabase's own email sending (used for the OTP/magic link) is rate-limited
and uses a shared sender on the free tier — fine for testing with a handful
of supporters, but if sign-ups stall or emails don't arrive, check
**Authentication → Rate Limits** and consider configuring a custom SMTP
provider (**Authentication → Settings → SMTP Settings**) before a wider
launch.

## 6. Load council boundaries (optional — can come later)

The `council_boundaries` table and `council_area_for_point()` function are
already in the schema, but the table starts empty — the app falls back to
a placeholder label ("Council area — to be confirmed…") until it's loaded.
Nothing breaks by skipping this for now.

To load it:
1. Download the ONS "Local Authority Districts" boundary data (generalised,
   not full resolution — full resolution is far more detail than this
   needs) from the [ONS Open Geography portal](https://geoportal.statistics.gov.uk/) as GeoJSON.
2. Load it into `council_boundaries` with `name` and `geom` columns — the
   Supabase Table Editor's CSV/GeoJSON import, or `ogr2ogr` straight into
   the Postgres connection string from **Settings → Database**, both work.
3. No code or RLS changes needed afterwards — `council_area_for_point()`
   starts returning real names the moment the table has rows.

## 7. Verify it's working

After steps 1–5:
1. Visit the deployed site and open the browser console — there should be
   no errors on load (a failed fetch to Supabase would show here).
2. Nominate a test stop. Check it appears in **Table Editor → nominations**
   in the Supabase dashboard.
3. Use "Submit without email" first (no magic-link round trip needed) to
   confirm the basic write path before testing the full sign-up flow.
4. For the email flow: use a real inbox you can check, since this is a
   genuine email send once configured — there's no "simulate" button once
   Supabase is live (that was Milestone 1's stand-in only).

If something doesn't work, the browser console and the Supabase
dashboard's **Logs** section (both API logs and Auth logs) are the first
places to look — RLS denials and auth errors both show up there.
