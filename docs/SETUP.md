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

### A note on email sending — fix the "this looks like spam" problem

Out of the box, Supabase sends the magic-link email itself, from its own
shared sender (something like `noreply@mail.app.supabase.io`), using its
own generic template copy. Testers have already flagged this — it doesn't
look like it's from AireStop or StopSpotter, which is exactly the kind of
thing that makes a real supporter distrust the email and ignore it. There
isn't a way to fix this from a coding session — it needs two changes in
the Supabase dashboard, plus an SMTP provider with a domain you can send
from:

1. **Get a transactional-email sender.** You need something that can send
   as an address on a domain you control — e.g. `noreply@airestop.co.uk`
   (if DNS for that domain is available to you) or a subdomain like
   `stopspotter.airestop.co.uk`. Options: [Resend](https://resend.com)
   (simplest to set up, has a free tier), Amazon SES, Postmark, SendGrid,
   or Brevo's transactional email (if the Brevo account from §10 already
   has it). Whichever you pick, you'll need to verify the sending domain
   with it (usually adding a couple of DNS TXT/CNAME records) before it'll
   actually deliver.
2. **Point Supabase at it.** **Dashboard → Authentication → Settings →
   SMTP Settings** → enable "Custom SMTP" → enter the host/port/username/
   password your provider gave you in step 1, and set **Sender email** to
   the address you verified (e.g. `noreply@airestop.co.uk`) and **Sender
   name** to something recognisable, like `StopSpotter` or `AireStop`.
3. **Rewrite the email template.** **Dashboard → Authentication → Email
   Templates → Magic Link** — the default subject/body is generic
   Supabase copy. Replace it with StopSpotter-branded wording (it accepts
   basic HTML and the `{{ .ConfirmationURL }}` placeholder for the actual
   link). Do this for any other templates you expect people to see (e.g.
   "Confirm signup" if email confirmation is ever turned on).

Until this is done, **the rate-limit note still applies too**: Supabase's
shared sender is rate-limited and fine only for a handful of testers —
check **Authentication → Rate Limits** if sign-ups stall.

## 6. Set up Google, Apple and Facebook sign-in (optional)

**The "Continue with Google / Apple / Facebook" buttons are hidden by
default** — a tester flagged that they were showing even though no
provider was actually configured yet, so tapping one just failed. They're
now gated behind a second flag on top of step 4's backend config:

```
VITE_SSO_ENABLED=true
```

Set this in `.env.local` for local development, and for the deployed
build add it as a repo **variable** (not a secret — it's not sensitive) in
**Settings → Secrets and variables → Actions → Variables tab**. Do this
once **at least one** provider below is actually enabled and working.
Leave it unset/`false` until then — email magic-link keeps working
regardless either way.

All three use the same Supabase-side redirect URL, which you'll enter on
the provider's side as the "authorised redirect URI":

```
https://xxxxx.supabase.co/auth/v1/callback
```

(Find your own project's version of this on the provider setup page in
the dashboard: **Authentication → Providers → Google/Apple/Facebook** —
Supabase shows it there pre-filled with your project ref.)

### Google (easiest — ~10 minutes, free)

1. In the [Google Cloud Console](https://console.cloud.google.com/), create
   a project (or use an existing one) and go to **APIs & Services →
   Credentials**.
2. **Create Credentials → OAuth client ID** → Application type **Web
   application**.
3. Under **Authorised redirect URIs**, add the Supabase callback URL above.
4. Copy the generated **Client ID** and **Client secret**.
5. In Supabase: **Authentication → Providers → Google**, toggle it on,
   paste both values, save.

### Facebook / Meta (needs App Review for a public launch)

1. In [Meta for Developers](https://developers.facebook.com/), create an
   app (type **Consumer**) and add the **Facebook Login** product.
2. Under **Facebook Login → Settings**, add the Supabase callback URL
   above to **Valid OAuth Redirect URIs**.
3. Copy the **App ID** and **App Secret** from **Settings → Basic**.
4. In Supabase: **Authentication → Providers → Facebook**, toggle it on,
   paste both values, save.
5. While the app is in **Development mode**, sign-in only works for
   accounts added as testers/developers on the Meta app. Going live to the
   public requires submitting for **App Review** (the `public_profile` and
   `email` permissions are usually pre-approved, but Meta still has to
   review the app itself) — budget a few days for this before relying on
   it for a real launch.

### Apple (needs a paid Apple Developer account)

1. Requires an active [Apple Developer Program](https://developer.apple.com/programs/)
   membership ($99/year) — there's no free tier for Sign in with Apple.
2. In the Apple Developer portal: create an **App ID** (with "Sign in with
   Apple" capability enabled), a **Services ID** (this is the "client ID"
   Supabase asks for — it's a separate identifier from the App ID), and a
   **Sign in with Apple** private key.
3. On the Services ID's configuration, add this project's **domain**
   (`jamspr95.github.io`, or a custom domain later) and the Supabase
   callback URL above as the return URL.
4. Apple also requires **domain verification** — a small file served from
   `.well-known/` on that domain, which the Apple portal walks you through.
5. In Supabase: **Authentication → Providers → Apple**, toggle it on,
   enter the Services ID, Team ID, Key ID, and the private key contents.

Because of the cost and setup time, Apple sign-in is the one most likely
to be left for later — the Google and email options are enough to launch
with.

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
Same for syncing opted-in supporters to Brevo's marketing lists. Both stay
on the Milestone 3 checklist in `docs/BUILD_PLAN.md` as open.

## 11. Enable the disposable-email sign-up block

[`supabase/migrations/0005_disposable_email.sql`](../supabase/migrations/0005_disposable_email.sql)
adds a `disposable_email_domains` table and a `hook_reject_disposable_email`
Postgres function, but Supabase Auth doesn't call it until you point a
"Before User Created" hook at it — a one-time dashboard toggle:

1. **Dashboard → Authentication → Hooks → Before User Created.**
2. Choose **Postgres Function**, then select `hook_reject_disposable_email`.
3. Save.

That's it — no redeploy, no edge function. It covers every sign-up path
(magic link and every SSO provider you've configured), since it runs
inside Supabase Auth itself before the user row exists. Nothing breaks by
skipping this step; sign-ups from a disposable address just aren't
blocked server-side yet (the sign-up form's own client-side check in
`src/lib/disposableEmail.ts` still catches the common cases, but that one
a determined actor can route around by calling the API directly).

To add more blocked domains later, just insert more rows:
```sql
insert into public.disposable_email_domains (domain) values ('example-temp-mail.com');
```
