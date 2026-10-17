# StopSpotter — AWS custom domain launch plan (S3 + CloudFront)

> **For the dev setting this up.** You'll need AWS console/CLI access to
> the account that owns `airestop.co.uk`'s Route 53 hosted zone, and
> GitHub admin access to this repo (to add the variables in step 7).
> Nothing here touches any existing DNS record except adding one new
> `nextstop.airestop.co.uk` record — your MX/SPF/DKIM records for email
> (Brevo) are untouched throughout.
>
> Total hands-on time is short (maybe 30–45 minutes); most of the elapsed
> time is waiting on ACM certificate validation and CloudFront propagation,
> both of which happen in the background while you do the next step.

## What this gets you

`https://nextstop.airestop.co.uk/stopspotter` serving the StopSpotter app,
deployed automatically by GitHub Actions on every push to `main`.

This is a **static site** — StopSpotter has no server-side code at all
(it's a React SPA talking directly to Supabase from the browser), so the
whole job here is: get the built files onto S3, and get CloudFront +
Route 53 serving them at the right hostname/path with HTTPS and
client-side routing working.

The `/stopspotter` path (not the domain root) is deliberate, matching what
was requested — the distribution can host sibling apps at other paths
later without conflict, and this one won't need to change when that
happens.

**Why not Cloudflare, which the rest of this project's hosting uses**:
Cloudflare Workers hosting (`docs/CLOUDFLARE_MIGRATION_PLAN.md`) stays live
at `stopspotter.stopspotter.workers.dev` as a free dev/preview URL, and
nothing here changes or depends on it — but a Cloudflare custom domain
needs an *active Cloudflare zone* for the hostname, and Cloudflare's Free
plan can only create a zone for a bare apex domain, never a subdomain of
one hosted elsewhere (`airestop.co.uk` stays on Route 53 — not moving).
See that doc's "Custom domain" section if you want the full reasoning.

## Architecture

```
  GitHub push to main
         │
         ▼
  GitHub Actions (.github/workflows/deploy-aws.yml)
    1. npm run build:aws          → dist/ (assets rooted at /stopspotter/)
    2. assume AWS role via OIDC   → no long-lived AWS keys stored in GitHub
    3. aws s3 sync dist/ → s3://<bucket>/stopspotter/
    4. aws cloudfront create-invalidation --paths "/stopspotter/*"
         │
         ▼
  S3 bucket (private — no public access, no website hosting mode)
         │  read via Origin Access Control (OAC), not a public website
         ▼
  CloudFront distribution
    - Alternate domain name: nextstop.airestop.co.uk
    - ACM cert (us-east-1) for TLS
    - /stopspotter/* behavior → CloudFront Function does SPA fallback
      (serves /stopspotter/index.html for any client-side route that
      isn't a real file, e.g. /stopspotter/stop/abc123)
         │
         ▼
  Route 53: nextstop.airestop.co.uk  A/AAAA (Alias) → CloudFront distribution
         │
         ▼
  Browser  ──────────────────────────────────────────────────────────────
                 (app itself talks directly to Supabase, not through
                  anything in this diagram — nothing here proxies that)
```

## Prerequisites

Before starting, confirm you have:

- [ ] AWS CLI v2 installed and authenticated against the right account
      (`aws sts get-caller-identity` should show the account that owns
      `airestop.co.uk`'s Route 53 hosted zone)
- [ ] IAM permissions to create: S3 buckets, ACM certificates, CloudFront
      distributions/functions, Route 53 records, an IAM OIDC provider and
      role (if your own user/role doesn't have these broadly, you'll need
      someone who does for the one-time setup)
- [ ] GitHub admin access to `jamspr95/StopSpotter` (Settings → Secrets and
      variables → Actions)
- [ ] Access to the Supabase project dashboard (for step 9)
- [ ] `openssl` available locally (only needed if your AWS CLI version
      insists on a thumbprint in step 6 — most won't)

**Cost**: S3 + CloudFront + Route 53 for a low-traffic static SPA like this
is normally a few cents to low dollars a month — ACM certificates are free.

## Already done in the repo (nothing to do here, just context)

- `npm run build:aws` — builds with `--base=/stopspotter/` so every asset
  path, and the client-side router's basename, resolve correctly when
  served from that path (same mechanism already used for GitHub Pages'
  `/StopSpotter/` subpath — see `vite.config.ts` / `src/main.tsx`).
- `.github/workflows/deploy-aws.yml` — builds and syncs to S3, then
  invalidates CloudFront, on every push to `main`. Needs the AWS resources
  and repo variables below before it'll succeed — it'll show red in the
  Actions tab until then, that's expected.
- `infra/aws/stopspotter-spa-fallback.js` — the CloudFront Function
  referenced in step 3 below.

## Step-by-step setup

Do these in order — later steps reference resources created in earlier
ones.

### 1. S3 bucket

A private bucket (no public access, no static website hosting mode —
CloudFront reads it via Origin Access Control, not as a public website).
Can be new or an existing bucket you already use for other static sites;
this deploy only ever touches the `stopspotter/` prefix inside it.

```bash
aws s3api create-bucket \
  --bucket <YOUR_BUCKET_NAME> \
  --region <YOUR_REGION> \
  --create-bucket-configuration LocationConstraint=<YOUR_REGION>
aws s3api put-public-access-block \
  --bucket <YOUR_BUCKET_NAME> \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### 2. ACM certificate

Must be in **us-east-1** — that's a hard CloudFront requirement regardless
of which region the bucket or your other infrastructure lives in.

```bash
aws acm request-certificate \
  --domain-name nextstop.airestop.co.uk \
  --validation-method DNS \
  --region us-east-1
```

Take the `CNAME` validation record ACM gives you
(`aws acm describe-certificate --region us-east-1 --certificate-arn <arn>`
shows it under `DomainValidationOptions`) and add it in Route 53, same
hosted zone as `airestop.co.uk`. This can take anywhere from a couple of
minutes to a few hours — move on to step 3 while you wait, but don't
attach the cert in step 4 until `describe-certificate` shows `ISSUED`.

### 3. CloudFront Function (SPA fallback)

Dashboard: **CloudFront → Functions → Create function** → name it
`stopspotter-spa-fallback` → paste in the contents of
`infra/aws/stopspotter-spa-fallback.js` from this repo → **Save** →
**Publish**.

(What it does: serves the SPA shell for any client-side route that isn't a
real file in the bucket — same job GitHub Pages' `dist/404.html` copy and
Cloudflare's `not_found_handling: single-page-application` do for this app
on its other hosting paths. Scoped to the `/stopspotter/*` behavior only
in step 4, so it won't affect anything else you add to this distribution
later.)

### 4. CloudFront distribution

- **Origin**: the S3 bucket from step 1, via **Origin Access Control**
  (CloudFront's console offers to create the OAC and update the bucket
  policy for you when you pick "S3" as the origin type and select the
  bucket — accept that; the expected resulting policy is below if you want
  to double-check it).
- **Alternate domain name (CNAME)**: `nextstop.airestop.co.uk`
- **Custom SSL certificate**: the ACM cert from step 2 (must show
  `ISSUED` first)
- **Default root object**: `stopspotter/index.html` (only matters if
  someone hits the bare domain root; the real app lives under
  `/stopspotter/`)
- **Behaviors**:
  - Add a behavior for path pattern `/stopspotter/*`:
    - Viewer protocol policy: Redirect HTTP to HTTPS
    - Allowed methods: GET, HEAD, OPTIONS
    - Compress objects automatically: Yes
    - Function associations → **Viewer request** → the
      `stopspotter-spa-fallback` function from step 3
  - Leave the default (`*`) behavior pointed at the same origin with no
    function attached, or configure it to 404 on your own origin config if
    you'd rather the bare domain root 404 until a sibling app is added —
    either is fine for now and doesn't affect `/stopspotter`.

Expected OAC bucket policy (scopes read access to *this* distribution
specifically, not to CloudFront in general — the console should write this
for you, this is just to confirm it matches):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::<YOUR_BUCKET_NAME>/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::<ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>"
        }
      }
    }
  ]
}
```

Note the distribution ID and the `d111111abcdef8.cloudfront.net`-style
domain name — you'll need the ID in steps 6 and 7.

### 5. Route 53

Add an **A (Alias)** record — and an **AAAA (Alias)** record if you want
IPv6 — for `nextstop.airestop.co.uk` pointing at the CloudFront
distribution from step 4 (Route 53's console offers "Alias to CloudFront
distribution" directly, no IP address needed — pick the distribution by
its domain name).

### 6. GitHub Actions → AWS auth (OIDC, no long-lived keys)

One-time, if this account doesn't already have a GitHub OIDC identity
provider (check **IAM → Identity providers** first — skip straight to
creating the role below if it's already there).

AWS now validates GitHub's certificate against trusted root CAs rather
than relying on a thumbprint, so create it without one — don't hard-code a
thumbprint value from a blog post, they're known to go stale:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

If your AWS CLI version still requires `--thumbprint-list` as a mandatory
flag, get the current value straight from GitHub's certificate instead of
copying one from a blog post:

```bash
openssl s_client -connect token.actions.githubusercontent.com:443 -servername token.actions.githubusercontent.com < /dev/null 2>/dev/null \
  | openssl x509 -fingerprint -sha1 -noout | cut -d= -f2 | tr -d ':'
```

Create a role trusted by that provider, scoped to this repo's `main`
branch only (replace `<ACCOUNT_ID>`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        "StringLike": { "token.actions.githubusercontent.com:sub": "repo:jamspr95/StopSpotter:ref:refs/heads/main" }
      }
    }
  ]
}
```

Attach a permissions policy scoped narrowly to this one deploy (replace
`<YOUR_BUCKET_NAME>`, `<ACCOUNT_ID>`, `<DISTRIBUTION_ID>` with the values
from steps 1 and 4):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::<YOUR_BUCKET_NAME>",
        "arn:aws:s3:::<YOUR_BUCKET_NAME>/stopspotter/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::<ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>"
    }
  ]
}
```

### 7. Add GitHub repo variables

GitHub repo → **Settings → Secrets and variables → Actions → Variables
tab** (none of these are secret — they're ARNs/IDs, not credentials, same
reasoning as the existing `CLOUDFLARE_ACCOUNT_ID` variable):

| Variable | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | the role ARN from step 6 |
| `AWS_REGION` | the region you created the S3 bucket in (step 1) |
| `AWS_S3_BUCKET` | the bucket name from step 1 |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | the distribution ID from step 4 |

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and (if used)
`VITE_GOOGLE_MAPS_API_KEY` should already exist as repo **secrets** from
the Cloudflare/GitHub Pages setup — `deploy-aws.yml` reuses them, nothing
new needed there. If they're missing, check `docs/SETUP.md` §4 and §13.

### 8. Deploy

Push to `main`, or run **Actions → "Deploy to AWS (S3 + CloudFront)" → Run
workflow** manually. First run can take a few minutes end-to-end for
CloudFront to finish propagating the new distribution globally.

### 9. Supabase Auth redirect URL

Add `https://nextstop.airestop.co.uk/stopspotter/spot/signup` to
Supabase's allowed redirect URLs (Supabase dashboard → Authentication →
URL Configuration → Redirect URLs — see `docs/SETUP.md` §5 for the general
pattern), or magic-link sign-in will fail silently on this domain.

## Verification checklist

- [ ] `https://nextstop.airestop.co.uk/stopspotter` loads the app
- [ ] A direct load of a client-side route (e.g.
      `https://nextstop.airestop.co.uk/stopspotter/stop/<some-id>`) also
      loads correctly, not a CloudFront/S3 error page — confirms the
      CloudFront Function is attached and working
- [ ] The map shows real nomination data (confirms Supabase env vars made
      it into this build)
- [ ] Magic-link sign-in completes and returns to the app (confirms the
      Supabase redirect URL from step 9)
- [ ] `nextstop.airestop.co.uk`'s existing/future sibling records
      (`airestop.co.uk`'s MX/SPF/DKIM for Brevo, etc.) are unaffected —
      this setup only ever touched `nextstop.airestop.co.uk` itself

## Troubleshooting

**CloudFront serves a 403 instead of the app**
Usually the OAC bucket policy didn't attach correctly, or the sync in step
8 hasn't run yet so the bucket is empty. Check **S3 → bucket → Permissions
→ Bucket policy** matches step 4's expected policy, and that
`s3://<bucket>/stopspotter/index.html` actually exists.

**A direct load of `/stopspotter/stop/abc123` 403s or 404s, but
`/stopspotter` itself works**
The CloudFront Function isn't attached to the `/stopspotter/*` behavior,
or wasn't **Published** (not just saved) in step 3. Re-check **CloudFront
→ distribution → Behaviors → /stopspotter/\* → Function associations**.

**GitHub Actions fails at the "configure-aws-credentials" step with
`AccessDenied` / `Not authorized to perform sts:AssumeRoleWithWebIdentity`**
Check the role's trust policy `sub` condition exactly matches
`repo:jamspr95/StopSpotter:ref:refs/heads/main` (a typo'd repo name or
branch ref is the most common cause), and that `AWS_DEPLOY_ROLE_ARN` in
GitHub's repo variables matches the role you actually created.

**Certificate stuck in `PENDING_VALIDATION`**
The CNAME validation record either isn't in Route 53 yet, or doesn't
exactly match what `describe-certificate` printed (trailing dots, extra
whitespace, and quoting all trip this up — copy the `Name`/`Value` fields
verbatim). DNS propagation can also just take a while; give it up to a few
hours before investigating further.

**Site loads but shows no nomination data / console shows a Supabase
error**
Confirm step 7's three `VITE_SUPABASE_*` secrets exist and are correct —
if the build ran without them, the app silently falls back to local-only
mode (`src/lib/supabaseClient.ts`) with no network calls at all, which
looks like "it loads but there's no data," not an error.

## If something needs to be undone

Nothing here is destructive to existing infrastructure — if you need to
back out at any point:

- **Route 53**: delete the `nextstop.airestop.co.uk` record (step 5) —
  instantly stops routing traffic there, nothing else on the zone is
  affected.
- **CloudFront / S3 / ACM / IAM role**: can all be deleted independently
  without side effects on anything else in the account, since every
  resource created here is scoped to this one subdomain/prefix.
- **GitHub repo variables** (step 7): remove them and `deploy-aws.yml`
  will simply fail on its next run instead of deploying — it has no effect
  on `deploy.yml` (GitHub Pages) or `deploy-cloudflare.yml`, which are
  fully independent workflows.
