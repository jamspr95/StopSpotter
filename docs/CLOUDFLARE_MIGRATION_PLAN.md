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

**Deploys go through GitHub Actions now (`.github/workflows/deploy-cloudflare.yml`),
not `wrangler deploy` run directly from a cloud session.** See "Why `wrangler
deploy` doesn't work from inside a cloud session" below before trying the
old manual-CLI approach again — it's a structural proxy conflict, not a
missing credential, and re-attempting it from here will reliably 401 at the
same step every time.

If you've just been handed this task cold, do this, in order:

1. Confirm you're in `/home/user/StopSpotter` on `main`, up to date
   (`git pull --ff-only`).
2. Check whether the user has added the required GitHub Actions secrets/vars
   yet (`CLOUDFLARE_API_TOKEN` secret, `CLOUDFLARE_ACCOUNT_ID` variable —
   see `docs/SETUP.md` §17 step 2). You can't read these from here; ask if
   unclear.
3. Trigger the workflow — push to `main`, or from the Actions tab run
   "Deploy to Cloudflare Workers" manually. This isn't a PR, so the usual
   PR-activity subscription doesn't apply — check the Actions tab run log
   directly, or ask the user to confirm it went green.
4. First successful run creates the Worker and Cloudflare assigns a
   `*.workers.dev` URL (visible in the workflow's wrangler-action step
   output or the Cloudflare dashboard). Open it and confirm the app loads
   and talks to Supabase — not just that the workflow run is green.
5. If it works: tell the user the `*.workers.dev` URL, then move to
   "Custom domain" and "Cutover" below. **Do not** touch
   `vite.config.ts`, `deploy.yml`, or GitHub Pages settings yet — see
   "Cutover sequencing", that's a deliberate later step, not part of
   getting Cloudflare working.
6. If the workflow run fails: read its log — this is an ordinary GitHub
   Actions failure (missing secret, build error, wrangler error) with no
   proxy involved, so standard debugging applies. Don't ask the user to
   paste a token into chat to work around it — see "What NOT to do" below.

### Why `wrangler deploy` doesn't work from inside a cloud session

Diagnosed 2026-10-15: running `npm run build:cloudflare && npx wrangler
deploy` directly in a Claude Code cloud session gets past account lookup,
subdomain setup, and starting the asset-upload session (all 200 OK), then
fails with a `401 Unauthorized` on every retry of the actual file-upload
step (`POST .../workers/assets/upload`), with `wrangler deploy` never
completing.

Per Cloudflare's own docs, that one step is the odd one out: every other
Workers API call authenticates with the static account API token, but file
uploads must use a short-lived JWT returned by the preceding
`assets-upload-session` call instead. This cloud session's outbound-network
proxy authenticates calls to `api.cloudflare.com` by injecting the stored
`CLOUDFLARE_API_TOKEN` into every request to that host — which would
clobber exactly that one swapped-in JWT, and nothing else. That lines up
with everything observed (every token-authenticated call succeeds; only the
JWT-authenticated call fails, every time). The actual header contents
aren't inspectable from inside the session (secrets are deliberately walled
off), so this can't be proven with 100% certainty from here, but there's no
other plausible explanation and no amount of re-trying or re-issuing the
token will fix it — **don't spend more time on that path.**

This would block any tool run from inside a session like this one (not just
wrangler) for any Worker that has static assets. GitHub Actions runners
don't sit behind this proxy, so the same deploy works fine from there —
hence the move to `deploy-cloudflare.yml`.

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
| Diagnosed why `wrangler deploy` 401s from inside a cloud session (proxy's Cloudflare credential injection collides with the asset-upload JWT swap) — see "Why `wrangler deploy` doesn't work..." above | ✅ |
| `.github/workflows/deploy-cloudflare.yml` added — deploys from GitHub's runners instead, sidestepping the proxy conflict entirely | ✅ |
| `docs/SETUP.md` §17 rewritten for the GitHub Actions deploy path | ✅ |

## What's blocking (🔄, needs the user)

| Task | Status |
|---|---|
| `CLOUDFLARE_API_TOKEN` added as a GitHub Actions **secret** (repo Settings → Secrets and variables → Actions) — custom token scoped to **Account → Cloudflare Pages → Edit** + **Account → Account Settings → Read** | ⬜ |
| `CLOUDFLARE_ACCOUNT_ID` added as a GitHub Actions **variable** (not a secret — same tab, Variables sub-tab) | ⬜ |
| First `deploy-cloudflare.yml` run, triggered by push to `main` or manually from the Actions tab, confirmed green and the resulting `*.workers.dev` URL confirmed actually serving the app (not just a green run) | ⬜ |

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
  into chat.** This happened once already this session, by mistake — the
  token had to be treated as compromised and reissued. The token now
  lives as a GitHub Actions secret (repo Settings → Secrets and variables
  → Actions), added by the user directly in GitHub's UI — never pasted
  to Claude, in chat or otherwise.
- **Don't change `vite.config.ts`'s `base`** until Cutover step 3.
- **Don't retire `deploy.yml` or disable GitHub Pages** before Cloudflare
  is confirmed actually serving the app correctly — not just that
  `wrangler deploy` exited 0.
- **Don't make the repo private** before Cutover step 3 is done — GitHub
  Pages would otherwise go dark immediately (see top of this doc for why).
