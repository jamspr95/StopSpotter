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

### A note on email sending — route it through Brevo

Out of the box, Supabase sends the magic-link email itself, from its own
shared sender (something like `noreply@mail.app.supabase.io`), using its
own generic template copy. Testers have already flagged this — it doesn't
look like it's from AireStop or StopSpotter, which is exactly the kind of
thing that makes a real supporter distrust the email and ignore it.

**Use Brevo for this, not a separate email provider** — it's the account
StopSpotter already plans to use for supporter marketing and the Deals
pipeline (`docs/PROJECT_PLAN.md`'s decisions log, §10 below), so sending
the magic-link email through it too means one account, one sender
reputation to build up, and one place to look at delivery logs, instead of
three different tools for "send a sign-in link", "email supporters" and
"track a sales pipeline". None of this can be done from a coding
session — it's Brevo dashboard + Supabase dashboard work only you can do:

1. **Verify a sending domain in Brevo.** **Brevo → Senders, Domains & IPs →
   Domains → Add a domain.** Enter the domain you want to send from — e.g.
   `airestop.co.uk`, or a subdomain like `stopspotter.airestop.co.uk` if
   you'd rather not touch the main domain's DNS. Brevo shows you 2–3 DNS
   records (SPF, DKIM, and a Brevo-code TXT record) to add wherever that
   domain's DNS is managed; add them, then click **Authenticate this
   domain** in Brevo once they're in (DNS usually propagates within
   minutes, sometimes a few hours).
2. **Add a verified sender.** **Brevo → Senders, Domains & IPs → Senders →
   Add a sender.** Use an address on the domain you just verified, e.g.
   `noreply@airestop.co.uk`, with a sender name like `StopSpotter` or
   `AireStop`.
3. **Get your Brevo SMTP credentials.** **Brevo → Senders, Domains & IPs →
   SMTP & API → SMTP tab.** Brevo shows:
   - **SMTP server**: `smtp-relay.brevo.com`
   - **Port**: `587`
   - **Login**: your Brevo account's login email (shown right there)
   - **Password** / **SMTP key**: click **Generate a new SMTP key** if one
     isn't already listed — this is *not* your Brevo account password,
     it's a separate key just for SMTP sending.
4. **Point Supabase at Brevo.** **Supabase dashboard → Authentication →
   Settings → SMTP Settings** → enable **Custom SMTP** → fill in:
   - **Sender email**: the address from step 2
   - **Sender name**: `StopSpotter` or `AireStop`
   - **Host**: `smtp-relay.brevo.com`
   - **Port**: `587`
   - **Username**: the Login from step 3
   - **Password**: the SMTP key from step 3
   Save, then use the "Send test email" option if the page offers one.
5. **Rewrite the email template.** **Supabase dashboard → Authentication →
   Email Templates → Magic Link** — the default subject/body is generic
   Supabase copy. Replace it with StopSpotter-branded wording (it accepts
   basic HTML and the `{{ .ConfirmationURL }}` placeholder for the actual
   link). Do this for any other templates you expect people to see.
6. **Check it actually sent.** After a real test sign-up, **Brevo →
   Transactional → Email Activity** should show the send — this is also
   where you'd see a bounce or block if delivery ever fails, rather than
   just a missing email with no explanation.

Until this is done, **the rate-limit note still applies too**: Supabase's
shared sender is rate-limited and fine only for a handful of testers —
check **Authentication → Rate Limits** if sign-ups stall.

**This makes Brevo send the email — it doesn't, by itself, store the
email anywhere in Brevo.** Supabase's SMTP setting is a relay: it hands
Brevo a message to deliver and nothing more, it doesn't create a Brevo
Contact. StopSpotter already asks every sign-up for "Send me news" /
"Tell me about ways to support AireStop" consent (`consents` table) —
actually turning those into Brevo contacts/list members for real
marketing use is a separate, not-yet-built integration. See **§10a**
below for what that needs from you.

## 6. Google/Apple/Facebook sign-in — removed (20 Oct 2026)

Google/Apple/Facebook "Continue with…" buttons were built alongside the
email magic-link, gated behind `VITE_SSO_ENABLED` until at least one
provider was configured. Removed before any provider was ever actually
set up: sign-in is email-only (magic link, no password), and offering SSO
alongside that risked confusing sign-in behaviour — e.g. an email-only
account and an OAuth-identity account for the same person not matching up.
There is nothing left to configure here; this step is kept only so the
section numbering below doesn't shift under existing `§N` references
elsewhere in this file and in `docs/BUILD_PLAN.md`/`docs/PROJECT_PLAN.md`.

## 7. Load council boundaries (optional — can come later, admin-only)

The `council_boundaries` table and `council_area_for_point()` function are
already in the schema, but the table starts empty — the app falls back to
a placeholder label ("Council area — to be confirmed…") until it's loaded.
Nothing breaks by skipping this for now.

**This no longer shows on the public stop card** — a tester flagged the
placeholder text as confusing, and the real council/LPA area isn't
something a nominator or voter actually needs to see. The card now shows
a friendly "Near \<town/village\>" label instead, resolved automatically
via free reverse-geocoding the moment a stop is nominated (see
`src/lib/geocode.ts`) — nothing to set up for that part. The formal
council area is still recorded on every nomination and still shown in the
**admin** dashboard (stop list, filters, PDF/CSV reports) — it's just
needed there, for routing the real statutory LPA consultation later, not
on the public-facing card. Loading the boundary data below is what makes
that admin-side value accurate instead of the placeholder.

To load it:
1. Download the ONS "Local Authority Districts" boundary data (generalised,
   not full resolution — full resolution is far more detail than this
   needs) from the [ONS Open Geography portal](https://geoportal.statistics.gov.uk/) as GeoJSON.
2. Load it into `council_boundaries` with `name` and `geom` columns — the
   Supabase Table Editor's CSV/GeoJSON import, or `ogr2ogr` straight into
   the Postgres connection string from **Settings → Database**, both work.
3. No code or RLS changes needed afterwards — `council_area_for_point()`
   starts returning real names the moment the table has rows.

## 8. Verify it's working

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

---

## 9. Admin dashboard access (Milestone 3)

The admin dashboard at `/admin` needs its own schema on top of the base
one — run [`supabase/migrations/0002_admin.sql`](../supabase/migrations/0002_admin.sql)
the same way you ran `0001_init.sql` (SQL Editor → New query → paste →
run). It's been verified the same way as the base schema: against a real
local Postgres+PostGIS instance, with actual role-switched calls exercising
every admin RPC under both an admin and a non-admin signed-in user, plus
`anon` — not just written and hoped.

There's no separate "admin password" scheme — an admin account is a normal
Supabase Auth user that signs in with email + password (rather than the
public app's magic link) and has been added to a server-side `admins`
table. Both steps are manual and one-time:

1. **Dashboard → Authentication → Users → Add user.** Set an email and
   password, and tick "Auto Confirm User" (otherwise it'll wait on a
   confirmation email).
2. **Dashboard → SQL Editor**, run:
   ```sql
   insert into public.admins (user_id)
   values ('paste-the-new-user-id-here');
   ```
   (The user's id is shown in the Users list, or
   `select id from auth.users where email = '...';`.)
3. Sign in at `/admin` with that email and password.

Add more admins the same way. There's deliberately no self-service way to
grant admin — `admins` has no policies for `anon`/`authenticated` at all,
so it can only be written from the dashboard (service role).

## 10. Brevo CRM pipeline and status-sync webhook (optional, Milestone 3)

This is the most externally-dependent piece of Milestone 3 — most of it
can't be verified from a coding session at all, and one planned half
(auto-creating a Brevo deal when a nomination passes moderation) isn't
built yet, because it would mean guessing Brevo's REST API request shape
with no account to test it against. What follows is the half that **is**
built: a webhook receiver that updates a nomination's status when its
linked Brevo deal changes pipeline stage.

1. Confirm the Brevo plan includes the **Deals (CRM)** module, and set up
   a pipeline with stages matching (or mappable to) StopSpotter's status
   enum: `submitted`, `under_review`, `shortlisted`, `live`, `not_suitable`.
2. Add a custom **text field** on the Deal object called `nomination_id`
   — this is what links a Brevo deal back to a StopSpotter row. (Until the
   deal-auto-create half is built, this has to be filled in by hand per
   deal for now.)
3. Deploy the webhook function: `supabase functions deploy brevo-webhook`
   (needs the Supabase CLI, `supabase link`ed to this project first).
4. **Dashboard → Edge Functions → brevo-webhook → Settings**, add a secret
   `BREVO_WEBHOOK_SECRET` (any random string) — the function checks this
   against an `x-webhook-secret` header on every request, so skip this
   step only if you're happy for the endpoint to be unauthenticated.
5. In Brevo: **Automations → New workflow**, trigger **"Deal stage is
   updated"**, action **Webhook**. Point it at
   `https://xxxxx.supabase.co/functions/v1/brevo-webhook`, set the
   `x-webhook-secret` header to match step 4, and build the JSON body as:
   ```json
   { "nomination_id": "{{ deal.nomination_id }}", "stage_name": "{{ deal.stage }}" }
   ```
   (The exact placeholder syntax for deal fields is whatever Brevo's
   workflow editor uses at the time — this wasn't something that could be
   confirmed without a live account.)
6. Edit `STAGE_TO_STATUS` in
   [`supabase/functions/brevo-webhook/index.ts`](../supabase/functions/brevo-webhook/index.ts)
   so its keys exactly match your pipeline's real stage names, then
   redeploy.

**Not built, and why:** auto-creating the Brevo deal itself (so step 2
doesn't have to be manual) needs a real API key to get Brevo's request
shape right and verify it actually works — that's an external-account
dependency this environment can't satisfy, not a decision to skip it.
Same for syncing opted-in supporters to Brevo's marketing lists (§10a
below). Both stay on the Milestone 3 checklist in `docs/BUILD_PLAN.md` as
open.

## 10a. Store sign-up emails in Brevo as contacts (not built yet)

The SMTP setup above makes Brevo *send* the magic-link email — it doesn't
make Brevo *keep* that email address anywhere. Every StopSpotter sign-up
already records consent for two things (the `consents` table, captured by
the checkboxes on the sign-up screen):

- **"Send me news about StopSpotter and AireStop"** — general updates
- **"Tell me about ways to support AireStop, like memberships and
  crowdfunding"** — supporter/funding interest

Turning those into real, usable Brevo contacts needs a small integration
(a Supabase Edge Function or a database webhook calling Brevo's Contacts
API on sign-up) that hasn't been built — same reasoning as the Deals
auto-creation above: guessing Brevo's API request shape without a real
account and a real list to test against risks shipping integration code
that's confidently wrong. What's needed from you to unblock it:

1. **Create the list(s) in Brevo.** **Brevo → Contacts → Lists → Create a
   list.** At minimum, one list for "StopSpotter news" (anyone who ticked
   the first checkbox). If you want supporter-interest people tracked
   separately from general news subscribers, create a second list for
   that too, e.g. "StopSpotter — support interest" — matches how
   landowner-only contacts are already kept on their own list, away from
   marketing sends (`docs/PROJECT_PLAN.md`'s decisions log).
2. **Note each list's ID.** Click into the list — its ID is in the URL
   (`.../contacts/lists/<id>`) or shown on the list's own page. You'll
   need these numbers, not just the list names.
3. **Generate a Brevo API key** (different from the SMTP key above —
   this one's for the Contacts API, not sending mail). **Brevo → SMTP &
   API → API Keys tab → Generate a new API key.** Name it something
   identifiable, like `stopspotter-contacts-sync`.
4. **Send me the list ID(s) and the API key** (the key specifically —
   paste it in chat or add it as a Supabase Edge Function secret yourself
   if you'd rather not share it directly; either way, tell me once it's
   in place) and I'll build the sync: a new row in `consents` with
   `granted = true` adds that person to the matching Brevo list, with
   their first name if they gave one. Until then, consent is recorded in
   StopSpotter's own database (so nothing is lost), it just isn't pushed
   to Brevo yet.

**Interim workflow until the sync is built:** the Support page's "I'd
support a crowdfund" option (and its two "tell us more" siblings) is meant
to be followed up in Brevo CRM specifically, same reasoning as above. The
admin dashboard's **Growth** screen (`/admin/growth`, added in
`0010_growth_feedback_admin.sql`) lists every submission with the
crowdfund ones flagged, so an admin can add that person in Brevo by hand
and then tick **Mark synced to CRM** on that row to track it's done. Once
the automatic sync above is built, this manual step becomes unnecessary.

## 11. Enable the disposable-email sign-up block

[`supabase/migrations/0005_disposable_email.sql`](../supabase/migrations/0005_disposable_email.sql)
adds a `disposable_email_domains` table and a `hook_reject_disposable_email`
Postgres function, but Supabase Auth doesn't call it until you point a
"Before User Created" hook at it — a one-time dashboard toggle:

1. **Dashboard → Authentication → Hooks → Before User Created.**
2. Choose **Postgres Function**, then select `hook_reject_disposable_email`.
3. Save.

That's it — no redeploy, no edge function. It covers every sign-up path
(there's only the one, magic link), since it runs
inside Supabase Auth itself before the user row exists. Nothing breaks by
skipping this step; sign-ups from a disposable address just aren't
blocked server-side yet (the sign-up form's own client-side check in
`src/lib/disposableEmail.ts` still catches the common cases, but that one
a determined actor can route around by calling the API directly).

To add more blocked domains later, just insert more rows:
```sql
insert into public.disposable_email_domains (domain) values ('example-temp-mail.com');
```

## 12. SiteFinder candidate import (optional, Milestone 3)

[`supabase/migrations/0013_site_finder_integration.sql`](../supabase/migrations/0013_site_finder_integration.sql)
and [`0014_site_finder_admin_and_public_view.sql`](../supabase/migrations/0014_site_finder_admin_and_public_view.sql)
implement the "one shared targets table" in `docs/PROJECT_PLAN.md`'s
"Relationship to the site finder" — they're already applied to the live
project, so SiteFinder-sourced rows work the moment you actually import
some.

To import a batch of SiteFinder candidates:

1. On the SiteFinder side (jamspr95/sitefinder repo), produce a JSON
   array of `to_nomination_row()` dicts (`src/sitefinder/stopspotter_export.py`)
   — that repo's own `integration/stopspotter/README.md` has the detail.
2. **Dashboard → Settings → API** — copy the `service_role` key (never the
   anon key for this; the import script needs to write columns anon/
   authenticated can't). This key bypasses RLS — treat it like a password,
   never commit it, never put it in a `VITE_`-prefixed variable.
3. Run:
   ```bash
   SUPABASE_URL=https://xxxxx.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
   npm run import:sitefinder -- path/to/candidates.json
   ```
4. The script 200m-matches each candidate against existing nominations
   (`find_nearby_nomination`) and reports how many were inserted as new
   `source='site_finder'` rows, merged into an existing nomination
   (`source='both'`), or refreshed in place — see the comment block at the
   top of `scripts/import-sitefinder-candidates.mjs` for the exact merge
   rule (a human's own form answers are never overwritten).
5. New `site_finder` rows land with `status='submitted'`, same as any
   other fresh nomination — they show up in the same swipe-triage queue
   (`/admin/review`) as a human nomination, not a separate list. Move the
   good ones to `shortlisted`/`live`. Only those two statuses show up on the **public**
   map, with the distinct "Suggested by AireStop" marker — an
   under-review candidate is never shown to the public, matching
   `docs/PROJECT_PLAN.md`'s "released in small batches per area".

### 12a. SiteFinder settings sync (one-time setup)

`/admin/site-finder-settings` lets an admin edit SiteFinder's own scoring
thresholds (migration `0023_site_finder_settings.sql`) without touching
that repo's YAML by hand. An edit there doesn't reach SiteFinder on its
own — the "Sync to SiteFinder now" button on that screen calls the
`trigger-site-finder-sync` Edge Function, which asks GitHub to run that
repo's `sync-config-from-stopspotter.yml` workflow (it also runs on its
own every 6 hours as a safety net, in case the button is never used).

Two things need setting up once, by someone with admin on both repos —
neither is something this assistant can do for you, since both involve a
real credential that should never be pasted into a chat:

1. **On the SiteFinder GitHub repo** (`jamspr95/SiteFinder` → Settings →
   Secrets and variables → Actions → "New repository secret"), add:
   - `SUPABASE_URL` — this project's URL (Dashboard → Settings → API)
   - `SUPABASE_SERVICE_ROLE_KEY` — this project's `service_role` key
     (same key as step 2 above — never the anon key)

   Without these, the workflow runs but fails at the "pull current
   settings" step, every time (schedule or button) — check that repo's
   Actions tab if the button never seems to do anything.

2. **A GitHub token for this function to dispatch that workflow.** The
   button calls GitHub's API from outside any GitHub Actions run, so it
   needs its own token — create a fine-grained personal access token
   (GitHub → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens) scoped to **only** the `jamspr95/SiteFinder`
   repository, with **Actions: Read and write** permission and nothing
   else. Then add it as this Supabase project's `GITHUB_PAT_SITE_FINDER_SYNC`
   Edge Function secret (Dashboard → Edge Functions → Secrets, or
   `supabase secrets set GITHUB_PAT_SITE_FINDER_SYNC=... --project-ref <ref>`
   from the Supabase CLI). Without this, the button shows a clear "not
   configured yet" message rather than failing silently.

Until both are set up, editing a setting still saves it to the database
fine — it just has no way to reach the real YAML files yet.

### 12b. SiteFinder search — staging + approve (Milestone 3)

`/admin/site-finder-search` replaces SiteFinder's own standalone map/
search page (that repo's `web/app.py`) with one portal: every pipeline
candidate SiteFinder has ever found lands in a staging table
(`site_finder_raw_candidates`, migration `0024_site_finder_raw_candidates.sql`)
long before anyone decides it's worth pursuing, browsed/filtered/mapped
from this screen, with an explicit **Approve** the only way a candidate
ever reaches the live `nominations` table — unlike §12's import flow
above, nothing here writes to `nominations` just by being previewed.

To get candidates into that staging table:

1. On the SiteFinder side (`jamspr95/sitefinder` repo), run the pipeline
   with the newer export flag:
   ```bash
   python3 scripts/run_pipeline.py --all \
     --stopspotter-raw-export data/processed/raw-candidates.json
   ```
   This writes every result through `to_raw_candidate_row()`
   (`src/sitefinder/stopspotter_export.py`) — untruncated reasons, the
   real site boundary polygon, and fields the old `--stopspotter-export`
   flow never carried (`utility_status`) — as one combined JSON array
   across every area run.
2. Using the same `service_role` key as §12 above (never the anon key —
   this script also writes columns anon/authenticated can't touch), run:
   ```bash
   SUPABASE_URL=https://xxxxx.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
   npm run sync:sitefinder-raw -- data/processed/raw-candidates.json
   ```
3. Open `/admin/site-finder-search`, filter by status/area/owner type,
   click a candidate to see its full detail (reasons, score breakdown,
   usable area, capacity, slope, road access, utilities) and its real
   boundary on the map, then **Approve** or **Reject**.
4. Approving calls `admin_approve_site_finder_candidate` — it reimplements
   `scripts/import-sitefinder-candidates.mjs`'s own insert/refresh/
   cluster/merge logic exactly (same stable `site_finder_candidate_id`
   matching, same 200m proximity fallback, same "never overwrite a
   human's own answer" rule), so an approved candidate lands in
   `/admin/review`'s normal swipe-triage queue exactly as if it had come
   through the old import script.
5. Re-running the sync (step 2) after a later pipeline run updates each
   candidate's underlying data in place — it never resets a candidate's
   `pending`/`approved`/`rejected` status, so re-syncing is always safe to
   do on a schedule or by hand, same spirit as §12a's settings sync.

### 12c. Scan a new area on demand (Jamie, 21 Oct 2026)

The "Scan a new area" button on `/admin/site-finder-search` runs
SiteFinder's own pipeline against a point and radius an admin picks on
the map, instead of a candidate having to already exist from a prior
by-hand pipeline run. Click the map to drop a pin, set a radius and
nation, and submit — it's fire-and-forget (GitHub's `workflow_dispatch`
API gives no way to poll a run's status), so there's no progress bar:
the scan runs in the background (minutes to well over an hour,
depending on radius) and results simply appear in the pending list once
it finishes, same as any other sync.

**One real limitation, by design** (Jamie: "SF sites should feed through
to SS database for boundary lookup"): an on-demand scan only finds sites
with a NAMED public owner (council, government estate, NHS, MOD, Crown
Estate, rail/roads, waterways, forestry, higher education) — not
genuinely unregistered land. SiteFinder's own unregistered-land detection
needs an area-specific council/county boundary list that only exists for
its 3 hardcoded test areas; rather than build that out for arbitrary
points, an approved candidate from an on-demand scan can still get a
real title/boundary from this project's own nationwide "Look up title"
button (§15) once it's a nomination — no SiteFinder-side area config
needed for that at all.

**No new setup needed** — this reuses the exact same
`GITHUB_PAT_SITE_FINDER_SYNC` Edge Function secret and
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` SiteFinder repo secrets as
§12a's settings sync and §12's import flow. If those are already
configured, the scan button just works.

How it fits together:
1. The button calls this project's `trigger-site-finder-scan` Edge
   Function, which dispatches SiteFinder's `scan-on-demand.yml`
   `workflow_dispatch` with the chosen point/radius/nation/label.
2. That workflow runs `scripts/run_pipeline.py --lat ... --lng ...
   --radius-km ... --nation ... --stopspotter-raw-export`, then syncs
   the result straight into `site_finder_raw_candidates` via
   `scripts/sync_raw_candidates_to_stopspotter.py` (a Python port of
   `scripts/sync-sitefinder-raw-candidates.mjs`'s own upsert — kept as a
   separate implementation so the workflow doesn't need to check out
   this repo too; see that script's own header comment).
3. From there it's identical to any other synced candidate — review,
   approve, or reject from `/admin/site-finder-search` as normal.

You can also trigger `scan-on-demand.yml` by hand from SiteFinder's own
Actions tab (useful for a one-off trial without touching this UI) —
same workflow, same inputs.

## 13. Pannable satellite + Street View on admin screens (optional, free)

The swipe-review queue (`/admin/review`) and the full stop-detail screen
(`/admin/stop/:id`) both have an "Explore" panel
(`src/components/SiteExplorer.tsx`) — Satellite, Street View and Nearby
tabs, so an admin can look around a site without leaving either screen.
With nothing configured, Satellite already works — a real, pannable
Leaflet map on the same free Esri imagery the public map uses, no setup
needed. Adding a Google Maps API key swaps that for Google's own
satellite basemap (also pannable) and turns on Street View, which has no
free equivalent at all.

**Cost: none.** Earlier this used the Maps Static API (a single still
image, billed per load) for the satellite tab, which is why it looked no
sharper than Leaflet — a flat image can't be panned to see what's
actually sharper about it, and it cost money for the privilege. It's
since been replaced with the Maps Embed API's `view` mode: the exact same
free, unlimited product Street View already uses (confirmed on Google's
own usage-and-billing page — panning, zooming and switching layers inside
an embed generate no extra loads). Nothing in this feature bills your
Google Cloud account.

1. **Create a Google Cloud project** (or use an existing one) at
   [console.cloud.google.com](https://console.cloud.google.com), and
   confirm it has a billing account attached — Google requires this to
   issue any Maps Platform key, even though nothing here is billed.
2. **APIs & Services → Library** — enable **Maps Embed API**. That's the
   only one needed now; there's no second API for the satellite view.
3. **APIs & Services → Credentials → Create credentials → API key.**
4. **Restrict the key before using it anywhere.** Click into the new key,
   under **Application restrictions** choose **HTTP referrers**, and add
   your deployed domain (`https://jamspr95.github.io/StopSpotter/*`) and
   `http://localhost:*` for local dev. This matters more than it would for
   the Supabase anon key: `VITE_`-prefixed variables ship inside the
   client bundle, so this key **will** be readable by anyone who opens
   the site's dev tools. A restricted key just stops working from anywhere
   else — it's not really about secrecy (the key can't be hidden), it's
   what keeps someone else's unrelated project from using yours.
5. Add it as `VITE_GOOGLE_MAPS_API_KEY` in `.env.local` for local dev, and
   as a GitHub Actions repo secret for the deployed build (same two-place
   pattern as `VITE_SUPABASE_URL` in §4 above) — **and** confirm
   `.github/workflows/deploy.yml`'s build step actually passes it through
   (`VITE_GOOGLE_MAPS_API_KEY: ${{ secrets.VITE_GOOGLE_MAPS_API_KEY }}`).
   The secret alone does nothing if that line isn't there — this bit us
   once already.

Nothing breaks by skipping this — both admin screens keep working on the
free, pannable Esri map, just without Street View, same as today.

## 14. "Nearby" tab — named venues and distance (always on, no setup)

The Explore panel's third tab lists real places near a site by name and
distance ("The Golden Lion · Pub · 800m") — pulled live from
OpenStreetMap's Overpass API (`src/lib/nearbyPlaces.ts`), not the
nomination's own coarse `nearby` checkboxes (those have no name or
distance to give). No API key, nothing to configure.

**Worth knowing, not worth setting anything up for yet:** Overpass's
public server (`overpass-api.de`) is a shared community instance.
Its own usage guidance asks regular or commercial users to keep well
under its published daily limits, or self-host, rather than relying on it
at real volume. This is one on-demand lookup per stop an admin actually
opens (cached per site for the session, not refetched on every tab
switch), which is well inside occasional use — but if this ever gets busy
enough to matter, the fix is a self-hosted Overpass instance or a paid
places API, not a code change here.

## 15. Title boundary data — "no known owner" sites (optional, Milestone 3)

**This section was rewritten after a real production outage.** The
original design (below this note, for the history) loaded HM Land
Registry's and Registers of Scotland's *entire* national bulk datasets
into a Postgres table (`title_boundaries`), checked against every
nomination via a join. On the Free plan, that filled the database's
entire disk allocation mid-sync and took the whole project offline —
not just the title feature, everything, since Postgres itself couldn't
accept new connections once disk hit zero. See
[`docs/TITLE_BOUNDARY_API_PLAN.md`](TITLE_BOUNDARY_API_PLAN.md) for the
full incident writeup and the replacement design.

**The current design** resolves a title **on demand, per nomination**,
instead of pre-loading the whole country:

- A quarterly (or manually-triggered) GitHub Actions workflow in the
  separate [`jamspr95/stopspotter-title-tiles`](https://github.com/jamspr95/stopspotter-title-tiles)
  repo — **not this one**, split out in Oct 2026 so this build pipeline
  can stay public (and its Actions minutes free, and its release assets
  fetchable with a plain unauthenticated `fetch()`) once this app repo
  goes private; see that repo's README — downloads the same free HMLR/RoS
  bulk files as the original design did, but instead of upserting into
  Postgres, splits them into gzipped NDJSON shard files ("tiles") and
  publishes them as assets across six GitHub Releases tagged
  `title-tiles-latest-{ew,scotland}-{0,1,2}` (one release per nation per
  latitude-mod-3 partition — see that repo's own `scripts/lib/titleTiles.mjs`
  for why there's more than one release per nation)
  — **nothing is ever written to the database by this job**, so it can
  never repeat the disk-exhaustion failure.
- `supabase/functions/lookup-title-boundary` — a Supabase Edge Function —
  fetches just the *one* tile a nomination's coordinates fall in, checks
  it against that nomination's exact point, and returns a match or
  `null`. It's called from the admin dashboard's **"Look up title"**
  button (`AdminStopDetailScreen`), not automatically for every
  nomination.
- `nominations.title_number` / `.title_tenure` / `.title_checked_at`
  (`supabase/migrations/0017_title_lookup_columns.sql`) store the single
  resolved result once an admin actually runs the lookup. `title_checked_at`
  being `null` means "never looked up" — genuinely different from
  "looked up, no match found" (`title_number` null but `title_checked_at`
  set), which is what **"no known owner"** actually means in the admin
  UI. England & Wales alone has an estimated 10-14% of land still
  unregistered (HMLR's own published figures), overwhelmingly older rural
  land — exactly the kind of land StopSpotter's nominations skew toward,
  so this is a common, real, and genuinely useful signal (treated as
  *positive* in `src/lib/priority.ts`'s admin sort: no registered title
  means no landowner to negotiate a lease with), not an edge case or a
  failure.

Nothing breaks by never running the lookup for a given nomination — it
just shows "title not looked up yet" until an admin clicks the button.

### Setting it up

1. The schema (`0017_title_lookup_columns.sql`) and the Edge Function are
   already applied/deployed to the live project — no manual step needed
   for either.
2. **Create a `TITLE_TILES_RELEASE_PAT` repo secret on
   [`jamspr95/stopspotter-title-tiles`](https://github.com/jamspr95/stopspotter-title-tiles)**
   — real incident (20 Oct 2026): a full `--all` run built and finalized
   every shard correctly, but publishing failed partway through with
   `403: API rate limit exceeded for installation` — the default
   `GITHUB_TOKEN`'s own rate limit isn't enough for the ~3,900 individual
   release-asset-upload calls NUM_RELEASE_PARTITIONS (3) × 2 nations now
   needs. A real PAT gets the much higher standard authenticated-user
   quota (5,000/hour) instead.
   - **GitHub → Settings → Developer settings → Fine-grained tokens →
     Generate new token.**
   - Name it something recognisable, e.g. "title-tiles release publish".
   - **Repository access** → **Only select repositories** →
     `jamspr95/stopspotter-title-tiles` — nothing else.
   - **Repository permissions** → **Contents** → **Read and write**.
     Leave every other permission at **No access**.
   - **Generate token** and copy it immediately — GitHub only shows it
     once.
   - On that repo: **Settings → Secrets and variables → Actions →
     Secrets tab → New repository secret** → name `TITLE_TILES_RELEASE_PAT`,
     paste the token, save.
   - Without this, the workflow now fails fast (before the ~2-hour
     build, not after) with a clear message naming this exact secret.
3. The build workflow otherwise lives entirely in that other repo and
   needs no Supabase secrets at all (it never touches the database).
4. **Before trusting the schedule, run it once by hand**, in that other
   repo: Actions → "Build title boundary tiles" → Run workflow,
   optionally scoped to one council/county first via its `council`/
   `county` input. Check the run's log for a sensible parsed parcel
   count, then check that repo's `title-tiles-latest-{ew,scotland}-{0,1,2}`
   releases (its **Releases** page) actually have fresh assets attached.
5. Once those releases exist, click **"Look up title"** on any
   nomination's admin detail page in *this* app — it should return a
   result (a title number, or a genuine "no known owner") within a
   second or two.

### History: how the real parsing quirks were found

The real-world parsing findings below (exact HMLR schema quirks, the
Registers of Scotland domain change, confirmed real parcel counts) came
from hard-won live debugging against the real sources, while this was
still the bulk-sync design (`sync-title-boundaries-{ew,scotland}.mjs`,
writing into a since-retired `title_boundaries` Postgres table — see the
outage note at the top of this section). The current
`build-title-tiles-{ew,scotland}.mjs` scripts, now in
[`jamspr95/stopspotter-title-tiles`](https://github.com/jamspr95/stopspotter-title-tiles),
reuse this same proven parsing code unchanged — only what happens to
each parsed parcel afterwards (written to a tile file, not upserted into
Postgres) is different. Kept here as the historical record of *why* the
parsers look the way they do; nothing below is a live setup step for
*this* repo any more.

**England & Wales — three real bugs, each only visible once the previous
one was fixed:**
1. The first real run against HMLR's download page failed with
   `fetch failed` / `redirect count exceeded` — not a login wall as
   originally suspected, but a cookie-walk redirect (a response sets a
   session cookie and redirects back to the same URL, expecting that
   cookie on the next request). `httpWithCookies.mjs` follows redirects
   manually and carries cookies between hops to handle this.
2. Once that was fixed, the scrape found zero council links at all — the
   real download link is a `.zip` (one `.gml` inside), not a raw `.gml`
   as first assumed, and the council name sits in the table row's
   heading, not the link's own text (which just says "Download .gml").
   `inspireGml.mjs`'s `extractGmlTexts()` detects a zip by magic bytes
   and unpacks every `.gml`/`.xml` entry inside it.
3. Once that was fixed, a real council's zip unpacked fine but parsed
   zero parcels — HMLR's actual feature type is its own `LR:PREDEFINED`,
   not the standard INSPIRE `cp:CadastralParcel` this was built against,
   its element names are all upper-case (`LR:INSPIREID`,
   `LR:NATIONALCADASTRALREFERENCE`, ...) where the parser's name-matching
   was case-sensitive, and the title reference's text parses as a bare
   JS number (e.g. `63934897`), which the code only handled as a string.
   All three are fixed in `inspireGml.mjs`.

Confirmed end to end via a live `--council="Exeter" --dry-run` run: all
50,584 of Exeter City Council's real parcels parsed correctly.

**Scotland needed a bigger change.** A live run against the Atom feed
failed with `ENOTFOUND ros.locationcentre.co.uk` — that domain turned out
to be RoS's old host; `ros-inspire.themapcloud.com` is the current one.
That site is a client-rendered app with nothing to scrape in its HTML —
the real county list and download URL pattern
(`maps/download/ros-cp.cadastralparcel/<code>`) were found by fetching
its JS bundles directly. The downloaded `.zip` itself turned out to be an
**ESRI Shapefile** (two coordinate-system variants per county; this
always reads the `_bng` one), not GML at all — `shapefileParcels.mjs`
(via the `shapefile` npm package) and `parcelExtraction.mjs` (a unified
dispatcher recognising either GML or Shapefile inside a zip) handle that.

Confirmed end to end via a live `--county="Lanark" --dry-run` run: all
200,011 of Lanark's real parcels parsed correctly, each with a real
title reference (e.g. `SCT0004276910`).

**The `--dir` fallback** (download the file yourself in a browser, point
the script at the saved file) still exists in the current scripts for
the same reason it existed in the retired ones — in case either
registry's download page ever starts requiring a signed-in browser
session an unauthenticated GitHub Actions runner can't satisfy. See
[`jamspr95/stopspotter-title-tiles`](https://github.com/jamspr95/stopspotter-title-tiles)'s
own README/usage for the exact commands; it's a clone of that repo you'd
run this in now, not this one.

## 16. Automatic content moderation (recommended, optional until you add the key)

Covers the "Decide on an automatic moderation approach" launch-checklist
item and `docs/BUILD_PLAN.md`'s "Automatic AI moderation check" row.
Every nomination's "why here" text already lands in the admin dashboard
(always) and, once cleared, on the public map — this adds an automatic
check in between using OpenAI's moderation endpoint (free for any API
account; chosen over Google's Perspective API, which sunsets 31 Dec 2026,
and AWS Comprehend Toxicity Detection, which has no free tier). It does
**not** cover a pin being placed on someone's actual home — that's a
geospatial check, not a text one, and isn't built.

1. The schema (`0020_auto_moderation.sql`), the Edge Function
   (`moderate-nomination-text`), and the client-side wiring (fires once,
   right after a nomination saves) are all already applied/deployed — no
   manual step needed for any of that.
2. **Without an API key, this silently does nothing** — exactly the
   behaviour before this feature existed, not an error state. To turn it
   on:
   - Create an API key at [platform.openai.com](https://platform.openai.com/api-keys) (no paid plan needed — the moderation endpoint itself is free).
   - Add it as an Edge Function secret named `OPENAI_API_KEY` on the
     Supabase project (Project Settings → Edge Functions → Secrets, or
     `mcp__Supabase__create_edge_function_secret` from a coding session).
3. Once the key is set, submit a test nomination with deliberately
   flagged "why here" text — within a second or two it should disappear
   from the public map (admin still sees it) and a new row should appear
   in **Admin → Moderation reports**, reason starting "Auto-flagged by
   moderation API: ...". No redeploy needed to pick up the new secret.

## 17. Cloudflare Workers hosting (replacing GitHub Pages)

> **Status and next steps**: see
> [`docs/CLOUDFLARE_MIGRATION_PLAN.md`](CLOUDFLARE_MIGRATION_PLAN.md) —
> that doc tracks where this migration actually stands and has a
> quick-start for picking it back up in a fresh session. This section is
> the how-to it summarises.

Why: this repo is moving to **private** before launch, and GitHub Pages
only serves a site from a **private** repo on GitHub Pro/Team/Enterprise
— never Free, custom domain or not. Cloudflare Workers (with static
assets — the current replacement for "Pages", per Cloudflare's own
guidance) deploys from a private repo for free, on any plan, with no
such restriction.

`wrangler.jsonc` is assets-only (no server-side Worker code — this is
still the same client-side SPA it always was), serving `./dist` with
`not_found_handling: "single-page-application"` so a direct load of a
client route (e.g. `/stop/:id`) resolves, the same job GitHub Pages'
`dist/404.html` copy does today.

**Why there's a separate `build:cloudflare` script**: `vite.config.ts`'s
`base` stays `/StopSpotter/` for GitHub Pages — changed only for the
final cutover, not before, so the two hosts can run side by side during
the migration without either one's deploy breaking the other's. Cloudflare
Workers serves from the domain root, not a subpath, so its build needs
`base: '/'` instead; `npm run build:cloudflare` overrides it at build
time (`vite build --base=/`) rather than touching the shared config file.

### Setting it up

Deploys run through `.github/workflows/deploy-cloudflare.yml` on GitHub's
own runners — **not** from a local machine or a Claude Code cloud session.
(A cloud session's network proxy authenticates Cloudflare API calls by
injecting a single static token into every request to `api.cloudflare.com`,
which collides with the short-lived upload JWT Cloudflare's asset-upload API
swaps in for the file-upload step — see
[`docs/CLOUDFLARE_MIGRATION_PLAN.md`](CLOUDFLARE_MIGRATION_PLAN.md) for how
this was diagnosed. GitHub's runners don't sit behind that proxy, so the
same `wrangler deploy` just works there.)

1. **Create an API token**: [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
   → Create Token → custom token with **Account → Cloudflare Pages →
   Edit** (Workers deploys still use this scope) and **Account → Account
   Settings → Read**.
2. In the repo's Settings → Secrets and variables → Actions:
   - Add `CLOUDFLARE_API_TOKEN` as a **secret**.
   - Add `CLOUDFLARE_ACCOUNT_ID` (from the Cloudflare dashboard's right
     sidebar on any domain/account page) as a **variable**, not a secret —
     it's not sensitive.
   - Confirm `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and (if used)
     `VITE_GOOGLE_MAPS_API_KEY` are already set as secrets — `deploy.yml`
     needs these too, so they're likely already there.
3. Push to `main`, or run the workflow manually (Actions tab →
   "Deploy to Cloudflare Workers" → Run workflow). First run creates the
   Worker and Cloudflare assigns it a `*.workers.dev` URL — check the
   workflow's Cloudflare step output, or the dashboard, for it, then open
   it and confirm the app actually loads and talks to Supabase.
4. **Custom domain**: not done through Cloudflare — see §18 below. A
   Workers custom domain needs an active Cloudflare zone for the hostname,
   and Cloudflare's Free plan can only create a zone for a bare apex
   domain, not a subdomain of one hosted elsewhere. `*.workers.dev` stays
   the dev/preview URL for this hosting path regardless.
5. **Once Cloudflare is confirmed serving correctly** (not before — this
   keeps the live GitHub Pages site intact in the meantime): retire
   `.github/workflows/deploy.yml` and, in repo Settings → Pages, disable
   GitHub Pages. Only then does making the repo private stop being a risk
   to the live site.

Local deploys (`npm run deploy:cloudflare`) still work fine from a real
machine outside the sandboxed proxy, if you ever need one — just export
`CLOUDFLARE_API_TOKEN` (and `CLOUDFLARE_ACCOUNT_ID` if needed) in that
shell first.

## 18. Custom domain — AWS S3 + CloudFront, not Cloudflare

`nextstop.airestop.co.uk/stopspotter` is served from AWS, independently of
the Cloudflare hosting above — see
[`docs/AWS_CUSTOM_DOMAIN_HANDOFF.md`](AWS_CUSTOM_DOMAIN_HANDOFF.md) for the
full one-time setup (written for whoever has AWS account access to run
it) and `.github/workflows/deploy-aws.yml` for the deploy that runs on
every push once that setup is done.

Why not a Cloudflare custom domain: `airestop.co.uk` is hosted on AWS
Route 53, and the project doesn't want to move it. A Workers custom domain
needs an active Cloudflare zone for the hostname, and on a Free plan that
can only be a bare apex domain — onboarding just a subdomain while the
parent stays elsewhere is Business/Enterprise-plan-gated. Since StopSpotter
has no server-side Worker code (same static SPA throughout), there was no
real need to route production through Cloudflare at all — it was only ever
solving "deploy from a private repo for free," which GitHub Actions
deploying straight to AWS solves equally well.
