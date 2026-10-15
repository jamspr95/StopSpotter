# StopSpotter — Cloudflare hosting migration plan

> Read this first in a new session picking this up. Everything needed to
> finish the deploy is below — don't re-derive it from chat history.

## Why this exists

The repo is moving to **private** before launch. GitHub Pages only serves
a site from a private repo on GitHub Pro/Team/Enterprise — never Free,
custom domain or not. Cloudflare Workers (with static assets — the
current replacement for classic "Pages", per Cloudflare's own migration
guidance) has no such restriction and deploys from a private repo for
free, on any plan. This plan gets Cloudflare serving the live site so the
repo can go private without taking the site down.

See also: `docs/SETUP.md` §17 for the step-by-step how-to this plan
summarises, and the "StopSpotter — Private Repo & Hosting Impact
Assessment" artifact/doc from the session that decided this (cost/
limitation comparison against staying on GitHub Pages + Pro, Netlify,
Vercel).

## Status Key

| Symbol | Meaning |
|---|---|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Complete |

---

## Quick start for a fresh session

If you've just been handed this task cold, do this, in order:

1. **Check whether the blockers below are actually resolved yet** — the
   user may still be mid-setup. Try step 4 directly; if it fails with a
   network or auth error, the relevant item in "What's blocking" hasn't
   taken effect yet (both require a NEW session after being set — if
   THIS session was already running when they were added, you also need
   a new session, not just a retry).
2. Confirm you're in `/home/user/stopspotter` on `main`, up to date
   (`git pull --ff-only`).
3. Build with real env vars (these are safe to use directly — the anon
   key is designed to be public, protected by RLS, not secrecy):
   ```bash
   export VITE_SUPABASE_URL='https://pqnvbikuulofuypzyhxa.supabase.co'
   export VITE_SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnZiaWt1dWxvZnV5cHp5aHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5NTMyMDAsImV4cCI6MjEwNzUyOTIwMH0.IsGAoQJsezdutvIdAcACd6WbMc62KfL7_pftVD7qWNg'
   npm run build:cloudflare
   ```
   (If these ever need refreshing: `mcp__Supabase__get_project_url` /
   `get_publishable_keys` on project `pqnvbikuulofuypzyhxa`.)
4. Deploy:
   ```bash
   npx wrangler deploy
   ```
   First deploy creates the Worker and prints a `*.workers.dev` URL —
   open it and check the app actually loads and talks to Supabase (not
   just that the deploy command exits 0).
5. If it works: tell the user the `*.workers.dev` URL, then move to
   "Custom domain" and "Cutover" below. **Do not** touch
   `vite.config.ts`, `deploy.yml`, or GitHub Pages settings yet — see
   "Cutover sequencing", that's a deliberate later step, not part of
   getting Cloudflare working.
6. If it fails: read the actual error before guessing. A proxy/network
   error means the Allowed-domains change hasn't taken effect (needs a
   new session). An auth error means the credential either isn't set, is
   scoped to the wrong host, or also needs a new session. Don't ask the
   user to paste a token into chat to work around it — see "What NOT to
   do" below.

---

## What's done (✅, committed on `main`)

| Task | Status |
|---|---|
| `wrangler.jsonc` — assets-only Worker config (`./dist`, `single-page-application` routing). No server-side Worker code; same SPA as always | ✅ |
| `package.json` scripts: `build:cloudflare` (overrides vite's `base` to `/` at build time via CLI flag — see "Why two build configs" below) and `deploy:cloudflare` (chains build + `wrangler deploy`) | ✅ |
| `wrangler` added as a devDependency (`^4.151.0`) | ✅ |
| `.gitignore` updated for `.wrangler` / `.dev.vars*` | ✅ |
| Config validated with `wrangler deploy --dry-run` — read 10 files from `dist/`, accepted with no bindings | ✅ |
| `docs/SETUP.md` §17 written (full how-to) | ✅ |
| Repo-split prerequisite done: title-tile build pipeline moved to `jamspr95/stopspotter-title-tiles` (separate concern, but was also blocking "go private" — see that repo and `docs/TITLE_BOUNDARY_API_PLAN.md`) | ✅ |

## What's blocking (🔄, needs the user + a new session)

| Task | Status |
|---|---|
| Cloudflare account API token, scoped as a **Bearer** credential to `api.cloudflare.com`, added via this session's environment settings (**Network secrets** / "API credentials" in an older app build) — not pasted into chat (a token WAS briefly pasted into chat earlier in the session that set this up; it should have been revoked/rolled in the Cloudflare dashboard after, worth confirming with the user if picking this up fresh) | 🔄 user reports done, unverified from a fresh session |
| Network access: `api.cloudflare.com` (and ideally `sparrow.cloudflare.com`, Cloudflare's telemetry endpoint — not required, but avoids a harmless warning) added to this environment's allowed outbound hosts | 🔄 user reports done, unverified from a fresh session |
| `CLOUDFLARE_ACCOUNT_ID` as a **plain environment variable** (not a credential — it's not secret, so it doesn't belong in the Bearer-credential form above; needs its own slot in the environment settings) | ⬜ **last known status: user hadn't located where to add this.** Try the deploy without it first — `wrangler` can often auto-detect the account when the token only has access to one, so this may turn out to be unnecessary |

## Custom domain (after the Worker is confirmed live)

1. Decide the domain — `airestop.co.uk` is already the verified sender
   domain in Brevo, so a subdomain off it (e.g.
   `stopspotter.airestop.co.uk`) needs no new registration. A fully
   separate domain is the other option; needs registering first.
2. Cloudflare dashboard → Workers & Pages → this worker → Settings →
   Domains & Routes → Add → Custom Domain. Immediate if the zone is
   already on Cloudflare; otherwise Cloudflare walks through the needed
   DNS changes.
3. Update the Supabase Auth redirect URL to the final domain
   (`docs/SETUP.md` §5) — same step this always needed, regardless of
   hosting.
4. Once DNS + the custom domain are live, tell the user — one more code
   check (confirm `base: '/'` behaviour is correct at the real domain
   root, not a `*.workers.dev` subpath) but no code change expected.

## Cutover sequencing (do this LAST, not as part of "getting Cloudflare working")

Do not reorder this — each step assumes the previous one is confirmed,
specifically so the live site never has a gap:

1. Cloudflare Worker confirmed serving the real app correctly (functional
   check, not just a successful `wrangler deploy`).
2. Custom domain live on Cloudflare (if wanted before going private —
   not strictly required, `*.workers.dev` works too).
3. **Only then**: retire `.github/workflows/deploy.yml` and disable
   GitHub Pages in repo Settings → Pages.
4. **Only then**: make the repo private (Settings → General → Danger
   Zone). Confirm the live site is unaffected immediately after.

## Why two build configs (don't "simplify" this away)

`vite.config.ts`'s `base` stays hardcoded to `/StopSpotter/` — that's
for GitHub Pages, which serves this app from a subpath, not the domain
root. Cloudflare Workers serves from the root, so `npm run build:cloudflare`
overrides `base` to `/` **at build time only**, via `vite build --base=/`,
rather than editing the shared config file. This is deliberate: it lets
GitHub Pages and Cloudflare run side by side, each with correct asset
paths, for the entire migration window — right up until step 3 of
Cutover above. Changing `vite.config.ts`'s `base` directly would break
GitHub Pages immediately, before Cloudflare is confirmed working.

## What NOT to do

- **Never ask the user to paste a Cloudflare API token (or any secret)
  into chat.** This happened once already this session, by mistake —
  the token had to be treated as compromised and the user was asked to
  revoke and reissue it via the environment's Network secrets instead.
  Use the environment's secrets mechanism from the start.
- **Don't change `vite.config.ts`'s `base`** until Cutover step 3.
- **Don't retire `deploy.yml` or disable GitHub Pages** before Cloudflare
  is confirmed actually serving the app correctly — not just that
  `wrangler deploy` exited 0.
- **Don't make the repo private** before Cutover step 3 is done — GitHub
  Pages would otherwise go dark immediately (see top of this doc for why).
